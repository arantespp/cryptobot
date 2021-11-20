/**
 * https://binance.github.io/binance-connector-node/module-Market.html
 */
import { Spot, ExchangeInfo } from '@binance/connector';
import merge from 'deepmerge';

const { BINANCE_API_KEY, BINANCE_SECRET_KEY, BINANCE_BASE_URL } = process.env;

export const QUOTE_BASE_TICKER = 'BUSD';

const getSymbolFromAsset = (asset: string) =>
  `${asset}${QUOTE_BASE_TICKER}`.toUpperCase();

const getSymbolsFromAssets = (assets: string[]) =>
  assets.map(getSymbolFromAsset);

if (!BINANCE_API_KEY) {
  throw new Error('BINANCE_API_KEY is not set');
}

if (!BINANCE_SECRET_KEY) {
  throw new Error('BINANCE_SECRET_KEY is not set');
}

const client = new Spot(BINANCE_API_KEY, BINANCE_SECRET_KEY, {
  baseURL: BINANCE_BASE_URL,
});

let _exchangeInfo: ExchangeInfo;

export const getExchangeInfo = async () => {
  if (!_exchangeInfo) {
    /**
     * https://binance-docs.github.io/apidocs/spot/en/#exchange-information
     */
    _exchangeInfo = (await client.exchangeInfo()).data;
  }

  return _exchangeInfo;
};

/**
 * Return the greatest minNotional value for the given assets.
 */
export const getAssetsMinNotional = async (assets: string[]) => {
  const exchangeInfo = await getExchangeInfo();

  const symbols = getSymbolsFromAssets(assets);

  const minNotional = exchangeInfo.symbols
    .filter(({ symbol }) => symbols.includes(symbol))
    .reduce((acc, cur) => {
      const filter = cur.filters.find(
        ({ filterType }) => filterType === 'MIN_NOTIONAL'
      );

      if (filter?.filterType === 'MIN_NOTIONAL') {
        return Math.max(acc, Number(filter.minNotional));
      }

      return acc;
    }, 0);

  return minNotional;
};

export const buy = async () => {
  const order = await client.newOrder('BTCBUSD', 'BUY', 'MARKET', {
    quoteOrderQty: 20,
  });

  console.log(JSON.stringify(order.data, null, 2));
};

export const sell = async () => {
  const order = await client.newOrder('BTCBUSD', 'SELL', 'MARKET', {
    quantity: '0.0001800',
  });

  console.log(JSON.stringify(order.data, null, 2));
};

type WalletBalances = {
  [ticker: string]: {
    quantity: number;
  };
};

export const getWalletBalances = async (
  assets: string[]
): Promise<WalletBalances> => {
  /**
   * https://binance-docs.github.io/apidocs/spot/en/#account-information-user_data
   */
  const { data } = await client.account();

  const { balances } = data;

  const assetsBalances = balances.filter(
    ({ asset }) => assets.includes(asset) || asset === QUOTE_BASE_TICKER
  );

  return assetsBalances.reduce<WalletBalances>((acc, cur) => {
    acc[cur.asset] = { quantity: Number(cur.free) };
    return acc;
  }, {});
};

type AllAssetsPrice = {
  [ticker: string]: {
    asset: string;
    symbol: string;
    price: number;
  };
};

export const getAllAssetsPrice = async (
  assets: string[]
): Promise<AllAssetsPrice> => {
  /**
   * https://binance-docs.github.io/apidocs/spot/en/#symbol-price-ticker
   */
  const tickersPrice = await Promise.all(
    assets.map((asset) =>
      client
        .tickerPrice(getSymbolFromAsset(asset))
        .then(({ data }) => ({ ...data, price: Number(data.price), asset }))
    )
  );

  return tickersPrice.reduce<AllAssetsPrice>((acc, cur) => {
    acc[cur.asset] = cur;
    return acc;
  }, {});
};

export type StrategyData = {
  minNotional: number;
  assets: {
    [asset: string]: AllAssetsPrice[string] &
      WalletBalances[string] & { totalValue: number };
  };
};

export const getStrategyData = async (
  assets: string[]
): Promise<StrategyData> => {
  const [balances, tickersPrice, minNotional] = await Promise.all([
    getWalletBalances(assets),
    getAllAssetsPrice(assets),
    getAssetsMinNotional(assets),
  ]);

  const assetsData = merge(balances, tickersPrice) as StrategyData['assets'];

  Object.keys(assetsData).forEach((asset) => {
    if (asset === QUOTE_BASE_TICKER) {
      assetsData[asset].totalValue = assetsData[asset].quantity;
      return;
    }

    assetsData[asset].totalValue =
      assetsData[asset].price * assetsData[asset].quantity;
  });

  return { assets: assetsData, minNotional };
};
