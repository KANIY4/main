import { describe, expect, it } from "vitest";

import { AuthorizationError, assertCan, authorize, can } from "../permissions.js";
import {
  NOW,
  SITE_1,
  SITE_2,
  TENANT_A,
  TENANT_B,
  USER_OTHER,
  USER_SELF,
  contextFor,
} from "./helpers.js";

const options = { nowEpochMs: NOW };

describe("cleaner scope", () => {
  const cleaner = contextFor({ role: "cleaner" });

  it("performs a shift assigned to them", () => {
    const resource = { tenantId: TENANT_A, siteId: SITE_1, ownerUserId: USER_SELF };
    expect(can(cleaner, "shift.perform", resource, options)).toBe(true);
  });

  it("cannot perform a shift assigned to another worker", () => {
    const resource = { tenantId: TENANT_A, siteId: SITE_1, ownerUserId: USER_OTHER };
    const decision = authorize(cleaner, "shift.perform", resource, options);
    expect(decision).toEqual({ allowed: false, reason: "not_record_owner" });
  });

  it("cannot view pay rates", () => {
    const resource = { tenantId: TENANT_A, ownerUserId: USER_SELF };
    const decision = authorize(cleaner, "payrate.view", resource, options);
    expect(decision).toEqual({ allowed: false, reason: "capability_denied" });
  });

  it("cannot decide their own attendance correction", () => {
    const resource = { tenantId: TENANT_A, siteId: SITE_1, ownerUserId: USER_SELF };
    expect(can(cleaner, "attendance.correct.decide", resource, options)).toBe(false);
  });

  it("cannot manage sites or users", () => {
    const resource = { tenantId: TENANT_A, siteId: SITE_1 };
    expect(can(cleaner, "site.manage", resource, options)).toBe(false);
    expect(can(cleaner, "user.manage", resource, options)).toBe(false);
  });
});

describe("supervisor scope", () => {
  const supervisor = contextFor({ role: "supervisor", allocatedSiteIds: [SITE_1] });

  it("performs an audit at an allocated site", () => {
    expect(can(supervisor, "audit.perform", { tenantId: TENANT_A, siteId: SITE_1 }, options)).toBe(
      true,
    );
  });

  it("cannot perform an audit at a site they are not allocated to", () => {
    const decision = authorize(
      supervisor,
      "audit.perform",
      { tenantId: TENANT_A, siteId: SITE_2 },
      options,
    );
    expect(decision).toEqual({ allowed: false, reason: "site_not_allocated" });
  });

  it("fails closed when a site-scoped check has no site", () => {
    const decision = authorize(supervisor, "audit.perform", { tenantId: TENANT_A }, options);
    expect(decision).toEqual({ allowed: false, reason: "site_not_allocated" });
  });

  it("cannot manage users or pay rates", () => {
    const resource = { tenantId: TENANT_A, siteId: SITE_1 };
    expect(can(supervisor, "user.manage", resource, options)).toBe(false);
    expect(can(supervisor, "payrate.view", resource, options)).toBe(false);
  });
});

describe("administrator scope", () => {
  const admin = contextFor({ role: "administrator", allocatedSiteIds: [] });

  it("manages any site inside its own tenant without a site allocation", () => {
    expect(can(admin, "site.manage", { tenantId: TENANT_A, siteId: SITE_2 }, options)).toBe(true);
  });

  it("cannot perform a shift", () => {
    const resource = { tenantId: TENANT_A, siteId: SITE_1, ownerUserId: USER_SELF };
    expect(can(admin, "shift.perform", resource, options)).toBe(false);
  });

  it("requires a second factor for sensitive capabilities", () => {
    const noMfa = contextFor({ role: "administrator", mfaSatisfied: false });
    const resource = { tenantId: TENANT_A, siteId: SITE_1 };
    expect(authorize(noMfa, "payrate.view", resource, options)).toEqual({
      allowed: false,
      reason: "mfa_required",
    });
    // Routine reads stay usable without step-up.
    expect(can(noMfa, "shift.view", resource, options)).toBe(true);
  });
});

describe("platform support access", () => {
  const grantedResource = { tenantId: TENANT_A, siteId: SITE_1 };

  function ownerWithGrant(expiresAtEpochMs: number, tenantId = TENANT_A) {
    return contextFor({
      role: "platform_owner",
      tenantId: null,
      membershipStatus: null,
      supportGrant: { tenantId, reasonCode: "incident", expiresAtEpochMs },
    });
  }

  it("denies a platform owner with no grant", () => {
    const owner = contextFor({ role: "platform_owner", tenantId: null, membershipStatus: null });
    expect(authorize(owner, "shift.view", grantedResource, options)).toEqual({
      allowed: false,
      reason: "support_grant_expired",
    });
  });

  it("allows a read capability while the grant is live", () => {
    const owner = ownerWithGrant(NOW + 60_000);
    expect(can(owner, "shift.view", grantedResource, options)).toBe(true);
  });

  it("denies writes even while the grant is live", () => {
    const owner = ownerWithGrant(NOW + 60_000);
    expect(authorize(owner, "site.manage", grantedResource, options)).toEqual({
      allowed: false,
      reason: "support_write_forbidden",
    });
  });

  it("denies once the grant has expired", () => {
    const owner = ownerWithGrant(NOW - 1);
    expect(can(owner, "shift.view", grantedResource, options)).toBe(false);
  });

  it("denies a grant issued for a different tenant", () => {
    const owner = ownerWithGrant(NOW + 60_000, TENANT_B);
    expect(can(owner, "shift.view", grantedResource, options)).toBe(false);
  });
});

describe("assertCan", () => {
  it("throws an error that names the capability but no record identifiers", () => {
    const cleaner = contextFor({ role: "cleaner" });
    const resource = { tenantId: TENANT_B, siteId: SITE_1, ownerUserId: USER_SELF };
    try {
      assertCan(cleaner, "report.export", resource, options);
      expect.unreachable("assertCan should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      const authError = error as AuthorizationError;
      expect(authError.reason).toBe("tenant_mismatch");
      expect(authError.message).not.toContain(TENANT_B);
    }
  });
});
