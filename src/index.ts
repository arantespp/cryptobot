require('dotenv').config({ path: './.env.production' });

import { runFirstStrategy } from './strategy/first';

runFirstStrategy().then(console.log).catch(console.error);

// import { getStrategyData } from './api/exchange';

// const assets = ['BTC', 'ETH', 'BNB', 'ADA'];

// getStrategyData(assets)
//   .then((data) => console.log(JSON.stringify(data, null, 2)))
//   .catch(console.error);

// import { sellOrder, redeemFlexibleSavings } from './api/binance';

// // sellOrder({
// //   symbol: 'BTCBUSD',
// //   quantity: 0.00034,
// // })
// //   .then(console.log)
// //   .catch(console.error);

// redeemFlexibleSavings({ asset: 'ETH', amount: 0.02 })
//   .then(console.log)
//   .catch(console.error);
