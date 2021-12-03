const BETS = {
  BTT: 1,
  STMX: 1,
  SANTOS: 1,
  ONE: 1,
  FOR: 1,
};

/**
 * Proportional to market cap.
 * https://coinmarketcap.com/all/views/all/
 */
export const WALLET = {
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
  ...BETS,
};
