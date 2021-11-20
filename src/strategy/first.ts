import { Order } from '@binance/connector';
import Debug from 'debug';
import cron from 'node-cron';

import {
  getStrategyData,
  StrategyData,
  buyOrder,
  QUOTE_BASE_TICKER,
} from '../api/binance';
import * as database from '../api/database';

import { isProduction } from '../config';

import { WALLET } from './wallet';

export { QUOTE_BASE_TICKER };

type WalletProportion = { [asset: string]: number };

const getWalletProportion = async (): Promise<WalletProportion> => {
  if (isProduction) {
    return WALLET;
  }

  /**
   * Test mode wallet.
   */
  return {
    BTC: 100,
    ETH: 50,
    BNB: 20,
    LTC: 20,
  };
};

const getWalletProportionTickers = (wallet: WalletProportion) =>
  Object.keys(wallet);

export const getWalletProportionNormalized = (wallet: WalletProportion) => {
  const walletTickers = Object.keys(wallet);

  const walletProportionSum = walletTickers.reduce(
    (sum, ticker) => sum + wallet[ticker],
    0
  );

  const normalized = { ...wallet };

  walletTickers.forEach((ticker) => {
    normalized[ticker] /= walletProportionSum;
  });

  return normalized;
};

/**
 *
 * @param strategyData: StrategyData
 * @returns object.highest: ticker of the highest proportion in the wallet.
 *          object.lowest: ticker of the lowest proportion in the wallet.
 */
export const getExtremeProportions = ({
  strategyData,
  walletProportion,
}: {
  strategyData: StrategyData;
  walletProportion: WalletProportion;
}) => {
  const debug = Debug('CryptoBot:getExtremeProportions');

  const tickers = getWalletProportionTickers(walletProportion);

  const { assets } = strategyData;

  const walletTotalValue = tickers.reduce(
    (acc, ticker) => acc + (assets[ticker]?.totalValue || 0),
    0
  );

  const currentWalletProportion = tickers.reduce((acc, ticker) => {
    acc[ticker] = (assets[ticker]?.totalValue || 0) / (walletTotalValue || 1);
    return acc;
  }, {});

  const targetWalletProportionNormalized =
    getWalletProportionNormalized(walletProportion);

  debug({ currentWalletProportion, targetWalletProportionNormalized });

  const ratio = tickers.reduce((acc, ticker) => {
    acc[ticker] =
      (currentWalletProportion[ticker] -
        targetWalletProportionNormalized[ticker]) /
      targetWalletProportionNormalized[ticker];
    return acc;
  }, {} as { [ticker: string]: number });

  const maxRatio = Math.max(...Object.values(ratio));

  const minRatio = Math.min(...Object.values(ratio));

  const highest = tickers.find(
    (ticker) => ratio[ticker] === maxRatio
  ) as string;

  const lowest = tickers.find((ticker) => ratio[ticker] === minRatio) as string;

  debug({ highest, lowest, ratio, maxRatio, minRatio });

  return { highest, lowest };
};

/**
 * Multiplied by 1.5 to have a margin for filters.
 */
export const getEffectiveMinNotional = ({
  strategyData,
}: {
  strategyData: StrategyData;
}) => strategyData.minNotional * 1.5;

export const doesHaveEnoughBalance = ({
  strategyData,
}: {
  strategyData: StrategyData;
}) => {
  return (
    strategyData.assets[QUOTE_BASE_TICKER].totalValue >=
    getEffectiveMinNotional({ strategyData })
  );
};

const DEPOSITS_KEY = {
  pk: QUOTE_BASE_TICKER,
  sk: 'DEPOSITS',
};

type Deposits = {
  deposits: { amount: number }[];
  used: number;
};

export const canUseDepositsBalance = async (amount: number) => {
  const debug = Debug('CryptoBot:canUseDepositsBalance');

  const { used, deposits } = await database.getItem<Deposits>(DEPOSITS_KEY);

  const sumDeposits = deposits.reduce((acc, { amount }) => acc + amount, 0);

  const remaining = sumDeposits - used;

  const canUse = remaining >= amount;

  debug({ sumDeposits, used, remaining, canUse });

  return canUse;
};

