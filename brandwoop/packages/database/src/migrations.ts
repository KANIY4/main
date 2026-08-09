import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface MigrationFile {
  readonly sequence: number;
  readonly name: string;
  readonly fileName: string;
  readonly sql: string;
}

const MIGRATION_FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export function migrationsDirectory(): string {
  return fileURLToPath(new URL("../migrations", import.meta.url));
}

export class MigrationLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationLayoutError";
  }
}

/**
 * Reads the forward-only migration set in application order.
 *
 * Migrations are applied by sequence number, so a gap or duplicate means two
 * branches numbered the same file and one would be skipped in production.
 */
export function loadMigrations(directory: string = migrationsDirectory()): MigrationFile[] {
  const fileNames = readdirSync(directory)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  const migrations: MigrationFile[] = [];

  for (const fileName of fileNames) {
    const match = MIGRATION_FILE_PATTERN.exec(fileName);
    if (match === null) {
      throw new MigrationLayoutError(
        `Migration "${fileName}" must be named NNNN_description.sql (lowercase, underscores)`,
      );
    }

    migrations.push({
      sequence: Number(match[1]),
      name: match[2] ?? "",
      fileName,
      sql: readFileSync(join(directory, fileName), "utf8"),
    });
  }

  return migrations;
}

export function assertSequential(migrations: readonly MigrationFile[]): void {
  migrations.forEach((migration, index) => {
    const expected = index + 1;
    if (migration.sequence !== expected) {
      throw new MigrationLayoutError(
        `Expected migration ${String(expected).padStart(4, "0")}, found ${migration.fileName}`,
      );
    }
  });
}

/** Table names created under the brandwoop schema, in creation order. */
export function createdTables(migrations: readonly MigrationFile[]): string[] {
  const pattern = /create table brandwoop\.([a-z_]+)\s*\(/g;
  const tables: string[] = [];

  for (const migration of migrations) {
    for (const match of migration.sql.matchAll(pattern)) {
      const table = match[1];
      if (table !== undefined) {
        tables.push(table);
      }
    }
  }

  return tables;
}

/** Tables carrying a tenant_id column — every one of them needs RLS. */
export function tenantScopedTables(migrations: readonly MigrationFile[]): string[] {
  const statements = migrations.flatMap((migration) => splitCreateTableStatements(migration.sql));

  return statements.filter(({ body }) => /\btenant_id uuid\b/.test(body)).map(({ table }) => table);
}

function splitCreateTableStatements(sql: string): { table: string; body: string }[] {
  const pattern = /create table brandwoop\.([a-z_]+)\s*\(/g;
  const statements: { table: string; body: string }[] = [];

  for (const match of sql.matchAll(pattern)) {
    const table = match[1];
    if (table === undefined || match.index === undefined) {
      continue;
    }
    const bodyStart = match.index + match[0].length;
    const bodyEnd = sql.indexOf(");", bodyStart);
    statements.push({
      table,
      body: sql.slice(bodyStart, bodyEnd === -1 ? undefined : bodyEnd),
    });
  }

  return statements;
}

/** Tables the migration set explicitly enables row-level security on. */
export function rlsEnabledTables(migrations: readonly MigrationFile[]): Set<string> {
  const enabled = new Set<string>();

  const direct = /alter table brandwoop\.([a-z_]+) enable row level security/g;
  const arrayBlock =
    /(?:uniform_tables|site_scoped_tables|member_scoped_tables) text\[\] :=\s*array\[([^\]]+)\]/g;

  for (const migration of migrations) {
    for (const match of migration.sql.matchAll(direct)) {
      if (match[1] !== undefined) {
        enabled.add(match[1]);
      }
    }
    // Loop-applied policies list their tables in a SQL array literal.
    for (const match of migration.sql.matchAll(arrayBlock)) {
      const list = match[1] ?? "";
      for (const quoted of list.matchAll(/'([a-z_]+)'/g)) {
        if (quoted[1] !== undefined) {
          enabled.add(quoted[1]);
        }
      }
    }
  }

  return enabled;
}
