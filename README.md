## Database

I need a table that perform these operations:

- I can query for the ticker and return the crotons I brought with the lowest price.

## Trades

### Buy

First trade was buying BTC using USDT as quote. I sent the order with the args:

```js
[
  'BTCBUSD',
  'BUY',
  'MARKET',
  {
    quoteOrderQty: 10,
  },
];
```

The order executed result was:

```json
{
  "cummulativeQuoteQty": "9.53014220",
  "executedQty": "0.00017000"
}
```

The final BTC balance was `0.00016983` because of the deducted the fee of 0.1%. The BTC average price was `56059.66`.

### Sell

I have a total of `10.78923588` BUSD and `0.00017444` BTC before the transaction.
