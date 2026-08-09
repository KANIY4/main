import {
  CAPABILITY_MATRIX,
  SUPPORT_READABLE_CAPABILITIES,
  type Capability,
  type Grant,
} from "./capabilities.js";
import {
  hasValidSupportGrant,
  isActiveMember,
  type AuthContext,
  type ResourceRef,
} from "./context.js";

export type DenyReason =
  | "not_authenticated"
  | "membership_inactive"
  | "tenant_mismatch"
  | "capability_denied"
  | "site_not_allocated"
  | "not_record_owner"
  | "mfa_required"
  | "support_grant_expired"
  | "support_write_forbidden";

export type Decision = { allowed: true } | { allowed: false; reason: DenyReason };

const ALLOWED: Decision = { allowed: true };

function deny(reason: DenyReason): Decision {
  return { allowed: false, reason };
}

/** Capabilities that require the session to have satisfied a second factor. */
const MFA_REQUIRED_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  "user.manage",
  "payrate.view",
  "payrate.manage",
  "tenant.settings.manage",
  "site.manage",
  "report.export",
]);

export interface AuthorizeOptions {
  readonly nowEpochMs?: number;
}

/**
 * Deny-by-default authorisation. Every protected read and write calls this
 * before touching data; row-level security in PostgreSQL enforces the same
 * boundary independently (scope section 10).
 */
export function authorize(
  context: AuthContext,
  capability: Capability,
  resource: ResourceRef,
  options: AuthorizeOptions = {},
): Decision {
  const now = options.nowEpochMs ?? Date.now();

  if (context.userId === "") {
    return deny("not_authenticated");
  }

  // Support access is a separate, narrower path than tenant membership.
  if (context.role === "platform_owner") {
    return authorizeSupport(context, capability, resource, now);
  }

  if (!isActiveMember(context) || context.role === null) {
    return deny("membership_inactive");
  }

  if (context.tenantId !== resource.tenantId) {
    return deny("tenant_mismatch");
  }

  const grant: Grant = CAPABILITY_MATRIX[capability][context.role];
  if (grant === "none") {
    return deny("capability_denied");
  }

  if (MFA_REQUIRED_CAPABILITIES.has(capability) && !context.mfaSatisfied) {
    return deny("mfa_required");
  }

  if (grant === "tenant") {
    return ALLOWED;
  }

  if (grant === "allocated") {
    return isSiteAllocated(context, resource) ? ALLOWED : deny("site_not_allocated");
  }

  // grant === "own"
  if (resource.ownerUserId === context.userId) {
    return ALLOWED;
  }
  return deny("not_record_owner");
}

function authorizeSupport(
  context: AuthContext,
  capability: Capability,
  resource: ResourceRef,
  nowEpochMs: number,
): Decision {
  if (!hasValidSupportGrant(context, resource.tenantId, nowEpochMs)) {
    return deny("support_grant_expired");
  }
  if (!context.mfaSatisfied) {
    return deny("mfa_required");
  }
  if (!SUPPORT_READABLE_CAPABILITIES.includes(capability)) {
    return deny("support_write_forbidden");
  }
  return ALLOWED;
}

function isSiteAllocated(context: AuthContext, resource: ResourceRef): boolean {
  const siteId = resource.siteId;
  if (siteId === undefined || siteId === null) {
    // A site-scoped grant cannot be evaluated without a site. Fail closed.
    return false;
  }
  return context.allocatedSiteIds.includes(siteId);
}

/** Boolean form for call sites that do not need the reason. */
export function can(
  context: AuthContext,
  capability: Capability,
  resource: ResourceRef,
  options: AuthorizeOptions = {},
): boolean {
  return authorize(context, capability, resource, options).allowed;
}

export class AuthorizationError extends Error {
  readonly reason: DenyReason;
  readonly capability: Capability;

  constructor(reason: DenyReason, capability: Capability) {
    // The message is safe to log. It carries no record identifiers.
    super(`Not permitted: ${capability} (${reason})`);
    this.name = "AuthorizationError";
    this.reason = reason;
    this.capability = capability;
  }
}

/** Throwing form for service layers that treat a denial as an error path. */
export function assertCan(
  context: AuthContext,
  capability: Capability,
  resource: ResourceRef,
  options: AuthorizeOptions = {},
): void {
  const decision = authorize(context, capability, resource, options);
  if (!decision.allowed) {
    throw new AuthorizationError(decision.reason, capability);
  }
}
