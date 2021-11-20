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

  export type Order = {
    symbol: string;
    orderId: number;
    orderListId: number;
    clientOrderId: string;
    transactTime: number;
    price: string;
    origQty: string;
    executedQty: string;
    cummulativeQuoteQty: string;
    status: 'FILLED';
    timeInForce: 'GTC';
    type: 'MARKET';
    side: 'SELL' | 'BUY';
    fills: {
      price: string;
      qty: string;
      commission: string;
      commissionAsset: string;
      tradeId: number;
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

    public tickerPrice(asset: string): Promise<{
      data: {
        symbol: string;
        price: string;
      };
    }>;

    public newOrder(
      symbol: string,
      side: 'BUY' | 'SELL',
      type: 'MARKET',
      options?: Partial<{ quantity: number; quoteOrderQty: number }>
    ): Promise<{ data: Order }>;

    public savingsFlexibleRedeem(
      productId: string,
      amount: number,
      type: 'FAST' | 'NORMAL'
    ): Promise<{ data: {} }>;
  }
}
