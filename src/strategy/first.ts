import { Order } from '@binance/connector';
import Debug from 'debug';
import { Decimal } from 'decimal.js';

import {
  getStrategyData,
  StrategyData,
  buyOrder,
  sellOrder,
  QUOTE_BASE_TICKER,
} from '../api/binance';
import * as database from '../api/database';
import { slack } from '../api/slack';

import { isProduction } from '../config';

import { WALLET } from './wallet';

import {
  MIN_NOTIONAL_MULTIPLIER,
  MIN_NOTIONAL_TO_TRADE,
  MIN_PROFIT,
  TRADE_FEE,
} from './strategy.config';

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

  return { highest, lowest, ratio, currentWalletProportion };
};

/**
 * Multiplied by 1.5 to have a margin for filters.
 */
export const getEffectiveMinNotional = ({
  strategyData,
}: {
  strategyData: StrategyData;
}) => strategyData.minNotional * MIN_NOTIONAL_MULTIPLIER;

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

  if (remaining < amount) {
    return false;
  }

  return true;
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

export const getEffectiveAssetAndQuotePropertiesFromBuyOrder = (
  order: Order
) => {
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

type BaseOrderOnDatabase = {
  pk: string;
  sk: string;
  order: Order;
  assetQuantity: number;
  quotePrice: number;
};

type BuyOrderOnDatabase = BaseOrderOnDatabase & {
  status?: string;
  usedDepositsBalance: boolean;
};

export const saveBuyOrder = async ({
  order,
  usedDepositsBalance,
}: {
  order: Order;
  usedDepositsBalance: boolean;
}) => {
  const debug = Debug('CryptoBot:saveBuyOrder');

  debug('Saving buy order');

  const date = new Date().toISOString();

  const { assetQuantity, quotePrice } =
    getEffectiveAssetAndQuotePropertiesFromBuyOrder(order);

  const asset = getAssetFromOrder({ order });

  const status = `BUY_PRICE_${quotePrice}`;

  const item: BuyOrderOnDatabase = {
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

  return item;
};

export const getAssetFromOrder = ({ order }: { order: Order }) => {
  return order.symbol.replace(QUOTE_BASE_TICKER, '');
};

const updateWalletAssetsEarned = async ({ order }: { order: Order }) => {
  const debug = Debug('CryptoBot:updateWalletAssetsEarned');

  const { assetQuantity } =
    getEffectiveAssetAndQuotePropertiesFromBuyOrder(order);

  const asset = getAssetFromOrder({ order });

  const { side } = order;

  const quantity = side === 'BUY' ? assetQuantity : -assetQuantity;

  const data = await database.updateItem({
    key: { pk: 'WALLET', sk: 'CURRENT_EARNINGS' },
    updateExpression: 'ADD #asset :quantity',
    expressionAttributeValues: {
      ':quantity': quantity,
    },
    expressionAttributeNames: {
      '#asset': asset,
    },
  });

  debug({ side, quantity });

  debug(`Update ${asset} earnings: ${data[asset]}`);
};

const wasOrderSuccessful = ({ order }: { order: Order }) => {
  return order.status === 'FILLED';
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

  const asset = lowest;

  const order = await buyOrder({ quoteOrderQty, asset });

  debug(order);

  if (!wasOrderSuccessful({ order })) {
    debug('Buy order was not successful');
    return false;
  }

  const buyItem = await saveBuyOrder({
    order,
    usedDepositsBalance: canUseDepositsBalanceBool,
  });

  await slack.send(
    `${buyItem.assetQuantity} of ${asset} was brought by $${
      buyItem.quotePrice
    }${canUseDepositsBalanceBool ? ' (deposit)' : ''}`
  );

  if (canUseDepositsBalanceBool) {
    debug('Updating used deposits balance');
    await updateUsedDepositsBalance(Number(order.cummulativeQuoteQty));
  } else {
    debug('Cannot update used deposits balance. Updating assets earnings');
    await updateWalletAssetsEarned({ order });
  }

  debug('Quote Operation Finished');

  return true;
};

const getTickersFromStrategyData = ({
  strategyData,
}: {
  strategyData: StrategyData;
}) => Object.keys(strategyData.assets);

export const getAssetBuyOrdersWithLowestBuyPrice = async ({
  asset,
}: {
  asset: string;
}) => {
  const items = await database.query<BuyOrderOnDatabase>({
    keyConditionExpression: 'pk = :pk',
    expressionAttributeValues: { ':pk': asset },
    indexName: 'pk-status-index',
    scanIndexForward: true,
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

  const items = lowestBuyPrices.filter((item) => !!item);

  return items;
};

const getAssetCurrentPrice = ({
  asset,
  strategyData,
}: {
  asset: string;
  strategyData: StrategyData;
}) => {
  return strategyData.assets[asset].price;
};

export const calculateItemProfit = ({
  item,
  strategyData,
}: {
  item: BuyOrderOnDatabase;
  strategyData: StrategyData;
}) => {
  const { quotePrice } = item;
  const currentPrice = getAssetCurrentPrice({ asset: item.pk, strategyData });
  return (currentPrice / quotePrice) * (1 - TRADE_FEE) ** 2 - 1;
};

export const getMostProfitableAsset = ({
  strategyData,
  items,
}: {
  strategyData: StrategyData;
  items: BuyOrderOnDatabase[];
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

type SellOrderOnDatabase = BaseOrderOnDatabase & { buyOrder: string };

export const saveSellOrder = async ({
  order,
  buyItem,
}: {
  order: Order;
  buyItem: BuyOrderOnDatabase;
}) => {
  const debug = Debug('CryptoBot:saveSellOrder');

  debug('Saving sell order');

  const date = new Date().toISOString();

  const { assetQuantity, quotePrice } =
    getEffectiveAssetAndQuotePropertiesFromBuyOrder(order);

  const asset = getAssetFromOrder({ order });

  const item: SellOrderOnDatabase = {
    pk: asset,
    sk: `ORDER_SELL_${date}`,
    order,
    assetQuantity,
    quotePrice,
    buyOrder: [buyItem.pk, buyItem.sk].join('##'),
  };

  await database.putItem({ item });

  debug(item);

  return item;
};

export const updateBuyOrderStatus = async ({
  buyItem,
  sellItem,
}: {
  buyItem: BuyOrderOnDatabase;
  sellItem: SellOrderOnDatabase;
}) => {
  const debug = Debug('CryptoBot:updateBuyOrderStatus');

  debug('Updating buy order status');

  /**
   * By removing status, we can't query for the order thus it won't be sold.
   */
  await database.updateItem({
    key: { pk: buyItem.pk, sk: buyItem.sk },
    updateExpression: 'REMOVE #status SET sellOrder = :sellOrder',
    expressionAttributeValues: {
      ':sellOrder': [sellItem.pk, sellItem.sk].join('##'),
    },
    expressionAttributeNames: { '#status': 'status' },
  });

  debug(`Updated buy order status: ${buyItem.pk}${buyItem.sk}`);
};

const sellBoughtAsset = async ({
  item,
  strategyData,
}: {
  item: BuyOrderOnDatabase;
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

  debug(order);

  return order;
};

const getLowestBuyPricesFiltered = ({
  strategyData,
  walletProportion,
  lowestBuyPrices,
}: {
  strategyData: StrategyData;
  walletProportion: WalletProportion;
  lowestBuyPrices: BuyOrderOnDatabase[];
}) => {
  const { ratio } = getExtremeProportions({ strategyData, walletProportion });

  return (
    lowestBuyPrices
      /**
       * Only return the items that have positive profit.
       */
      .filter((item) => calculateItemProfit({ item, strategyData }) > 0)
      /**
       * Return only that have positive proportion ratio.
       */
      .filter((item) => ratio[item.pk] > 0)
      /**
       * Don't sell assets that have totalValue less than
       * MIN_NOTIONAL_TO_TRADE effective minNotional.
       */
      .filter(
        (item) =>
          strategyData.assets[item.pk].totalValue >
          MIN_NOTIONAL_TO_TRADE * getEffectiveMinNotional({ strategyData })
      )
  );
};

export const executeAssetsOperation = async ({
  strategyData,
  walletProportion,
}: {
  strategyData: StrategyData;
  walletProportion: WalletProportion;
}): Promise<boolean> => {
  const debug = Debug('CryptoBot:executeAssetsOperation');

  debug('Starting Assets Operation');

  const allLowestBuyPrices = await getAssetsBuyOrdersWithLowestBuyPrice({
    strategyData,
  });

  const lowestBuyPrices = getLowestBuyPricesFiltered({
    lowestBuyPrices: allLowestBuyPrices,
    strategyData,
    walletProportion,
  });

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

  debug({
    mostProfitableAsset,
    buyPrice: mostProfitableAsset.quotePrice,
    greatestProfit,
    currentPrice: getAssetCurrentPrice({
      asset: mostProfitableAsset.pk,
      strategyData,
    }),
  });

  if (greatestProfit < MIN_PROFIT) {
    debug(
      `Greatest ${mostProfitableAsset.pk} profit (${greatestProfit}) is too low than the minimal profit: ${MIN_PROFIT}`
    );
    return false;
  }

  try {
    const order = await sellBoughtAsset({
      strategyData,
      item: mostProfitableAsset,
    });

    if (!wasOrderSuccessful({ order })) {
      debug(`Sell order was not successful`);
      return false;
    }

    const sellItem = await saveSellOrder({
      order,
      buyItem: mostProfitableAsset,
    });

    /**
     * Update quote quantity to be used on the next buy order.
     */
    strategyData.assets[QUOTE_BASE_TICKER].quantity +=
      sellItem.assetQuantity * sellItem.quotePrice;

    const profit = Math.round(
      (sellItem.quotePrice / mostProfitableAsset.quotePrice - 1) * 100
    );

    await Promise.all([
      slack.send(
        `${sellItem.assetQuantity} of ${sellItem.pk} was *SOLD* by $${sellItem.quotePrice}. It was bought by $${mostProfitableAsset.quotePrice} (profit of ${profit}%).`
      ),
      updateBuyOrderStatus({ buyItem: mostProfitableAsset, sellItem }),
      updateWalletAssetsEarned({ order }),
    ]);

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

  debug('Executing quote operation for the FIRST time');

  const wasQuoteOperationExecuted = await executeQuoteOperation({
    strategyData,
    walletProportion,
  });

  if (!wasQuoteOperationExecuted) {
    debug('Quote Operation was not executed in the FIRST time');
    debug('Executing Assets Operation');

    const wasAssetsOperationExecuted = await executeAssetsOperation({
      strategyData,
      walletProportion,
    });

    if (wasAssetsOperationExecuted) {
      debug('Executing quote operation for the SECOND time');

      await executeQuoteOperation({
        strategyData,
        walletProportion,
      });
    }
  }

  debug('First Strategy Finished');
};
