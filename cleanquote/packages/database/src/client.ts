import { Pool, type PoolClient, type QueryResultRow } from 'pg';

/**
 * Database access.
 *
 * Every tenant query runs inside a transaction that has adopted the
 * `authenticated` role and set the caller's user id as the JWT claim the RLS
 * policies read. The policies that protect the data in production are therefore
 * the same policies protecting it here — the application does not get a private
 * back door, and a repository that forgets to filter by organisation still
 * cannot see another tenant's rows.
 *
 * This works unchanged against a hosted Supabase database: it is the same
 * PostgreSQL, reached by connection string.
 */

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) {
      throw new DatabaseNotConfiguredError();
    }
    pool = new Pool({
      connectionString,
      max: Number(process.env['DATABASE_POOL_MAX'] ?? 10),
      // A web request that has not produced a row in five seconds is not going
      // to; holding the connection only makes the next request worse.
      statement_timeout: 5_000,
      idle_in_transaction_session_timeout: 10_000,
      ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: true } : undefined,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      'DATABASE_URL is not set. The application runs in demonstration mode without it; see docs/DEPLOYMENT.md to connect a database.',
    );
    this.name = 'DatabaseNotConfiguredError';
  }
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env['DATABASE_URL']);
}

export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

/**
 * Runs work as the given user, under row level security.
 *
 * `set_local` scopes both settings to the transaction, so a pooled connection
 * cannot leak one request's identity into the next — the single most dangerous
 * failure mode of connection pooling with RLS.
 */
export async function withUser<T>(userId: string, work: (db: Queryable) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query('set local role authenticated');
    await client.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', userId]);
    const result = await work(wrap(client));
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Runs work with the application's own database role, bypassing RLS.
 *
 * Reserved for operations that have no tenant context by definition:
 * authentication, session lookup, invitation redemption, audit writes and email
 * delivery records. Every caller is a server-only module; nothing reachable from
 * a browser request handler should use this without first establishing who the
 * caller is.
 */
export async function withSystem<T>(work: (db: Queryable) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await work(wrap(client));
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Anonymous access, for the public proposal function. Holds no table grants. */
export async function withAnonymous<T>(work: (db: Queryable) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query('set local role anon');
    const result = await work(wrap(client));
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function wrap(client: PoolClient): Queryable {
  return {
    query: async <T extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: readonly unknown[],
    ) => {
      const result = await client.query<T>(text, values ? [...values] : undefined);
      return { rows: result.rows, rowCount: result.rowCount };
    },
  };
}

export async function one<T extends QueryResultRow>(
  db: Queryable,
  text: string,
  values?: readonly unknown[],
): Promise<T | undefined> {
  const result = await db.query<T>(text, values);
  return result.rows[0];
}

export async function many<T extends QueryResultRow>(
  db: Queryable,
  text: string,
  values?: readonly unknown[],
): Promise<T[]> {
  const result = await db.query<T>(text, values);
  return result.rows;
}

/** Fails loudly when a write that must affect a row affected none. */
export async function oneOrFail<T extends QueryResultRow>(
  db: Queryable,
  text: string,
  values: readonly unknown[],
  message: string,
): Promise<T> {
  const row = await one<T>(db, text, values);
  if (!row) throw new NotFoundError(message);
  return row;
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class PermissionDeniedError extends Error {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Postgres reports an RLS refusal as 42501. Surfacing it as a typed error keeps
 * the distinction between "not allowed" and "does not exist" — which matters,
 * because conflating them either leaks existence or hides real bugs.
 */
export function translateError(error: unknown): Error {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: string }).code;
    if (code === '42501') return new PermissionDeniedError();
    if (code === '23505') {
      return new ConflictError('That record already exists.');
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
