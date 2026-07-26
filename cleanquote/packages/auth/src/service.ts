import { authStore, withSystem, type Queryable } from '@cleanquote/database';

import { hashPassword, verifyPassword } from './passwords';
import { expiryFromNow, hashToken, issueToken, TOKEN_LIFETIMES } from './tokens';

/**
 * Authentication service.
 *
 * Backed by the `local` provider: credentials and sessions live in this
 * database. Swapping to Supabase Auth replaces `register`, `signIn` and
 * `resolveSession` with calls to that service; everything downstream —
 * membership, permissions, RLS — is unchanged, because the rest of the system
 * only ever sees a user id.
 */

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
  readonly fullName?: string | null;
}

export interface RegisteredUser {
  readonly userId: string;
  /** Handed to the caller so it can be emailed. Never stored in plaintext. */
  readonly verificationToken: string;
}

export class AuthError extends Error {
  readonly code:
    | 'email_taken'
    | 'invalid_credentials'
    | 'email_not_verified'
    | 'account_locked'
    | 'invalid_token';

  constructor(code: AuthError['code'], message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

export async function register(input: RegisterInput): Promise<RegisteredUser> {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  const verification = issueToken();

  return withSystem(async (db) => {
    const existing = await authStore.findCredentialsByEmail(db, email);
    if (existing) {
      throw new AuthError('email_taken', 'An account already exists for that email address.');
    }

    const { userId } = await authStore.createUserWithCredentials(db, {
      email,
      passwordHash,
      fullName: input.fullName?.trim() || null,
      verificationTokenHash: verification.hash,
      verificationExpiresAt: expiryFromNow(TOKEN_LIFETIMES.emailVerification),
    });

    return { userId, verificationToken: verification.value };
  });
}

export async function verifyEmail(token: string): Promise<string> {
  return withSystem(async (db) => {
    const userId = await authStore.markEmailVerified(db, hashToken(token));
    if (!userId) {
      throw new AuthError('invalid_token', 'That verification link is invalid or has expired.');
    }
    return userId;
  });
}

export interface SignInResult {
  readonly userId: string;
  readonly sessionToken: string;
  readonly expiresAt: Date;
}

/**
 * Signs a user in.
 *
 * Every failure path returns the same message. Distinguishing "no such account"
 * from "wrong password" turns the sign-in form into an account enumeration
 * oracle, and the small usability gain is not worth it.
 */
export async function signIn(
  email: string,
  password: string,
  context: { ip?: string | null; userAgent?: string | null } = {},
): Promise<SignInResult> {
  const normalised = email.trim().toLowerCase();

  return withSystem(async (db) => {
    const credentials = await authStore.findCredentialsByEmail(db, normalised);

    if (!credentials) {
      // Hash anyway so a missing account is not detectable by response time.
      await verifyPassword(password, 'scrypt$16384$8$1$AAAA$AAAA');
      throw new AuthError('invalid_credentials', 'That email address or password is not correct.');
    }

    if (credentials.locked_until && credentials.locked_until > new Date()) {
      throw new AuthError(
        'account_locked',
        'Too many failed attempts. Try again in a few minutes.',
      );
    }

    const valid = await verifyPassword(password, credentials.password_hash);
    if (!valid) {
      await authStore.recordFailedLogin(db, normalised);
      throw new AuthError('invalid_credentials', 'That email address or password is not correct.');
    }

    if (!credentials.email_verified_at) {
      throw new AuthError(
        'email_not_verified',
        'Confirm your email address before signing in. Check your inbox for the verification link.',
      );
    }

    await authStore.clearFailedLogins(db, credentials.id);

    const session = issueToken();
    const expiresAt = expiryFromNow(TOKEN_LIFETIMES.session);
    await authStore.createSession(db, {
      userId: credentials.id,
      tokenHash: session.hash,
      expiresAt,
      ipAddress: context.ip ?? null,
      userAgent: context.userAgent ?? null,
    });

    return { userId: credentials.id, sessionToken: session.value, expiresAt };
  });
}

export async function signOut(sessionToken: string): Promise<void> {
  await withSystem(async (db) => {
    await authStore.revokeSession(db, hashToken(sessionToken));
  });
}

export interface ResolvedSession {
  readonly userId: string;
  readonly email: string;
  readonly fullName: string | null;
  readonly memberships: readonly authStore.MembershipRow[];
  /** Set when the session was slid forward and the cookie should be reissued. */
  readonly refreshedExpiry?: Date;
}

/**
 * Resolves a session token to a user and their memberships.
 *
 * The expiry slides forward once the session passes halfway, so an active user
 * is not signed out mid-walkthrough while an abandoned session still ages out.
 */
export async function resolveSession(sessionToken: string): Promise<ResolvedSession | undefined> {
  return withSystem(async (db) => {
    const session = await authStore.findLiveSession(db, hashToken(sessionToken));
    if (!session) return undefined;

    const user = await authStore.findUserById(db, session.userId);
    if (!user) return undefined;

    let refreshedExpiry: Date | undefined;
    const remaining = session.expiresAt.getTime() - Date.now();
    if (remaining < TOKEN_LIFETIMES.sessionRefreshAfter * 1000) {
      refreshedExpiry = expiryFromNow(TOKEN_LIFETIMES.session);
      await authStore.refreshSession(db, session.sessionId, refreshedExpiry);
    }

    const memberships = await authStore.listMemberships(db, session.userId);

    return {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      memberships,
      ...(refreshedExpiry ? { refreshedExpiry } : {}),
    };
  });
}

/**
 * Starts a password reset.
 *
 * Always resolves, whether or not the address exists. The caller emails the
 * token when one comes back and says nothing different when it does not — the
 * form must not reveal which addresses have accounts.
 */
export async function beginPasswordReset(email: string): Promise<{ token: string } | undefined> {
  const reset = issueToken();
  return withSystem(async (db) => {
    const userId = await authStore.setResetToken(
      db,
      email.trim().toLowerCase(),
      reset.hash,
      expiryFromNow(TOKEN_LIFETIMES.passwordReset),
    );
    return userId ? { token: reset.value } : undefined;
  });
}

export async function completePasswordReset(token: string, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await withSystem(async (db) => {
    const userId = await authStore.consumeResetToken(db, hashToken(token), passwordHash);
    if (!userId) {
      throw new AuthError('invalid_token', 'That reset link is invalid or has expired.');
    }
  });
}

/** Used by the invitation flow, which already holds an open transaction. */
export async function findUserByEmail(
  db: Queryable,
  email: string,
): Promise<{ id: string } | undefined> {
  const row = await authStore.findCredentialsByEmail(db, email.trim().toLowerCase());
  return row ? { id: row.id } : undefined;
}
