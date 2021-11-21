import '../config';

import * as dateFns from 'date-fns';

import * as database from '../api/database';

export const updateEarningsSnapshot = async () => {
  console.log('updateEarningsSnapshot');

  const { pk, sk, ...snapshot } = await database.getItem({
    pk: 'WALLET',
    sk: 'CURRENT_EARNINGS',
  });

  const today = dateFns.format(new Date(), 'yyyy-MM-dd');

  await database.putItem({
    item: {
      pk: 'WALLET',
      sk: `EARNINGS_SNAPSHOT_${today}`,
      snapshot,
    },
  });
};
