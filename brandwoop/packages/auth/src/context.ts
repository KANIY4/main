import type { MembershipStatus, Role } from "@brandwoop/contracts";

/**
 * The authorisation subject. Built server-side from the verified session and
 * the membership row — never from a client-supplied header or body field.
 */
export interface AuthContext {
  readonly userId: string;
  readonly tenantId: string | null;
  readonly role: Role | null;
  readonly membershipStatus: MembershipStatus | null;
  readonly allocatedSiteIds: readonly string[];
  readonly supportGrant: SupportGrant | null;
  /** Set when the session itself satisfied a second factor. */
  readonly mfaSatisfied: boolean;
}

export interface SupportGrant {
  readonly tenantId: string;
  readonly reasonCode: string;
  readonly expiresAtEpochMs: number;
}

/** The record being acted on, resolved from the database before the check. */
export interface ResourceRef {
  readonly tenantId: string;
  readonly siteId?: string | null;
  /** Author or assigned worker, whichever defines "own" for this record. */
  readonly ownerUserId?: string | null;
}

export function isActiveMember(context: AuthContext): boolean {
  return (
    context.membershipStatus === "active" && context.tenantId !== null && context.role !== null
  );
}

export function hasValidSupportGrant(
  context: AuthContext,
  tenantId: string,
  nowEpochMs: number,
): boolean {
  const grant = context.supportGrant;
  if (grant === null) {
    return false;
  }
  return grant.tenantId === tenantId && grant.expiresAtEpochMs > nowEpochMs;
}

/** Convenience constructor for tests and for unauthenticated request handling. */
export function anonymousContext(): AuthContext {
  return {
    userId: "",
    tenantId: null,
    role: null,
    membershipStatus: null,
    allocatedSiteIds: [],
    supportGrant: null,
    mfaSatisfied: false,
  };
}
