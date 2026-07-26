import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * A throwaway PostgreSQL for the integration tests.
 *
 * The real migrations are applied unmodified, so these tests exercise the
 * policies and constraints that ship. Supabase's hosted pieces (`auth.users`,
 * `auth.uid()`, `storage.*`) come from the same shim the security suite uses.
 *
 * The tests skip themselves rather than fail when no PostgreSQL binary is
 * available — a contributor without a local server still gets a green unit run,
 * and CI installs the server so the integration layer is genuinely covered.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');

const PG_BIN = process.env['PG_BIN'] ?? '/usr/lib/postgresql/16/bin';
const PGDATA = '/var/tmp/cleanquote-workflow-pgdata';
const SOCKET_DIR = '/var/tmp/cleanquote-workflow-sock';
const PORT = process.env['WORKFLOW_PGPORT'] ?? '55433';
const DB_NAME = 'cleanquote_workflow';

export function postgresAvailable(): boolean {
  return existsSync(`${PG_BIN}/initdb`) && existsSync(`${PG_BIN}/pg_ctl`);
}

function run(command: string, args: string[]): void {
  execFileSync(command, args, { stdio: 'pipe' });
}

function asPostgres(command: string): void {
  // initdb refuses to run as root, which is how CI containers execute.
  if (process.getuid?.() === 0) {
    execFileSync('su', ['postgres', '-c', command], { stdio: 'pipe' });
  } else {
    execFileSync('bash', ['-c', command], { stdio: 'pipe' });
  }
}

function psql(args: string[]): void {
  run('psql', [
    '-h',
    SOCKET_DIR,
    '-p',
    PORT,
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-q',
    ...args,
  ]);
}

let started = false;

/** Boots a cluster, applies the shim and every migration, and returns the URL. */
export function startTestDatabase(): string {
  if (started) return connectionString();

  rmSync(PGDATA, { recursive: true, force: true });
  rmSync(SOCKET_DIR, { recursive: true, force: true });
  mkdirSync(PGDATA, { recursive: true });
  mkdirSync(SOCKET_DIR, { recursive: true });

  if (process.getuid?.() === 0) {
    run('chown', ['postgres:postgres', PGDATA, SOCKET_DIR]);
    run('chmod', ['700', PGDATA]);
  }

  asPostgres(`${PG_BIN}/initdb -D ${PGDATA} -U postgres --auth=trust`);
  asPostgres(
    `${PG_BIN}/pg_ctl -D ${PGDATA} -o "-k ${SOCKET_DIR} -p ${PORT} -c listen_addresses=" -l ${PGDATA}/server.log start`,
  );

  // pg_ctl returns once the postmaster reports ready, but the socket can lag a
  // moment on a loaded machine.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      run('psql', ['-h', SOCKET_DIR, '-p', PORT, '-U', 'postgres', '-tc', 'select 1']);
      break;
    } catch {
      execFileSync('sleep', ['0.25']);
    }
  }

  psql(['-c', `drop database if exists ${DB_NAME}`, '-c', `create database ${DB_NAME}`]);
  psql(['-d', DB_NAME, '-f', `${repoRoot}/supabase/test/00_supabase_shim.sql`]);

  const migrations = execFileSync('bash', ['-c', `ls ${repoRoot}/supabase/migrations/*.sql`])
    .toString()
    .trim()
    .split('\n');

  for (const migration of migrations) {
    psql(['-d', DB_NAME, '-f', migration]);
  }

  started = true;
  return connectionString();
}

export function connectionString(): string {
  return `postgresql://postgres@localhost/${DB_NAME}?host=${SOCKET_DIR}&port=${PORT}`;
}

export function stopTestDatabase(): void {
  if (!started) return;
  try {
    asPostgres(`${PG_BIN}/pg_ctl -D ${PGDATA} stop -m immediate`);
  } catch {
    // Already down.
  }
  started = false;
}
