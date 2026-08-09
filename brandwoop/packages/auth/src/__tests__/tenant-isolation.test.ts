import { describe, expect, it } from "vitest";

import { CAPABILITIES, type Capability } from "../capabilities";
import { authorize, can } from "../permissions";
import { NOW, SITE_1, TENANT_A, TENANT_B, USER_SELF, contextFor } from "./helpers";

const options = { nowEpochMs: NOW };

/**
 * Cross-tenant negative coverage. Scope section 2 requires a 100% pass rate for
 * these on every protected entity, so the suite iterates the whole capability
 * list rather than sampling.
 */
describe("cross-tenant access", () => {
  const foreignResource = { tenantId: TENANT_B, siteId: SITE_1, ownerUserId: USER_SELF };

  for (const role of ["cleaner", "supervisor", "administrator"] as const) {
    it(`denies every capability to a ${role} reaching into another tenant`, () => {
      const context = contextFor({ role, tenantId: TENANT_A, allocatedSiteIds: [SITE_1] });
      const allowed = CAPABILITIES.filter((capability: Capability) =>
        can(context, capability, foreignResource, options),
      );
      expect(allowed).toEqual([]);
    });
  }

  it("reports tenant_mismatch rather than a vague denial", () => {
    const context = contextFor({ role: "administrator" });
    const decision = authorize(context, "site.view", foreignResource, options);
    expect(decision).toEqual({ allowed: false, reason: "tenant_mismatch" });
  });

  it("denies a user whose active tenant is null", () => {
    const context = contextFor({ tenantId: null, membershipStatus: null });
    expect(can(context, "shift.view", { tenantId: TENANT_A }, options)).toBe(false);
  });

  it("denies an unauthenticated caller", () => {
    const context = contextFor({ userId: "" });
    const decision = authorize(context, "shift.view", { tenantId: TENANT_A }, options);
    expect(decision).toEqual({ allowed: false, reason: "not_authenticated" });
  });
});

describe("suspended membership", () => {
  it("denies all capabilities immediately on suspension", () => {
    const context = contextFor({ role: "administrator", membershipStatus: "suspended" });
    const resource = { tenantId: TENANT_A, siteId: SITE_1, ownerUserId: USER_SELF };
    const allowed = CAPABILITIES.filter((capability: Capability) =>
      can(context, capability, resource, options),
    );
    expect(allowed).toEqual([]);
  });

  it("denies an invited but not yet activated membership", () => {
    const context = contextFor({ membershipStatus: "invited" });
    const decision = authorize(
      context,
      "shift.view",
      { tenantId: TENANT_A, ownerUserId: USER_SELF },
      options,
    );
    expect(decision).toEqual({ allowed: false, reason: "membership_inactive" });
  });
});
