import {
  getExtremeProportions,
  getWalletProportionNormalized,
  doesHaveEnoughBalance,
  getEffectiveMinNotional,
  QUOTE_BASE_TICKER,
  executeQuoteOperation,
  canUseDepositsBalance,
  getEffectiveAssetAndQuotePropertiesFromBuyOrder,
  getMostProfitableAsset,
  formatAssetQuantity,
  calculateItemProfit,
  getAssetFromOrder,
} from './first';

import * as apiBinanceModule from '../api/binance';
import * as databaseModule from '../api/database';

jest.mock('../api/binance');
jest.mock('../api/database');

test.skip.each([
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

    jest
      .spyOn(databaseModule, 'getItem')
      .mockResolvedValue({ used: 1000, deposits: [{ amount: 1000 }] });

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

test.each(['ETH', 'ADA', 'BTC'])('getAssetFromOrder %s', (asset) => {
  const order = { symbol: `${asset}${QUOTE_BASE_TICKER}` } as any;
  expect(getAssetFromOrder({ order })).toBe(asset);
});

test.each([
  [
    { pk: 'BTC', quotePrice: 100 },
    {
      assets: {
        BTC: {
          price: 1000,
        },
      },
    },
    9,
  ],
  [
    { pk: 'BTC', quotePrice: 100 },
    {
      assets: {
        BTC: {
          price: 100,
        },
      },
    },
    0,
  ],
])('calculateItemProfit %#', (item, strategyData, result) => {
  expect(calculateItemProfit({ item, strategyData } as any)).toEqual(result);
});

test.each([
  [
    0.123456789,
    [
      {
        filterType: 'LOT_SIZE',
        minQty: '0.00001000',
        maxQty: '9000.00000000',
        stepSize: '0.00001000',
      },
    ],
    0.12345,
  ],
  [
    1234.123456789,
    [
      {
        filterType: 'LOT_SIZE',
        minQty: '0.00001000',
        maxQty: '9000.00000000',
        stepSize: '0.00001000',
      },
    ],
    1234.12345,
  ],
  [
    0.00000789,
    [
      {
        filterType: 'LOT_SIZE',
        minQty: '0.00001000',
        maxQty: '9000.00000000',
        stepSize: '0.00001000',
      },
    ],
    0,
  ],
])('formatAssetQuantity %#', (assetQuantity, filters, result) => {
  expect(formatAssetQuantity({ assetQuantity, filters: filters as any })).toBe(
    result
  );
});

test.each([
  [
    {
      assets: {
        BTC: {
          price: 1010,
        },
        ETH: {
          price: 110,
        },
        ADA: {
          price: 20,
        },
      },
    },
    [
      { pk: 'BTC', quotePrice: 1000 },
      { pk: 'ADA', quotePrice: 10 },
      { pk: 'ETH', quotePrice: 100 },
    ],
    { positionOfTheMostProfitableItem: 1 },
  ],
  [
    {
      assets: {
        BTC: {
          price: 1,
        },
        ETH: {
          price: 110,
        },
        ADA: {
          price: 20,
        },
      },
    },
    [
      { pk: 'BTC', quotePrice: 1000 },
      { pk: 'ADA', quotePrice: 10 },
      { pk: 'ETH', quotePrice: 100 },
    ],
    { positionOfTheMostProfitableItem: 1 },
  ],
])(
  'getMostProfitableAsset',
  (strategyData, items, { positionOfTheMostProfitableItem }) => {
    expect(getMostProfitableAsset({ strategyData, items } as any)).toEqual(
      items[positionOfTheMostProfitableItem]
    );
  }
);

test.each([
  [{ used: 1000, amount: 1000, quantityToBuy: 100, canUse: false }],
  [{ used: 900, amount: 1000, quantityToBuy: 10, canUse: true }],
])(
  'canUseDepositsBalance %#',
  async ({ used, amount, quantityToBuy, canUse }) => {
    jest
      .spyOn(databaseModule, 'getItem')
      .mockResolvedValue({ used, deposits: [{ amount }] });

    expect(await canUseDepositsBalance(quantityToBuy)).toBe(canUse);
  }
);

test.each([
  [
    { fills: [{ price: 10000, qty: 100 }] },
    { assetQuantity: 99.9, quotePrice: 10000 },
  ],
  [
    {
      fills: [
        { price: 10000, qty: 100 },
        { price: 10000, qty: 100 },
      ],
    },
    { assetQuantity: 199.8, quotePrice: 10000 },
  ],
  [
    {
      fills: [
        { price: 10000, qty: 100 },
        { price: 5000, qty: 100 },
      ],
    },
    { assetQuantity: 199.8, quotePrice: 7500 },
  ],
])('getEffectiveAssetAndQuotePropertiesFromBuyOrder %#', (order, result) => {
  expect(getEffectiveAssetAndQuotePropertiesFromBuyOrder(order as any)).toEqual(
    result
  );
});

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

  expect(extremeProportions).toMatchObject(result);
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
