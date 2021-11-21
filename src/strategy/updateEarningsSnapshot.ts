import * as dateFns from 'date-fns';
import Debug from 'debug';
import Decimal from 'decimal.js';

import { getStrategyData } from '../api/binance';

import * as database from '../api/database';

import * as strategyConfig from './strategy.config';

type Snapshot = {
  [asset: string]: { earnings: number; value: number };
};

const pk = 'WALLET';

const getSk = (date: string) => `EARNINGS_SNAPSHOT_${date}`;

const formatNumber = (value: number): number =>
  new Decimal(value).toSignificantDigits(7).toNumber();

const getValueFromSnapshot = (snapshot: Snapshot): number => {
  let value = 0;

  Object.keys(snapshot).forEach((asset) => {
    value += snapshot[asset].value;
  });

  return formatNumber(value);
};

export const updateEarningsSnapshot = async () => {
  const debug = Debug('CryptoBot:updateEarningsSnapshot');

  const today = dateFns.format(new Date(), 'yyyy-MM-dd');

  const yesterday = dateFns.format(
    dateFns.addDays(new Date(), -1),
    'yyyy-MM-dd'
  );

  const {
    pk: _pk,
    sk: _sk,
    ...assetsEarning
  } = await database.getItem({
    pk,
    sk: 'CURRENT_EARNINGS',
  });

  const tickers = Object.keys(assetsEarning);

  const strategyData = await getStrategyData(tickers);

  const { snapshot: yesterdaySnapshot = {} } = await database.getItem<{
    snapshot: Snapshot;
  }>({
    pk,
    sk: getSk(yesterday),
  });

  const snapshot: Snapshot = tickers.reduce<Snapshot>((acc, asset) => {
    const earnings = assetsEarning[asset];
    const price = strategyData.assets[asset].price;

    acc[asset] = {
      earnings: formatNumber(earnings),
      value: formatNumber(earnings * price),
    };

    return acc;
  }, {});

  const diff: Snapshot = tickers.reduce<Snapshot>((acc, asset) => {
    const earnings = formatNumber(
      snapshot[asset].earnings - (yesterdaySnapshot[asset]?.earnings || 0)
    );
    const price = strategyData.assets[asset].price;

    acc[asset] = {
      earnings,
      value: formatNumber(earnings * price),
    };

    return acc;
  }, {});

  const snapshotValue = getValueFromSnapshot(snapshot);

  const diffValue = getValueFromSnapshot(diff);

  debug({
    strategyConfig,
    tickers,
    snapshot,
    diff,
    snapshotValue,
    diffValue,
    yesterdaySnapshot,
  });

  await database.putItem({
    item: {
      pk,
      sk: getSk(today),
      snapshot,
      diff,
      strategyConfig,
      snapshotValue,
      diffValue,
    },
  });
};
