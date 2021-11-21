# CryptoBot

## How to use CryptoBot

CryptoBot is running on cloud services and there isn't many actions to do manually, except for:

- Add more currencies to the list of currencies you want to track. After updating the list, just run `yarn deploy` to update the bot.
- Deposit your funds to your account. To do this, you should update the balance on database before depositing.

## Strategy

A cron job will run the strategy in a certain interval of 1 minute. One minute because crotons are sufficient small.

The first step is to handle buying with fiat.

1. It will check if the fiat balance is enough to buy the asset with the lowest proportion in the portfolio.
2. Once bought:
   1. It will save the order data in the database.
   2. It will update the deposit balance, because we'll consider the fiat used to buy the asset was from the deposit balance.
   3. If was not from deposit balance, it will update the coins quantity on database.
