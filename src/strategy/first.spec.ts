import {
  getExtremeProportions,
  getWalletProportionNormalized,
  doesHaveEnoughBalance,
  getEffectiveMinNotional,
  QUOTE_BASE_TICKER,
  executeQuoteOperation,
} from './first';

import * as apiBinanceModule from '../api/binance';

jest.mock('../api/binance');

test.each([
  [
    'buy ETH',
    {
      BTC: 100,
      ETH: 100,
      ADA: 100,
    },
    {
      minNotional: 10,
      assets: {
        [QUOTE_BASE_TICKER]: { totalValue: 1000 },
        BTC: {
          totalValue: 100,
        },
        ETH: {
          totalValue: 50,
        },
        ADA: {
          totalValue: 100,
        },
      },
    },
    'ETH',
  ],
  [
    'buy ADA',
    {
      BTC: 100,
      ETH: 100,
      ADA: 100,
    },
    {
      minNotional: 10,
      assets: {
        [QUOTE_BASE_TICKER]: { totalValue: 1000 },
        BTC: {
          totalValue: 99,
        },
        ETH: {
          totalValue: 90,
        },
        ADA: {
          totalValue: 50,
        },
      },
    },
    'ADA',
  ],
])(
  'executeQuoteOperation %#: %s',
  async (_, walletProportion, strategyData, assetToBuy) => {
    const buyOrderMock = jest.spyOn(apiBinanceModule, 'buyOrder');

    await executeQuoteOperation({
      strategyData: strategyData as any,
      walletProportion,
    });

    const quoteOrderQty = getEffectiveMinNotional({
      strategyData: strategyData as any,
    });

    expect(buyOrderMock).toHaveBeenCalledWith({
      asset: assetToBuy,
      quoteOrderQty,
    });
  }
);

test('does not buy because does not have enough balance', async () => {
  const buyOrderMock = jest.spyOn(apiBinanceModule, 'buyOrder');

  await executeQuoteOperation({
    strategyData: {
      minNotional: 10,
      assets: {
        [QUOTE_BASE_TICKER]: { totalValue: 0 },
        BTC: {
          totalValue: 300,
        },
        ETH: {
          totalValue: 50,
        },
      },
    } as any,
    walletProportion: {
      BTC: 100,
      ETH: 50,
    },
  });

  expect(buyOrderMock).not.toHaveBeenCalled();
});

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
        [QUOTE_BASE_TICKER]: {
          totalValue: getEffectiveMinNotional({
            strategyData: { minNotional: 10 } as any,
          }),
        },
      },
    },
    true,
  ],
])('doesHaveEnoughBalance %#', (strategyData, response) => {
  expect(doesHaveEnoughBalance({ strategyData: strategyData as any })).toBe(
    response
  );
});
