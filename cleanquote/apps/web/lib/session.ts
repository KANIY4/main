import 'server-only';

import { resolveSession, TOKEN_LIFETIMES, type ResolvedSession } from '@cleanquote/auth';
import type { Permission } from '@cleanquote/types';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Session and actor resolution for the server layer.
 *
 * The session cookie is httpOnly, so JavaScript on the page cannot read it — an
 * XSS that gets script execution still does not get the session token. It is
 * SameSite=Lax, which blocks the cross-site POST shape of CSRF while leaving
 * ordinary top-level navigation (a proposal link in an email) working.
 */

const SESSION_COOKIE = 'cq_session';
const ORG_COOKIE = 'cq_org';

export interface Actor {
  readonly userId: string;
  readonly email: string;
  readonly fullName: string | null;
  readonly organisationId: string;
  readonly organisationName: string;
  readonly permissions: readonly string[];
  readonly roleCode: string | null;
  readonly memberships: ResolvedSession['memberships'];
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // Secure is conditional so the cookie still works over plain HTTP in local
    // development; in production it is always set.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  };
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(ORG_COOKIE);
}

export async function readSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

export async function setActiveOrganisation(organisationId: string): Promise<void> {
  const store = await cookies();
  store.set(ORG_COOKIE, organisationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TOKEN_LIFETIMES.session,
  });
}

/** The signed-in user, or undefined. Never throws or redirects. */
export async function currentSession(): Promise<ResolvedSession | undefined> {
  const token = await readSessionToken();
  if (!token) return undefined;
  try {
    const session = await resolveSession(token);
    if (session?.refreshedExpiry) {
      await setSessionCookie(token, session.refreshedExpiry);
    }
    return session;
  } catch {
    // A database outage must not present as "you are signed out", which would
    // send the user round a login loop that cannot succeed.
    return undefined;
  }
}

/**
 * The signed-in user in the context of one organisation.
 *
 * The active organisation comes from a cookie, but is always re-checked against
 * live membership — a stale cookie naming an organisation the user has left
 * resolves to their first remaining membership, not to access they no longer
 * hold.
 */
export async function currentActor(): Promise<Actor | undefined> {
  const session = await currentSession();
  if (!session || session.memberships.length === 0) return undefined;

  const store = await cookies();
  const requested = store.get(ORG_COOKIE)?.value;
  const membership =
    session.memberships.find(
      (m: (typeof session.memberships)[number]) => m.organisation_id === requested,
    ) ?? session.memberships[0];
  if (!membership) return undefined;

  return {
    userId: session.userId,
    email: session.email,
    fullName: session.fullName,
    organisationId: membership.organisation_id,
    organisationName: membership.organisation_name,
    permissions: membership.permissions,
    roleCode: membership.role_code,
    memberships: session.memberships,
  };
}

/** Redirects to sign-in when there is no session, or to onboarding when there is no organisation. */
export async function requireActor(): Promise<Actor> {
  const session = await currentSession();
  if (!session) redirect('/sign-in');
  if (session.memberships.length === 0) redirect('/onboarding');

  const actor = await currentActor();
  if (!actor) redirect('/onboarding');
  return actor;
}

export class ActionForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`This action requires the "${permission}" permission.`);
    this.name = 'ActionForbiddenError';
  }
}

/**
 * Server-side permission gate.
 *
 * A second line, not the line. The database enforces the same permission through
 * RLS, so a request that somehow reached past this still cannot touch the data.
 * Checking here produces a readable error instead of an empty result set.
 */
export function assertPermission(actor: Actor, permission: Permission): void {
  if (!actor.permissions.includes(permission)) {
    throw new ActionForbiddenError(permission);
  }
}

export function hasPermission(actor: Actor, permission: Permission): boolean {
  return actor.permissions.includes(permission);
}

export async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  return {
    ip: forwarded ? (forwarded.split(',')[0]?.trim() ?? null) : null,
    userAgent: headerList.get('user-agent'),
  };
}
