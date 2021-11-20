// {
//   "symbol": "BTCBUSD",
//   "orderId": 3753014780,
//   "orderListId": -1,
//   "clientOrderId": "8eBjTVyDVQshaGeIAtef4o",
//   "transactTime": 1637405066716,
//   "price": "0.00000000",
//   "origQty": "0.00034000",
//   "executedQty": "0.00034000",
//   "cummulativeQuoteQty": "19.93200700",
//   "status": "FILLED",
//   "timeInForce": "GTC",
//   "type": "MARKET",
//   "side": "BUY",
//   "fills": [
//     {
//       "price": "58623.55000000",
//       "qty": "0.00034000",
//       "commission": "0.00000034",
//       "commissionAsset": "BTC",
//       "tradeId": 269707612
//     }
//   ]
// }

declare module '@binance/connector' {
  export type ExchangeInfo = {
    symbols: {
      symbol: string;
      filters: Array<
        | {
            filterType: 'PRICE_FILTER';
            minPrice: string;
            maxPrice: string;
            tickSize: string;
          }
        | {
            filterType: 'PERCENT_PRICE';
            multiplierUp: string;
            multiplierDown: string;
            avgPriceMins: number;
          }
        | {
            filterType: 'LOT_SIZE';
            minQty: string;
            maxQty: string;
            stepSize: string;
          }
        | {
            filterType: 'MIN_NOTIONAL';
            minNotional: string;
            applyToMarket: boolean;
            avgPriceMins: number;
          }
        | { filterType: 'ICEBERG_PARTS'; limit: number }
        | {
            filterType: 'MARKET_LOT_SIZE';
            minQty: string;
            maxQty: string;
            stepSize: string;
          }
        | { filterType: 'MAX_NUM_ORDERS'; maxNumOrders: number }
        | { filterType: 'MAX_NUM_ALGO_ORDERS'; maxNumAlgoOrders: number }
      >;
    }[];
  };

  export class Spot {
    constructor(
      apiKey: string,
      secretKey: string,
      options?: { baseURL?: string }
    );

    public exchangeInfo(): Promise<{ data: ExchangeInfo }>;

    public account(): Promise<{
      data: { balances: { asset: string; free: string }[] };
    }>;

    public tickerPrice(ticker: string): Promise<{
      data: {
        symbol: string;
        price: string;
      };
    }>;

    public newOrder(
      symbol: string,
      side: 'BUY' | 'SELL',
      type: 'MARKET',
      options?: Partial<{ quantity: string; quoteOrderQty: number }>
    ): any;
  }
}
