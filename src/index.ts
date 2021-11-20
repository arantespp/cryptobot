require('dotenv').config({ path: './.env.production' });

// import { runFirstStrategy } from './strategy/first';

// runFirstStrategy().then(console.log).catch(console.error);

import { buy } from './api/exchange';

buy().then(console.log).catch(console.error);
