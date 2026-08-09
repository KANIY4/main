import type { Role } from "@brandwoop/contracts";

/**
 * Capability matrix — the machine-readable form of scope section 4.
 *
 * A grant states how far a role may reach, never merely whether it may act:
 *  - "none"      denied outright
 *  - "own"       only records the user authored or is assigned to
 *  - "allocated" only sites the user is allocated to
 *  - "tenant"    any record inside the user's active tenant
 *
 * Anything absent from this table is denied. There is no wildcard.
 */
export const CAPABILITIES = [
  "shift.view",
  "shift.perform",
  "shift.manage",
  "attendance.record",
  "attendance.correct.request",
  "attendance.correct.decide",
  "evidence.create",
  "evidence.view",
  "checklist.complete",
  "dailylog.manage",
  "audit.perform",
  "audit.manage",
  "issue.create",
  "issue.respond",
  "issue.verify",
  "issue.manage",
  "supply.report",
  "supply.manage",
  "site.view",
  "site.manage",
  "user.view",
  "user.manage",
  "payrate.view",
  "payrate.manage",
  "tenant.settings.manage",
  "report.view",
  "report.export",
  "notification.preferences.manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type Grant = "none" | "own" | "allocated" | "tenant";

type CapabilityMatrix = Readonly<Record<Capability, Readonly<Record<Role, Grant>>>>;

function row(
  cleaner: Grant,
  supervisor: Grant,
  administrator: Grant,
): Readonly<Record<Role, Grant>> {
  // platform_owner never receives a standing grant. Support access is granted
  // separately, time-bound and audited (see support.ts).
  return { cleaner, supervisor, administrator, platform_owner: "none" };
}

export const CAPABILITY_MATRIX: CapabilityMatrix = {
  "shift.view": row("own", "allocated", "tenant"),
  "shift.perform": row("own", "own", "none"),
  "shift.manage": row("none", "none", "tenant"),
  "attendance.record": row("own", "own", "none"),
  "attendance.correct.request": row("own", "own", "none"),
  "attendance.correct.decide": row("none", "allocated", "tenant"),
  "evidence.create": row("own", "allocated", "tenant"),
  "evidence.view": row("own", "allocated", "tenant"),
  "checklist.complete": row("own", "own", "none"),
  "dailylog.manage": row("none", "allocated", "tenant"),
  "audit.perform": row("none", "allocated", "tenant"),
  "audit.manage": row("none", "none", "tenant"),
  "issue.create": row("none", "allocated", "tenant"),
  "issue.respond": row("own", "allocated", "tenant"),
  "issue.verify": row("none", "allocated", "tenant"),
  "issue.manage": row("none", "none", "tenant"),
  "supply.report": row("own", "allocated", "tenant"),
  "supply.manage": row("none", "allocated", "tenant"),
  "site.view": row("allocated", "allocated", "tenant"),
  "site.manage": row("none", "none", "tenant"),
  "user.view": row("none", "allocated", "tenant"),
  "user.manage": row("none", "none", "tenant"),
  // Pay rates stay out of broad queries and require an explicit capability check.
  "payrate.view": row("none", "none", "tenant"),
  "payrate.manage": row("none", "none", "tenant"),
  "tenant.settings.manage": row("none", "none", "tenant"),
  "report.view": row("own", "allocated", "tenant"),
  "report.export": row("none", "allocated", "tenant"),
  "notification.preferences.manage": row("own", "own", "tenant"),
};

/**
 * Capabilities a time-bound support grant may exercise. Read-only by design:
 * support diagnoses, it does not operate a client's business (scope section 4).
 */
export const SUPPORT_READABLE_CAPABILITIES: readonly Capability[] = [
  "shift.view",
  "site.view",
  "user.view",
  "evidence.view",
  "report.view",
];
