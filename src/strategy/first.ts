import { Order } from '@binance/connector';
import Debug from 'debug';
import { Decimal } from 'decimal.js';
import * as math from 'mathjs';

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
  LOWEST_QUANTITY_ASSETS_TO_NOT_TRADE,
  Z_SCORE_THRESHOLD_TO_SELL,
} from './strategy.config';

export { QUOTE_BASE_TICKER };

type WalletProportion = { [asset: string]: number };

export const getWalletProportion = async (): Promise<WalletProportion> => {
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

export const getWalletProportionTickers = (wallet: WalletProportion) =>
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

  const ratio = tickers.reduce((acc, ticker) => {
    acc[ticker] =
      (currentWalletProportion[ticker] -
        targetWalletProportionNormalized[ticker]) /
      targetWalletProportionNormalized[ticker];
    return acc;
  }, {} as { [ticker: string]: number });

  const findTickerByRatio = (ratioValue: number) =>
    tickers.find((ticker) => ratio[ticker] === ratioValue) as string;

  const sortedAssetsByRatioByAscending = Object.values(ratio)
    .sort((a, b) => a - b)
    .map((ratioValue) => findTickerByRatio(ratioValue));

  const minRatio = Math.min(...Object.values(ratio));

  const maxRatio = Math.max(...Object.values(ratio));

  const lowest = findTickerByRatio(minRatio);

  const highest = findTickerByRatio(maxRatio);

  const ratioMean = math.mean(Object.values(ratio));

  const ratioStd = math.std(Object.values(ratio));

  const zScore = tickers.reduce((acc, ticker) => {
    acc[ticker] = (ratio[ticker] - ratioMean) / ratioStd;
    return acc;
  }, {} as { [ticker: string]: number });

  const zScoreAmplitude =
    Math.max(...Object.values(zScore)) - Math.min(...Object.values(zScore));

  return {
    highest,
    lowest,
    ratio,
    currentWalletProportion,
    sortedAssetsByRatioByAscending,
    zScore,
    zScoreAmplitude,
  };
};

