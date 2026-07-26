/**
 * Money is always transported as a decimal *string* plus an ISO-4217 currency code.
 *
 * Rationale: IEEE-754 doubles cannot represent 0.1 exactly, and quotation values are
 * commercial records. Every arithmetic step inside the pricing engine runs on
 * arbitrary-precision decimals; the boundary representation is a string so that a value
 * cannot silently lose precision when it crosses a JSON, database or network boundary.
 */
export interface Money {
  /** Decimal string, e.g. "1234.56". Never a JS number. */
  readonly amount: string;
  /** ISO 4217 alphabetic code, e.g. "AUD", "GBP", "USD". */
  readonly currency: string;
}

/** Rounding applied when a computed value is presented as a real price. */
export type RoundingMode = 'half_up' | 'half_even' | 'up' | 'down';

export interface RoundingPolicy {
  /**
   * Smallest presentable step, as a decimal string. "0.01" for cent-accurate pricing,
   * "1" to round to whole currency units, "5" for nearest five.
   */
  readonly increment: string;
  readonly mode: RoundingMode;
}

/** Unit system used for display. Storage is always normalised to SI. */
export type UnitSystem = 'metric' | 'imperial';

export const DEFAULT_ROUNDING: RoundingPolicy = { increment: '0.01', mode: 'half_up' };
