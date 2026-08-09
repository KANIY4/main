#!/usr/bin/env node
// Migration lint for CI (scope section 12, PR validation gate).
//
// Fails when migrations are misnamed, out of sequence, missing a rollback note,
// or when a tenant-scoped table has no row-level security.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("../migrations", import.meta.url));
const pattern = /^(\d{4})_([a-z0-9_]+)\.sql$/;

const problems = [];
const files = readdirSync(directory)
  .filter((name) => name.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  problems.push("No migrations found");
}

files.forEach((fileName, index) => {
  const match = pattern.exec(fileName);
  if (match === null) {
    problems.push(`${fileName}: name must match NNNN_description.sql`);
    return;
  }

  const sequence = Number(match[1]);
  if (sequence !== index + 1) {
    problems.push(`${fileName}: expected sequence ${String(index + 1).padStart(4, "0")}`);
  }

  const sql = readFileSync(join(directory, fileName), "utf8");
  if (!/rollback/i.test(sql.slice(0, 800))) {
    problems.push(`${fileName}: header must state the rollback or forward-repair position`);
  }
  if (/drop table/i.test(sql)) {
    problems.push(`${fileName}: DROP TABLE is not permitted in a forward migration`);
  }
});

const allSql = files.map((name) => readFileSync(join(directory, name), "utf8")).join("\n");
const tenantTables = new Set();
for (const match of allSql.matchAll(/create table brandwoop\.([a-z_]+)\s*\(([^;]*?)\n\);/gs)) {
  if (/\btenant_id uuid\b/.test(match[2])) {
    tenantTables.add(match[1]);
  }
}

const rlsTables = new Set();
for (const match of allSql.matchAll(
  /alter table brandwoop\.([a-z_]+) enable row level security/g,
)) {
  rlsTables.add(match[1]);
}
for (const match of allSql.matchAll(/text\[\] :=\s*array\[([^\]]+)\]/g)) {
  for (const quoted of match[1].matchAll(/'([a-z_]+)'/g)) {
    rlsTables.add(quoted[1]);
  }
}

for (const table of tenantTables) {
  if (!rlsTables.has(table)) {
    problems.push(`brandwoop.${table}: tenant-scoped table has no row-level security`);
  }
}

if (problems.length > 0) {
  console.error("Migration check failed:");
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log(
  `Migration check passed: ${files.length} migrations, ${tenantTables.size} tenant tables protected.`,
);