/**
 * Multiplied by `MIN_NOTIONAL_MULTIPLIER` to have a margin for filters.
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
  asset,
}: {
  strategyData: StrategyData;
  walletProportion: WalletProportion;
  asset?: string;
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

  /**
   * When `asset` is defined, it's because it's a second buy.
   */
  const assetToBuy = asset || lowest;

  const order = await buyOrder({ quoteOrderQty, asset: assetToBuy });

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
    `${buyItem.assetQuantity} of ${assetToBuy} was brought by $${
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

/**
 * Check if the asset the asset will become the lowest ratio if sold and the
 * same value buy the current lowest ratio.
 */
export const willAssetBeTheLowestIfSold = ({
  asset,
  strategyData,
  walletProportion,
}: {
  asset: string;
  strategyData: StrategyData;
  walletProportion: WalletProportion;
}) => {
  const { lowest: currentLowest } = getExtremeProportions({
    walletProportion,
    strategyData,
  });

  const newStrategyData: typeof strategyData = JSON.parse(
    JSON.stringify(strategyData)
  );

  const totalToTrade = 3 * strategyData.minNotional;

  newStrategyData.assets[asset].totalValue -= totalToTrade;
  newStrategyData.assets[currentLowest].totalValue += totalToTrade;

  const newExtremeValues = getExtremeProportions({
    strategyData: newStrategyData,
    walletProportion,
  });

  return newExtremeValues.lowest === asset;
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
  const { sortedAssetsByRatioByAscending, zScore } = getExtremeProportions({
    strategyData,
    walletProportion,
  });

  const lowestRatioAssets = sortedAssetsByRatioByAscending.slice(
    0,
    LOWEST_QUANTITY_ASSETS_TO_NOT_TRADE
  );

  const filtered = lowestBuyPrices
    .map((item) => ({
      ...item,
      profit: calculateItemProfit({ item, strategyData }),
      zScore: zScore[item.pk],
    }))
    /**
     * Remove the assets with the lowest ratio.
     */
    .filter((item) => !lowestRatioAssets.includes(item.pk))
    /**
     * Only return the items that have positive profit or if it has a huge
     * z-score.
     */
    .filter(
      (item) =>
        item.profit > MIN_PROFIT || item.zScore > Z_SCORE_THRESHOLD_TO_SELL
    )
    /**
     * Don't sell assets that have totalValue less than
     * MIN_NOTIONAL_TO_TRADE effective minNotional.
     */
    .filter(
      (item) =>
        strategyData.assets[item.pk].totalValue >
        MIN_NOTIONAL_TO_TRADE * getEffectiveMinNotional({ strategyData })
    )
    /**
     * Don't sell if the asset will become the lowest if sold.
     */
    .filter(
      (item) =>
        !willAssetBeTheLowestIfSold({
          asset: item.pk,
          strategyData,
          walletProportion,
        })
    )
    /**
     * From the most profitable to the least profitable.
     */
    .sort((a, b) => b.profit - a.profit);

  return filtered;
};

export const executeAssetsOperation = async ({
  strategyData,
  walletProportion,
}: {
  strategyData: StrategyData;
  walletProportion: WalletProportion;
}): Promise<false | SellOrderOnDatabase> => {
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

  const itemToSell = lowestBuyPrices[0];

  if (!itemToSell) {
    debug('There are no items to sell.');
    return false;
  }

  debug({ itemToSell });

  try {
    const order = await sellBoughtAsset({
      strategyData,
      item: itemToSell,
    });

    if (!wasOrderSuccessful({ order })) {
      debug(`Sell order was not successful`);
      return false;
    }

    const sellItem = await saveSellOrder({
      order,
      buyItem: itemToSell,
    });

    /**
     * `sellItem`: item that was sold.
     * `mostProfitableAsset`: that was bought before and was sold as `sellItem`.
     */
    const profit =
      (sellItem.quotePrice - itemToSell.quotePrice) * sellItem.assetQuantity;

    await Promise.all([
      slack.send(
        `${sellItem.assetQuantity} of ${sellItem.pk} was *SOLD* by $${sellItem.quotePrice}. It was bought by $${itemToSell.quotePrice} (profit of $${profit}).`
      ),
      updateBuyOrderStatus({ buyItem: itemToSell, sellItem }),
      updateWalletAssetsEarned({ order }),
    ]);

    return sellItem;
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

      const { lowest: lowestAssetBeforeSecondQuoteOperation } =
        getExtremeProportions({
          strategyData,
          walletProportion,
        });

      /**
       * Get updated data.
       */
      const newStrategyData = await getStrategyData(tickers);

      await executeQuoteOperation({
        strategyData: newStrategyData,
        walletProportion,
        asset: lowestAssetBeforeSecondQuoteOperation,
      });
    }
  }

  debug('First Strategy Finished');
};

export const slackLogs = async () => {
  const walletProportion = await getWalletProportion();

  const tickers = getWalletProportionTickers(walletProportion);

  const strategyData = await getStrategyData(tickers);

  const { zScore } = getExtremeProportions({
    strategyData,
    walletProportion,
  });

  const total = Object.values(strategyData.assets).reduce(
    (acc, asset) => acc + asset.totalValue,
    0
  );

  let text = tickers
    .sort(
      (a, b) =>
        strategyData.assets[b].totalValue - strategyData.assets[a].totalValue
    )
    .map((ticker) => {
      const r = Math.round(zScore[ticker] * 100) / 100;
      const v = strategyData.assets[ticker].totalValue.toFixed(2);
      const q = strategyData.assets[ticker].quantity.toPrecision(6);
      return `• ${ticker} (*${r}*): $${v} --- Qty: ${q}`;
    })
    .join('\n');

  text += `\n\nTotal: $${total.toFixed(2)}`;

  await slack.send({
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text,
        },
      },
    ],
  });
};
