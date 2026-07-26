import { z } from 'zod';

/**
 * Shared primitives.
 *
 * Money and percentages are validated as decimal *strings*, never coerced to numbers —
 * `z.number()` would silently accept a value that has already lost precision upstream.
 */

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export const decimalString = (label = 'value') =>
  z
    .string()
    .trim()
    .regex(DECIMAL_PATTERN, `${label} must be a plain decimal string such as "1234.56"`);

export const nonNegativeDecimalString = (label = 'value') =>
  decimalString(label).refine((v) => !v.startsWith('-'), `${label} must not be negative`);

/** A percent, expressed as a decimal string: "12.5" means 12.5%. */
export const percentString = (label = 'percentage') =>
  decimalString(label).refine((v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= -100 && n <= 1000;
  }, `${label} must be between -100 and 1000 percent`);

export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Currency must be a three-letter ISO 4217 code such as "AUD"');

export const uuid = z.uuid();

export const isoTimestamp = z.iso.datetime({ message: 'Expected an ISO 8601 timestamp' });

/** 0-1 inclusive. Used for probabilities, confidence and ratios. */
export const unitInterval = z.number().min(0).max(1);

export const positiveNumber = z.number().positive().finite();
export const nonNegativeNumber = z.number().min(0).finite();

/**
 * Free text that reaches a document, a prompt or a client-visible page. Bounded so a
 * pasted tender cannot blow up a proposal or a model context.
 */
export const shortText = z.string().trim().min(1).max(200);
export const mediumText = z.string().trim().min(1).max(2000);
export const longText = z.string().trim().min(1).max(20000);
