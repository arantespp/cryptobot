import { Order } from '@binance/connector';
import Debug from 'debug';

import {
  getStrategyData,
  StrategyData,
  buyOrder,
  QUOTE_BASE_TICKER,
} from '../api/binance';
import * as database from '../api/database';

import { isProduction } from '../config';

export { QUOTE_BASE_TICKER };

type WalletProportion = { [asset: string]: number };

const getWalletProportion = async (): Promise<WalletProportion> => {
  if (isProduction) {
    return {
      BTC: 100,
      ETH: 50,
      ADA: 20,
      VET: 10,
    };
  }

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
  const tickers = getWalletProportionTickers(walletProportion);

  const { assets } = strategyData;

  const walletTotalValue = tickers.reduce(
    (acc, ticker) => acc + (assets[ticker]?.totalValue || 0),
    0
  );

  const currentWalletProportion = tickers.reduce((acc, ticker) => {
    acc[ticker] = (assets[ticker]?.totalValue || 0) / walletTotalValue;
    return acc;
  }, {});

  const targetWalletProportionNormalized =
    getWalletProportionNormalized(walletProportion);

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

export const saveBuyOrder = async ({
  asset,
  order,
}: {
  asset: string;
  order: Order;
}) => {
  const debug = Debug('CryptoBot:saveBuyOrder');

  debug('Saving buy order');

  const date = new Date().toISOString();

  await database.putItem({
    item: { pk: asset, sk: date, status: date, order },
  });
};

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
    debug('Not enough balance. Exit');
    return false;
  }

  const { lowest, highest } = getExtremeProportions({
    strategyData,
    walletProportion,
  });

  const quoteOrderQty = getEffectiveMinNotional({ strategyData });

  debug({ lowest, highest, quoteOrderQty });

  const order = await buyOrder({ quoteOrderQty, asset: lowest });

  debug(order);

  await saveBuyOrder({ asset: lowest, order });

  debug('Quote Operation Finished');
};

export const runFirstStrategy = async () => {
  const debug = Debug('CryptoBot:runFirstStrategy');

  debug('Starting First Strategy');

  const walletProportion = await getWalletProportion();

  const tickers = getWalletProportionTickers(walletProportion);

  const strategyData = await getStrategyData(tickers);

  debug({ strategyData, walletProportion });

  await executeQuoteOperation({ strategyData, walletProportion });

  debug('First Strategy Finished');
};
