import '../src/config';

import { updateEarningsSnapshot } from '../src/strategy/updateEarningsSnapshot';

updateEarningsSnapshot().then(console.log).catch(console.error);
