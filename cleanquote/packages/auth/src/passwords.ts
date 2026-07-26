import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

/**
 * `promisify` drops the options overload, so the wrapper is written by hand.
 * The cost parameters are the whole point of using scrypt; losing the ability to
 * pass them would silently fall back to defaults far below what a password store
 * needs.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

/**
 * Password hashing.
 *
 * scrypt from the Node standard library, at parameters that cost roughly 100 ms
 * on current server hardware. The work factor is stored with the hash
 * (`scrypt$N$r$p$salt$hash`) so it can be raised later without invalidating
 * existing credentials — a hash written today still verifies after the cost goes
 * up, and can be transparently rewritten on next sign-in.
 *
 * scrypt was chosen over bcrypt because it is in the standard library, so there
 * is no native dependency to compile, and over a plain PBKDF2 because it is
 * memory-hard.
 */

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  assertPasswordAcceptable(password);
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

/**
 * Verifies a password.
 *
 * Comparison is constant-time. A malformed stored hash returns false rather than
 * throwing, so a corrupted row cannot be used to distinguish accounts.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4] ?? '', 'base64');
  const expected = Buffer.from(parts[5] ?? '', 'base64');
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p) || expected.length === 0) {
    return false;
  }

  try {
    const derived = await scrypt(password, salt, expected.length, { N: n, r, p });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** True when a stored hash was written at a lower work factor than current. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$');
  return parts[0] !== 'scrypt' || Number(parts[1]) < N;
}

export class WeakPasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeakPasswordError';
  }
}

/**
 * Length is the requirement that actually matters. Composition rules push people
 * towards predictable substitutions, so the check is a floor plus a very short
 * list of passwords that show up in every breach corpus.
 */
const OBVIOUS_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  'qwertyuiop',
  'letmein123',
  'welcome123',
  'admin12345',
  'cleaning123',
]);

export function assertPasswordAcceptable(password: string): void {
  if (password.length < 12) {
    throw new WeakPasswordError('Use at least 12 characters.');
  }
  if (password.length > 200) {
    throw new WeakPasswordError('That password is too long.');
  }
  if (OBVIOUS_PASSWORDS.has(password.toLowerCase())) {
    throw new WeakPasswordError('That password appears in every breach list. Choose another.');
  }
}
