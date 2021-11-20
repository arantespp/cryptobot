import { getStrategyStatus, Status } from '../api/exchange';

const walletProportion = {
  BTC: 100,
  ETH: 50,
  ADA: 20,
  VET: 10,
} as const;

const tickers = Object.keys(walletProportion);

const walletProportionNormalized = (() => {
  const walletProportionSum = tickers.reduce(
    (sum, ticker) => sum + walletProportion[ticker],
    0
  );

  const normalized = { ...walletProportion };

  tickers.forEach((ticker) => {
    normalized[ticker] /= walletProportionSum;
  });

  return normalized;
})();

/**
 *
 * @param status
 * @returns object.highest: ticker of the highest proportion in the wallet.
 *          object.lowest: ticker of the lowest proportion in the wallet.
 */
const getExtremeProportions = (status: Status) => {
  const walletTotalValue = tickers.reduce(
    (acc, ticker) => acc + status[ticker].totalValue,
    0
  );

  const currentWalletProportion = tickers.reduce((acc, ticker) => {
    acc[ticker] = status[ticker].totalValue / walletTotalValue;
    return acc;
  }, {});

  const ratio = tickers.reduce((acc, ticker) => {
    acc[ticker] =
      (currentWalletProportion[ticker] - walletProportion[ticker]) /
      walletProportion[ticker];
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

export const runFirstStrategy = async () => {
  const status = await getStrategyStatus(tickers);

  return getExtremeProportions(status);
};
