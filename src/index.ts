require('dotenv').config({ path: './.env.production' });

import { runFirstStrategy } from './strategy/first';

runFirstStrategy().then(console.log).catch(console.error);
