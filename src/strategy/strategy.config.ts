import { WALLET } from './wallet';

export const TRADE_FEE = 0.001;

export const MIN_PROFIT = 2.5 / 100;

/**
 * Used to determining the quantity of the asset to buy.
 */
export const MIN_NOTIONAL_MULTIPLIER = 1.5;

/**
 * The total value that a asset must have to be traded.
 */
export const MIN_NOTIONAL_TO_TRADE = 10;

/**
 * Trade only a percentage of the wallet.
 */
export const LOWEST_QUANTITY_ASSETS_TO_NOT_TRADE = Math.round(
  Object.keys(WALLET).length * 0.5
);

/**
 * Sell the asset if its z-score is greater than this value.
 */
export const Z_SCORE_THRESHOLD_TO_SELL = 2;
