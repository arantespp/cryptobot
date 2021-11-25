import cron from 'node-cron';

import { slack } from '../api/slack';

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
  const message =
    'Starting Strategy' + (isProduction ? ' in production mode' : '');

  console.log(message);

  slack.send(message);

  /**
   * Every 15 seconds.
   */
  // schedule('*/15 * * * * *', runFirstStrategy);

  schedule('15 59 * * * *', updateEarningsSnapshot);
};
