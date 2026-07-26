import { many, one, type Queryable } from './client';

/**
 * Identity storage for the local authentication provider.
 *
 * Everything here runs with the application's database role rather than under
 * RLS, because authentication happens before there is a tenant context to scope
 * to. The tables involved hold no tenant data and are granted to no tenant role.
 */

export interface AuthUserRow {
  id: string;
  email: string;
  password_hash: string;
  email_verified_at: Date | null;
  failed_attempts: number;
  locked_until: Date | null;
}

export interface SessionRow {
  id: string;
  user_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

export async function findCredentialsByEmail(
  db: Queryable,
  email: string,
): Promise<AuthUserRow | undefined> {
  return one<AuthUserRow>(
    db,
    `select user_id as id, email, password_hash, email_verified_at, failed_attempts, locked_until
     from public.local_auth_credentials
     where email = lower($1)`,
    [email],
  );
}

export async function createUserWithCredentials(
  db: Queryable,
  input: {
    email: string;
    passwordHash: string;
    fullName: string | null;
    verificationTokenHash: string;
    verificationExpiresAt: Date;
  },
): Promise<{ userId: string }> {
  const user = await one<{ id: string }>(
    db,
    `insert into auth.users (id, email) values (public.new_id(), lower($1)) returning id`,
    [input.email],
  );
  if (!user) throw new Error('Failed to create the user record.');

  await db.query(
    `insert into public.local_auth_credentials
       (user_id, email, password_hash, verification_token_hash, verification_expires_at)
     values ($1, lower($2), $3, $4, $5)`,
    [
      user.id,
      input.email,
      input.passwordHash,
      input.verificationTokenHash,
      input.verificationExpiresAt,
    ],
  );

  await db.query(
    `insert into public.user_profiles (id, full_name) values ($1, $2)
     on conflict (id) do update set full_name = excluded.full_name`,
    [user.id, input.fullName],
  );

  return { userId: user.id };
}

export async function markEmailVerified(
  db: Queryable,
  tokenHash: string,
): Promise<string | undefined> {
  const row = await one<{ user_id: string }>(
    db,
    `update public.local_auth_credentials
     set email_verified_at = now(),
         verification_token_hash = null,
         verification_expires_at = null
     where verification_token_hash = $1
       and verification_expires_at > now()
       and email_verified_at is null
     returning user_id`,
    [tokenHash],
  );
  return row?.user_id;
}

/**
 * Failure counting and lockout live in the database so the limit survives a
 * restart and holds across every application instance.
 */
export async function recordFailedLogin(db: Queryable, email: string): Promise<void> {
  await db.query(
    `update public.local_auth_credentials
     set failed_attempts = failed_attempts + 1,
         locked_until = case
           when failed_attempts + 1 >= 8 then now() + interval '15 minutes'
           else locked_until
         end
     where email = lower($1)`,
    [email],
  );
}

export async function clearFailedLogins(db: Queryable, userId: string): Promise<void> {
  await db.query(
    `update public.local_auth_credentials
     set failed_attempts = 0, locked_until = null
     where user_id = $1`,
    [userId],
  );
}

export async function setResetToken(
  db: Queryable,
  email: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<string | undefined> {
  const row = await one<{ user_id: string }>(
    db,
    `update public.local_auth_credentials
     set reset_token_hash = $2, reset_expires_at = $3
     where email = lower($1)
     returning user_id`,
    [email, tokenHash, expiresAt],
  );
  return row?.user_id;
}

export async function consumeResetToken(
  db: Queryable,
  tokenHash: string,
  passwordHash: string,
): Promise<string | undefined> {
  const row = await one<{ user_id: string }>(
    db,
    `update public.local_auth_credentials
     set password_hash = $2,
         reset_token_hash = null,
         reset_expires_at = null,
         failed_attempts = 0,
         locked_until = null
     where reset_token_hash = $1 and reset_expires_at > now()
     returning user_id`,
    [tokenHash, passwordHash],
  );
  if (!row) return undefined;

  // A password reset ends every existing session. If the reset was triggered
  // because the account was compromised, leaving the attacker's session alive
  // would defeat the exercise.
  await db.query(
    `update public.user_sessions set revoked_at = now()
     where user_id = $1 and revoked_at is null`,
    [row.user_id],
  );
  return row.user_id;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function createSession(
  db: Queryable,
  input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
): Promise<string> {
  const row = await one<{ id: string }>(
    db,
    `insert into public.user_sessions (user_id, token_hash, expires_at, ip_address, user_agent)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [
      input.userId,
      input.tokenHash,
      input.expiresAt,
      input.ipAddress ?? null,
      input.userAgent ?? null,
    ],
  );
  if (!row) throw new Error('Failed to create the session.');
  return row.id;
}

export async function findLiveSession(
  db: Queryable,
  tokenHash: string,
): Promise<{ userId: string; sessionId: string; expiresAt: Date } | undefined> {
  const row = await one<{ id: string; user_id: string; expires_at: Date }>(
    db,
    `update public.user_sessions
     set last_seen_at = now()
     where token_hash = $1 and revoked_at is null and expires_at > now()
     returning id, user_id, expires_at`,
    [tokenHash],
  );
  return row ? { sessionId: row.id, userId: row.user_id, expiresAt: row.expires_at } : undefined;
}

/** Slides the expiry forward. Called only when the session is past halfway. */
export async function refreshSession(
  db: Queryable,
  sessionId: string,
  expiresAt: Date,
): Promise<void> {
  await db.query(`update public.user_sessions set expires_at = $2 where id = $1`, [
    sessionId,
    expiresAt,
  ]);
}

export async function revokeSession(db: Queryable, tokenHash: string): Promise<void> {
  await db.query(
    `update public.user_sessions set revoked_at = now()
     where token_hash = $1 and revoked_at is null`,
    [tokenHash],
  );
}

// ---------------------------------------------------------------------------
// Membership resolution
// ---------------------------------------------------------------------------

export interface MembershipRow {
  organisation_id: string;
  organisation_name: string;
  organisation_slug: string;
  role_code: string | null;
  role_label: string | null;
  status: string;
  permissions: string[];
}

/**
 * The caller's effective permissions per organisation: role grants, plus
 * per-member grants, minus per-member revocations. Revocation wins, matching
 * `public.has_permission` exactly — this query informs the UI, it does not
 * decide anything the database has not already decided.
 */
export async function listMemberships(db: Queryable, userId: string): Promise<MembershipRow[]> {
  return many<MembershipRow>(
    db,
    `select
       o.id   as organisation_id,
       o.name as organisation_name,
       o.slug as organisation_slug,
       r.code as role_code,
       r.label as role_label,
       m.status::text as status,
       coalesce(
         array(
           select distinct p from unnest(
             coalesce(array(select rp.permission_code from public.role_permissions rp where rp.role_id = m.role_id), '{}')
             || m.granted_permissions
           ) as p
           where not (p = any (m.revoked_permissions))
         ),
         '{}'
       ) as permissions
     from public.organisation_members m
     join public.organisations o on o.id = m.organisation_id
     left join public.roles r on r.id = m.role_id
     where m.user_id = $1 and m.status = 'active' and o.deleted_at is null
     order by o.name`,
    [userId],
  );
}

export async function findUserById(
  db: Queryable,
  userId: string,
): Promise<
  { id: string; email: string; fullName: string | null; emailVerified: boolean } | undefined
> {
  const row = await one<{
    id: string;
    email: string;
    full_name: string | null;
    email_verified_at: Date | null;
  }>(
    db,
    `select u.id, u.email, p.full_name, c.email_verified_at
     from auth.users u
     left join public.user_profiles p on p.id = u.id
     left join public.local_auth_credentials c on c.user_id = u.id
     where u.id = $1`,
    [userId],
  );
  return row
    ? {
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        emailVerified: row.email_verified_at !== null,
      }
    : undefined;
}
