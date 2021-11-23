import cron from 'node-cron';

import { isProduction } from '../config';

import { runFirstStrategy } from './first';
import { updateEarningsSnapshot } from './updateEarningsSnapshot';

const errorHandlerWrapper = (fn: () => any) => async () => {
  try {
    await fn();
  } catch (error: any) {
    if (error?.response?.data) {
      console.error(error.response.data);
    } else {
      console.error(error);
    }
  }
};

const schedule = (cronExpression: string, fn: () => void) => {
  cron.schedule(cronExpression, errorHandlerWrapper(fn));
};

export const startStrategy = () => {
  console.log(
    'Starting Strategy' + (isProduction ? ' in production mode' : '')
  );

  schedule('0,30 * * * * *', runFirstStrategy);

  schedule('15 59 * * * *', updateEarningsSnapshot);
};
