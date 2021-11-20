import { Spot } from '@binance/connector';
import merge from 'deepmerge';

const { BINANCE_API_KEY, BINANCE_SECRET_KEY, BINANCE_BASE_URL } = process.env;

export const QUOTE_BASE_TICKER = 'BUSD';

if (!BINANCE_API_KEY) {
  throw new Error('BINANCE_API_KEY is not set');
}

if (!BINANCE_SECRET_KEY) {
  throw new Error('BINANCE_SECRET_KEY is not set');
}

const client = new Spot(BINANCE_API_KEY, BINANCE_SECRET_KEY, {
  baseURL: BINANCE_BASE_URL,
});

export const buy = async () => {
  const order = await client.newOrder('BTCBUSD', 'BUY', 'MARKET', {
    quoteOrderQty: 10,
  });

  console.log(order);
};

export const getWalletBalances = async (assets: string[]) => {
  /**
   * https://binance-docs.github.io/apidocs/spot/en/#account-information-user_data
   */
  const { data } = await client.account();

  const { balances } = data as { balances: { asset: string; free: string }[] };

  const assetsBalances = balances.filter(
    ({ asset }) => assets.includes(asset) || asset === QUOTE_BASE_TICKER
  );

  return assetsBalances.reduce((acc, cur) => {
    acc[cur.asset] = { quantity: Number(cur.free) };
    return acc;
  }, {} as { [ticker: string]: { quantity: number } });
};

type TickerPrice = {
  asset: string;
  symbol: string;
  price: number;
};

export const getAllAssetsPrice = async (assets: string[]) => {
  /**
   * https://binance-docs.github.io/apidocs/spot/en/#symbol-price-ticker
   */
  const tickersPrice = await Promise.all<TickerPrice>(
    assets.map((asset) =>
      client
        .tickerPrice(`${asset}${QUOTE_BASE_TICKER}`.toUpperCase())
        .then(({ data }) => ({ ...data, price: Number(data.price), asset }))
    )
  );

  return tickersPrice.reduce((acc, cur) => {
    acc[cur.asset] = cur;
    return acc;
  }, {} as { [asset: string]: TickerPrice });
};

export type Status = {
  [asset: string]: TickerPrice & { quantity: number; totalValue: number };
};

export const getStrategyStatus = async (assets: string[]) => {
  const [balances, tickersPrice] = await Promise.all([
    getWalletBalances(assets),
    getAllAssetsPrice(assets),
  ]);

  const status = merge(balances, tickersPrice) as Status;

  Object.keys(status).forEach((asset) => {
    const totalValue = status[asset].price * status[asset].quantity;
    status[asset].totalValue = totalValue;
  });

  return status;
};
