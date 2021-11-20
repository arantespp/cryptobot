import {
  getExtremeProportions,
  getWalletProportionNormalized,
  doesHaveEnoughBalance,
  getEffectiveMinNotional,
  QUOTE_BASE_TICKER,
} from './first';

test.each([
  [
    {
      BTC: 100,
      ETH: 50,
    },
    {
      BTC: 0.66666,
      ETH: 0.33333,
    },
  ],
  [
    {
      BTC: 100,
      ETH: 100,
    },
    {
      BTC: 0.5,
      ETH: 0.5,
    },
  ],
  [
    {
      BTC: 1,
      ETH: 2,
      ADA: 3,
      VET: 4,
    },
    {
      BTC: 0.1,
      ETH: 0.2,
      ADA: 0.3,
      VET: 0.4,
    },
  ],
])('getWalletProportionNormalized %#', (wallet, normalized) => {
  const normalizedWallet = getWalletProportionNormalized(wallet);

  Object.keys(normalized).forEach((ticker) => {
    expect(normalizedWallet[ticker]).toBeCloseTo(normalized[ticker]);
  });
});

test.each([
  [
    {
      BTC: 100,
      ETH: 50,
    },
    {
      assets: {
        BTC: {
          totalValue: 300,
        },
        ETH: {
          totalValue: 50,
        },
      },
    },
    { highest: 'BTC', lowest: 'ETH' },
  ],
  [
    {
      BTC: 100,
      ETH: 50,
      ADA: 20,
      VET: 10,
    },
    {
      assets: {
        BTC: {
          totalValue: 300,
        },
        ETH: {
          totalValue: 50,
        },
      },
    },
    { highest: 'BTC', lowest: 'ADA' },
  ],
  [
    {
      BTC: 100,
      ETH: 50,
      ADA: 20,
      VET: 10,
    },
    {
      assets: {
        BTC: {
          totalValue: 100,
        },
        ETH: {
          totalValue: 50,
        },
        ADA: {
          totalValue: 15,
        },
        VET: {
          totalValue: 5,
        },
      },
    },
    { highest: 'BTC', lowest: 'VET' },
  ],
])('getExtremeProportions %#', (walletProportion, strategyData, result) => {
  const extremeProportions = getExtremeProportions({
    strategyData: strategyData as any,
    walletProportion,
  });

  expect(extremeProportions).toEqual(result);
});

test.each([
  [
    { minNotional: 10, assets: { [QUOTE_BASE_TICKER]: { totalValue: 10 } } },
    false,
  ],
  [
    {
      minNotional: 10,
      assets: {
        [QUOTE_BASE_TICKER]: { totalValue: getEffectiveMinNotional(10) },
      },
    },
    true,
  ],
])('doesHaveEnoughBalance %#', (strategyData, response) => {
  expect(doesHaveEnoughBalance({ strategyData: strategyData as any })).toBe(
    response
  );
});
