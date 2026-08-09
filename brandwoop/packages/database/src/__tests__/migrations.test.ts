import { describe, expect, it } from "vitest";

import {
  assertSequential,
  createdTables,
  loadMigrations,
  rlsEnabledTables,
  tenantScopedTables,
} from "../migrations";

const migrations = loadMigrations();

describe("migration layout", () => {
  it("finds the migration set", () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  it("numbers migrations sequentially with no gaps or duplicates", () => {
    expect(() => assertSequential(migrations)).not.toThrow();
  });

  it("documents a rollback position in every migration header", () => {
    const missing = migrations
      .filter((migration) => !/rollback/i.test(migration.sql.slice(0, 800)))
      .map((migration) => migration.fileName);
    expect(missing).toEqual([]);
  });

  it("creates no table outside the brandwoop schema", () => {
    const strayTables = migrations.flatMap((migration) =>
      [...migration.sql.matchAll(/create table (?!brandwoop\.)(\S+)/g)].map((match) => match[1]),
    );
    expect(strayTables).toEqual([]);
  });

  it("creates each table exactly once", () => {
    const tables = createdTables(migrations);
    const duplicates = tables.filter((table, index) => tables.indexOf(table) !== index);
    expect(duplicates).toEqual([]);
  });
});

describe("tenant isolation coverage", () => {
  /**
   * Scope section 2 requires isolation on every protected entity. A new
   * tenant-scoped table with no RLS fails here rather than in production.
   */
  it("enables row-level security on every table carrying tenant_id", () => {
    const enabled = rlsEnabledTables(migrations);
    const unprotected = tenantScopedTables(migrations).filter((table) => !enabled.has(table));
    expect(unprotected).toEqual([]);
  });

  it("protects the append-only platform tables", () => {
    const enabled = rlsEnabledTables(migrations);
    expect(enabled.has("audit_log")).toBe(true);
    expect(enabled.has("outbox_event")).toBe(true);
  });
});

describe("append-only guarantees", () => {
  const allSql = migrations.map((migration) => migration.sql).join("\n");

  it("rejects updates and deletes on the audit log", () => {
    expect(allSql).toContain("create trigger audit_log_no_update");
    expect(allSql).toContain("create trigger audit_log_no_delete");
  });

  it("rejects updates and deletes on attendance events", () => {
    expect(allSql).toContain("create trigger attendance_event_no_update");
    expect(allSql).toContain("create trigger attendance_event_no_delete");
  });

  it("grants no update or delete on attendance events to the request role", () => {
    expect(allSql).toContain("grant select, insert on brandwoop.attendance_event to brandwoop_app");
  });
});

describe("duplicate prevention", () => {
  const allSql = migrations.map((migration) => migration.sql).join("\n");

  it("makes a recurrence expansion idempotent per tenant", () => {
    expect(allSql).toContain(
      "constraint shift_occurrence_unique unique (tenant_id, occurrence_key)",
    );
  });

  it("makes outbox delivery idempotent", () => {
    expect(allSql).toContain(
      "constraint outbox_event_idempotent unique (tenant_id, type, idempotency_key)",
    );
  });

  it("prevents a second report for the same source event", () => {
    expect(allSql).toContain(
      "constraint report_unique_source unique (tenant_id, type, source_entity_id)",
    );
  });

  it("prevents duplicate notifications per user, event and channel", () => {
    expect(allSql).toContain(
      "constraint notification_unique unique (user_id, outbox_event_id, channel)",
    );
  });
});

describe("storage path safety", () => {
  it("requires every upload object path to be tenant-prefixed", () => {
    const allSql = migrations.map((migration) => migration.sql).join("\n");
    expect(allSql).toContain("upload_record_tenant_prefixed");
  });
});
