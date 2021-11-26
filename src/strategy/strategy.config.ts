import { WALLET } from './wallet';

export const TRADE_FEE = 0.001;

export const MIN_PROFIT = 2 / 100;

/**
 * Used to determining the quantity of the asset to buy.
 */
export const MIN_NOTIONAL_MULTIPLIER = 1.5;

/**
 * The total value that a asset must have to be traded.
 */
export const MIN_NOTIONAL_TO_TRADE = 15;

/**
 * Trade only a half of the wallet.
 */
export const LOWEST_QUANTITY_ASSETS_TO_NOT_TRADE = Math.round(
  Object.keys(WALLET).length / 2
);
