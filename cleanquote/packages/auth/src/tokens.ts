import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Opaque tokens: sessions, email verification, password reset, invitations and
 * public proposal links.
 *
 * The rule for all of them is the same. The value handed out is random and
 * high-entropy; only its SHA-256 hash is stored. A database leak therefore hands
 * over no live session, no usable invitation and no readable proposal link.
 *
 * SHA-256 is right here and wrong for passwords: these tokens are already 256
 * bits of randomness, so there is nothing to brute-force and no need for a slow
 * KDF. A password is low-entropy, which is exactly why it needs scrypt.
 */

const TOKEN_BYTES = 32;

export interface IssuedToken {
  /** Handed to the user. Never stored. */
  readonly value: string;
  /** Stored. Never handed out. */
  readonly hash: string;
}

export function issueToken(): IssuedToken {
  const value = randomBytes(TOKEN_BYTES).toString('base64url');
  return { value, hash: hashToken(value) };
}

export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Constant-time comparison for the rare case of comparing two hashes directly. */
export function tokenHashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function expiryFromNow(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

export const TOKEN_LIFETIMES = {
  /** Long enough to survive a working week without a re-login. */
  session: 60 * 60 * 24 * 7,
  /** Refreshed when the session passes halfway, so activity extends it. */
  sessionRefreshAfter: 60 * 60 * 24 * 3.5,
  emailVerification: 60 * 60 * 24,
  passwordReset: 60 * 60,
  invitation: 60 * 60 * 24 * 14,
  /** A proposal link outlives a typical quote validity period, not forever. */
  proposalLink: 60 * 60 * 24 * 90,
} as const;
