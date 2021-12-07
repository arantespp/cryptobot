const BETS = [
  'BTT',
  'STMX',
  'ONE',
  'FOR',
  'TRX',
  'SUN',
  'FIL',
  'HOT',
  'SC',
  'ALICE',
  'AKRO',
  'REEF',
  'PSG',
  // 'SANTOS', // Do not exist in the BUSD market.
];

const BETS_WEIGHT = 0.5;

/**
 * Proportional to market cap.
 * https://coinmarketcap.com/all/views/all/
 */
export const WALLET = {
  ...BETS.reduce((acc, bet) => {
    acc[bet] = BETS_WEIGHT;
    return acc;
  }, {}),
  BTC: 30,
  ETH: 30,
  BNB: 20,
  SOL: 20,
  ADA: 20,
  XRP: 20,
  DOT: 15,
  DOGE: 15,
  AVAX: 15,
  LUNA: 15,
  SHIB: 15,
  LTC: 10,
  UNI: 10,
  LINK: 10,
  MATIC: 10,
  VET: 10,
  MANA: 10,
  GRT: 10,
  XLM: 5,
  FTM: 5,
  SAND: 5,
  GALA: 5,
  XMR: 5,
  STX: 5,
  CHZ: 2,
};
