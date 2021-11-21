import { Order } from '@binance/connector';
import Debug from 'debug';
import { Decimal } from 'decimal.js';
import cron from 'node-cron';

import {
  getStrategyData,
  StrategyData,
  buyOrder,
  sellOrder,
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

export const TRADE_FEE = 0.001;

export const getAssetAndQuotePropertiesFromBuyOrder = (order: Order) => {
  const debug = Debug('CryptoBot:getAssetAndQuotePropertiesFromBuyOrder');

  const fills = order.fills.map((fill) => ({
    ...fill,
    effectiveQuantity: Number(fill.qty) * (1 - TRADE_FEE),
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
}): Promise<boolean> => {
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
    /**
     * TODO: update assets quantity.
     */
  }

  debug('Quote Operation Finished');

  return true;
};

const getTickersFromStrategyData = ({
  strategyData,
}: {
  strategyData: StrategyData;
}) => Object.keys(strategyData.assets);

type BuyItem = {
  pk: string;
  sk: string;
  order: Order;
  assetQuantity: number;
  quotePrice: number;
};

const getAssetBuyOrdersWithLowestBuyPrice = async ({
  asset,
}: {
  asset: string;
}) => {
  const items = await database.query<BuyItem>({
    keyConditionExpression: 'pk = :pk',
    expressionAttributeValues: { ':pk': asset },
    indexName: 'pk-status-index',
    scanIndexForward: false,
    limit: 1,
  });

  const itemWithLowestBuyPrice = items[0];

  return itemWithLowestBuyPrice;
};

const getAssetsBuyOrdersWithLowestBuyPrice = async ({
  strategyData,
}: {
  strategyData: StrategyData;
}) => {
  const assets = getTickersFromStrategyData({ strategyData });

  const lowestBuyPrices = await Promise.all(
    assets.map((asset) => getAssetBuyOrdersWithLowestBuyPrice({ asset }))
  );

  return lowestBuyPrices.filter((item) => !!item);
};

const calculateItemProfit = ({
  item,
  strategyData,
}: {
  item: BuyItem;
  strategyData: StrategyData;
}) => {
  const { quotePrice } = item;
  const currentPrice = strategyData.assets[item.pk].price;
  return (currentPrice - quotePrice) / quotePrice;
};

export const getMostProfitableAsset = ({
  strategyData,
  items,
}: {
  strategyData: StrategyData;
  items: BuyItem[];
}) => {
  const mostProfitableAsset = items.reduce((acc, cur) => {
    return calculateItemProfit({ strategyData, item: cur }) >
      calculateItemProfit({ strategyData, item: acc })
      ? cur
      : acc;
  }, items[0]);

  return mostProfitableAsset;
};

export const formatAssetQuantity = ({
  assetQuantity,
  filters = [],
}: {
  filters: StrategyData['assets'][string]['filters'];
  assetQuantity: number;
}): number => {
  let value = new Decimal(assetQuantity);

  const lotSizeFilter = filters.find(
    (filter) => filter?.filterType === 'LOT_SIZE'
  );

  if (lotSizeFilter && lotSizeFilter.filterType === 'LOT_SIZE') {
    const stepSize = new Decimal(Number(lotSizeFilter.stepSize));
    value = value.toDecimalPlaces(stepSize.decimalPlaces(), Decimal.ROUND_DOWN);

    if (value.lessThan(Number(lotSizeFilter.minQty))) {
      return 0;
    }
  }

  return value.toNumber();
};

const sellBoughtAsset = async ({
  item,
  strategyData,
}: {
  item: BuyItem;
  strategyData: StrategyData;
}) => {
  const debug = Debug('CryptoBot:sellBoughtAsset');

  const asset = item.pk;

  debug(`Selling bought asset ${asset}`);

  const quantity = formatAssetQuantity({
    assetQuantity: item.assetQuantity,
    filters: strategyData.assets[asset].filters,
  });

  const order = await sellOrder({ asset, quantity });

  /**
   * TODO
   * - Save order to database
   * - Update buy order origin status
   * - Update assets quantity. How many assets was subtracted from the wallet
   *   because the sell order?
   */
  console.log({ quantity, order });
};

export const MIN_PROFIT = 0.05;

export const executeAssetsOperation = async ({
  strategyData,
  walletProportion,
}: {
  strategyData: StrategyData;
  walletProportion: WalletProportion;
}): Promise<boolean> => {
  const debug = Debug('CryptoBot:executeAssetsOperation');

  debug('Starting Assets Operation');

  const { lowest } = getExtremeProportions({
    strategyData,
    walletProportion,
  });

  const lowestBuyPrices = (
    await getAssetsBuyOrdersWithLowestBuyPrice({
      strategyData,
    })
  )
    /**
     * Remove the lowest proportion ration because we don't want to sell it
     * and after buy again.
     */
    .filter(({ pk }) => pk !== lowest)
    /**
     * Only return the items that have positive profit.
     */
    .filter((item) => calculateItemProfit({ item, strategyData }) > 0);

  if (lowestBuyPrices.length === 0) {
    debug('There are no profitable assets');
    return false;
  }

  const mostProfitableAsset = getMostProfitableAsset({
    strategyData,
    items: lowestBuyPrices,
  });

  const greatestProfit = calculateItemProfit({
    strategyData,
    item: mostProfitableAsset,
  });

  debug({ mostProfitableAsset, greatestProfit });

  if (greatestProfit < MIN_PROFIT) {
    debug(
      `Greatest profit (${greatestProfit}) is too low than the minimal profit: ${MIN_PROFIT}`
    );
    return false;
  }

  try {
    await sellBoughtAsset({ strategyData, item: mostProfitableAsset });

    return true;
  } catch (error) {
    debug('Cannot perform selling order. Error:');
    console.error(error);
    return false;
  }
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

    const wasAssetsOperationExecuted = await executeAssetsOperation({
      strategyData,
      walletProportion,
    });

    if (wasAssetsOperationExecuted) {
      debug('Executing Quote Operation for the second time');

      executeQuoteOperation({
        strategyData,
        walletProportion,
      });
    }
  }

  debug('First Strategy Finished');
};

export const startStrategy = () => {
  console.log(
    'Starting Strategy' + (isProduction ? ' in production mode' : '')
  );

  cron.schedule('* * * * *', runFirstStrategy);
};
