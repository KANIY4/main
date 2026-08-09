import type { Role } from "@brandwoop/contracts";

import type { AuthContext, SupportGrant } from "../context";

export const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const SITE_1 = "11111111-1111-4111-8111-111111111111";
export const SITE_2 = "22222222-2222-4222-8222-222222222222";
export const USER_SELF = "99999999-9999-4999-8999-999999999999";
export const USER_OTHER = "88888888-8888-4888-8888-888888888888";

export const NOW = Date.parse("2026-08-09T00:00:00Z");

interface ContextOverrides {
  role?: Role;
  tenantId?: string | null;
  membershipStatus?: AuthContext["membershipStatus"];
  allocatedSiteIds?: readonly string[];
  supportGrant?: SupportGrant | null;
  mfaSatisfied?: boolean;
  userId?: string;
}

export function contextFor(overrides: ContextOverrides = {}): AuthContext {
  return {
    userId: overrides.userId ?? USER_SELF,
    tenantId: overrides.tenantId === undefined ? TENANT_A : overrides.tenantId,
    role: overrides.role ?? "cleaner",
    membershipStatus: overrides.membershipStatus ?? "active",
    allocatedSiteIds: overrides.allocatedSiteIds ?? [SITE_1],
    supportGrant: overrides.supportGrant ?? null,
    mfaSatisfied: overrides.mfaSatisfied ?? true,
  };
}
