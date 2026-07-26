import Decimal from 'decimal.js';

import type { RoundingPolicy } from '@cleanquote/types';

/**
 * 34 significant digits is well beyond anything a cleaning contract needs, and leaves
 * ample headroom for the intermediate division in the closed-form price solve.
 */
Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -30, toExpPos: 40 });

export { Decimal };

export type Numeric = string | number | Decimal;

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);
export const HUNDRED = new Decimal(100);

export function dec(value: Numeric): Decimal {
  const d = new Decimal(value);
  if (!d.isFinite()) {
    throw new PricingError('NON_FINITE_VALUE', `Value "${String(value)}" is not finite`);
  }
  return d;
}

/** Converts a percent string ("12.5") into a fraction (0.125). */
export function fromPct(value: Numeric | undefined, fallback: Numeric = 0): Decimal {
  return dec(value ?? fallback).div(HUNDRED);
}

/** Converts a fraction (0.125) into a percent string ("12.5"). */
export function toPct(fraction: Decimal, dp = 4): string {
  return fraction.mul(HUNDRED).toFixed(dp);
}

export function sum(values: readonly Decimal[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(v), ZERO);
}

const ROUNDING_MODES: Record<RoundingPolicy['mode'], Decimal.Rounding> = {
  half_up: Decimal.ROUND_HALF_UP,
  half_even: Decimal.ROUND_HALF_EVEN,
  up: Decimal.ROUND_CEIL,
  down: Decimal.ROUND_FLOOR,
};

/** Rounds to the nearest presentable step, e.g. increment "5" rounds 1237 to 1235. */
export function roundToPolicy(value: Decimal, policy: RoundingPolicy): Decimal {
  const increment = dec(policy.increment);
  if (increment.lte(0)) {
    throw new PricingError('INVALID_ROUNDING', 'Rounding increment must be greater than zero');
  }
  return value.div(increment).toDecimalPlaces(0, ROUNDING_MODES[policy.mode]).mul(increment);
}

/** Formats a decimal for storage/transport. Always 2 dp for money unless overridden. */
export function money(value: Decimal, dp = 2): string {
  return value.toFixed(dp);
}

/** Formats an hour count. 4 dp keeps annualised fractional hours honest. */
export function hours(value: Decimal, dp = 4): string {
  return value.toFixed(dp);
}

export function safeDivide(numerator: Decimal, denominator: Decimal): Decimal {
  return denominator.isZero() ? ZERO : numerator.div(denominator);
}

export type PricingErrorCode =
  | 'NON_FINITE_VALUE'
  | 'INVALID_ROUNDING'
  | 'INVALID_SCHEDULE'
  | 'INVALID_PRODUCTIVITY'
  | 'UNKNOWN_LABOUR_PROFILE'
  | 'UNSOLVABLE_PRICE'
  | 'INVALID_SCENARIO'
  | 'SCHEMA_VERSION_MISMATCH';

export class PricingError extends Error {
  readonly code: PricingErrorCode;
  readonly context?: Record<string, unknown>;

  constructor(code: PricingErrorCode, message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'PricingError';
    this.code = code;
    this.context = context;
  }
}