export const updateUsedDepositsBalance = async (amount: number) => {
  const debug = Debug('CryptoBot:updateUsedDepositsBalance');

  const { used } = await database.updateItem({
    key: DEPOSITS_KEY,
    updateExpression: 'ADD used :amount',
    expressionAttributeValues: { ':amount': amount },
  });

  debug({ newUsed: used, amount });
};

export const getAssetAndQuotePropertiesFromBuyOrder = (order: Order) => {
  const debug = Debug('CryptoBot:getAssetAndQuotePropertiesFromBuyOrder');

  const fills = order.fills.map((fill) => ({
    ...fill,
    effectiveQuantity: Number(fill.qty) - Number(fill.commission),
  }));

  /**
   * It'll be the same amount that will be sold in the sell order.
   */
  const assetQuantity = fills.reduce(
    (acc, { effectiveQuantity }) => acc + effectiveQuantity,
    0
  );

  /**
   * It'll be used to determine if this croton is profitable.
   */
  const quotePrice =
    fills.reduce(
      (acc, { effectiveQuantity, price }) =>
        acc + effectiveQuantity * Number(price),
      0
    ) / assetQuantity;

  debug({ assetQuantity, quotePrice, order });

  return { assetQuantity, quotePrice };
};

export const saveBuyOrder = async ({
  asset,
  order,
  usedDepositsBalance,
}: {
  asset: string;
  order: Order;
  usedDepositsBalance: boolean;
}) => {
  const debug = Debug('CryptoBot:saveBuyOrder');

  debug('Saving buy order');

  const date = new Date().toISOString();

  const { assetQuantity, quotePrice } =
    getAssetAndQuotePropertiesFromBuyOrder(order);

  const status = `BUY_PRICE_${quotePrice}`;

  const item = {
    pk: asset,
    sk: `ORDER_BUY_${date}`,
    status,
    order,
    usedDepositsBalance,
    assetQuantity,
    quotePrice,
  };

  debug('Saving item');

  await database.putItem({ item });

  debug(item);
};

/**
 * Quote operation is the same as buy assets using the quote currency.
 */
export const executeQuoteOperation = async ({
  strategyData,
  walletProportion,
}: {
  strategyData: StrategyData;
  walletProportion: WalletProportion;
}) => {
  const debug = Debug('CryptoBot:executeQuoteOperation');

  debug('Starting Quote Operation');

  if (!doesHaveEnoughBalance({ strategyData })) {
    debug('Not enough balance');
    return false;
  }

  const { lowest, highest } = getExtremeProportions({
    strategyData,
    walletProportion,
  });

  const quoteOrderQty = getEffectiveMinNotional({ strategyData });

  const canUseDepositsBalanceBool = await canUseDepositsBalance(quoteOrderQty);

  debug({ lowest, highest, quoteOrderQty, canUseDepositsBalanceBool });

  const order = await buyOrder({ quoteOrderQty, asset: lowest });

  debug(order);

  await saveBuyOrder({
    asset: lowest,
    order,
    usedDepositsBalance: canUseDepositsBalanceBool,
  });

  if (canUseDepositsBalanceBool) {
    debug('Updating used deposits balance');
    await updateUsedDepositsBalance(Number(order.cummulativeQuoteQty));
  } else {
    debug('Cannot update used deposits balance');
  }

  debug('Quote Operation Finished');

  return true;
};

export const executeAssetsOperation = async () => {
  const debug = Debug('CryptoBot:executeAssetsOperation');
  debug('Starting Assets Operation');
};

export const runFirstStrategy = async () => {
  const debug = Debug('CryptoBot:runFirstStrategy');

  debug('Run First Strategy');

  const walletProportion = await getWalletProportion();

  const tickers = getWalletProportionTickers(walletProportion);

  const strategyData = await getStrategyData(tickers);

  debug({ strategyData, walletProportion });

  debug('Executing quote operation for the first time');

  const wasQuoteOperationExecuted = await executeQuoteOperation({
    strategyData,
    walletProportion,
  });

  if (!wasQuoteOperationExecuted) {
    debug('Quote Operation was not executed in the first time');
    debug('Executing Assets Operation');

    await executeAssetsOperation();

    debug('Executing Quote Operation for the second time');

    executeQuoteOperation({
      strategyData,
      walletProportion,
    });
  }

  debug('First Strategy Finished');
};

export const startStrategy = () => {
  console.log('Starting Strategy' + isProduction ? ' in production mode' : '');
  cron.schedule('* * * * *', runFirstStrategy);
};
