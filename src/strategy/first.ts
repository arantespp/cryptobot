import {
  getStrategyData,
  StrategyData,
  buyOrder,
  QUOTE_BASE_TICKER,
} from '../api/binance';

export { QUOTE_BASE_TICKER };

type WalletProportion = { [asset: string]: number };

const getWalletProportion = async () => {
  return {
    BTC: 100,
    ETH: 50,
    ADA: 20,
    VET: 10,
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

export const executeQuoteOperation = async ({
  strategyData,
  walletProportion,
}: {
  strategyData: StrategyData;
  walletProportion: WalletProportion;
}) => {
  if (!doesHaveEnoughBalance({ strategyData })) {
    return false;
  }

  const { lowest } = getExtremeProportions({
    strategyData,
    walletProportion,
  });

  const quoteOrderQty = getEffectiveMinNotional({ strategyData });

  await buyOrder({ quoteOrderQty, asset: lowest });
};

export const runFirstStrategy = async () => {
  const walletProportion = await getWalletProportion();

  const tickers = getWalletProportionTickers(await getWalletProportion());

  const strategyData = await getStrategyData(tickers);

  return getExtremeProportions({ strategyData, walletProportion });
};
