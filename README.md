## Strategy

A cron job will run the strategy in a certain interval of 1 minute. One minute because crotons are sufficient small.

### Coins Quantity

We'll use coins quantity to measure if the strategy is increasing the quantity of coins.

### Fiat

The first step is to handle buying with fiat.

1. It will check if the fiat balance is enough to buy the asset with the lowest proportion in the portfolio.
2. Once bought:
   1. It will save the order data in the database.
   2. It will update the deposit balance, because we'll consider the fiat used to buy the asset was from the deposit balance.
   3. If was not from deposit balance, it will update the coins quantity on database.

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
