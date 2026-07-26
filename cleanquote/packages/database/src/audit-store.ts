import { many, one, type Queryable } from './client';

/**
 * Audit and transactional email records.
 *
 * Audit rows are append-only: there is no UPDATE or DELETE policy, and a trigger
 * refuses the operation even for a role that bypasses RLS. They are written with
 * the application's own database role because a tenant user must not be able to
 * forge or suppress their own audit trail.
 */

export interface AuditInput {
  readonly organisationId: string | null;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: string | null;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly reason?: string | null;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
  readonly impersonatedByUserId?: string | null;
}

/**
 * Writes an audit row through `public.record_audit`.
 *
 * The definer function stamps the actor from `auth.uid()` rather than trusting
 * the caller, and refuses an organisation the caller does not belong to. Going
 * through it means the audit row lands in the same transaction as the change it
 * describes, without opening an INSERT policy that would let a tenant user forge
 * their own trail.
 *
 * `actorUserId` on the input is therefore advisory. The database decides.
 */
export async function writeAudit(db: Queryable, input: AuditInput): Promise<void> {
  await db.query(
    `select public.record_audit($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8::inet, $9)`,
    [
      input.organisationId,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.before === undefined ? null : JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
      input.reason ?? null,
      input.ip ?? null,
      input.userAgent ?? null,
    ],
  );
}

export async function listAudit(
  db: Queryable,
  organisationId: string,
  limit = 100,
): Promise<
  {
    action: string;
    entity_type: string;
    entity_id: string | null;
    reason: string | null;
    created_at: Date;
    actor_user_id: string | null;
  }[]
> {
  return many(
    db,
    `select action, entity_type, entity_id, reason, created_at, actor_user_id
     from public.audit_logs
     where organisation_id = $1
     order by created_at desc
     limit $2`,
    [organisationId, limit],
  );
}

/** Activity for one quote, across every entity that references it. */
export async function listQuoteActivity(
  db: Queryable,
  organisationId: string,
  quoteId: string,
  limit = 100,
): Promise<{ action: string; entity_type: string; reason: string | null; created_at: Date }[]> {
  return many(
    db,
    `select action, entity_type, reason, created_at
     from public.audit_logs
     where organisation_id = $1 and entity_id = $2
     order by created_at desc
     limit $3`,
    [organisationId, quoteId, limit],
  );
}

// ---------------------------------------------------------------------------
// Email delivery records
// ---------------------------------------------------------------------------

export async function recordEmail(
  db: Queryable,
  input: {
    organisationId: string | null;
    kind: string;
    toEmail: string;
    subject: string;
    bodyText: string;
    provider: string;
    providerMessageId: string | null;
    status: 'queued' | 'sent' | 'failed' | 'suppressed';
    error?: string | null;
    relatedEntityType?: string | null;
    relatedEntityId?: string | null;
  },
): Promise<string> {
  const row = await one<{ record_email_delivery: string }>(
    db,
    `select public.record_email_delivery($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as record_email_delivery`,
    [
      input.organisationId,
      input.kind,
      input.toEmail,
      input.subject,
      input.bodyText,
      input.provider,
      input.providerMessageId,
      input.status,
      input.error ?? null,
      input.relatedEntityType ?? null,
      input.relatedEntityId ?? null,
    ],
  );
  if (!row) throw new Error('Failed to record the email delivery.');
  return row.record_email_delivery;
}

/** Development inbox: the messages the local provider "sent". */
export async function listEmails(
  db: Queryable,
  limit = 50,
): Promise<
  {
    id: string;
    kind: string;
    to_email: string;
    subject: string;
    body_text: string;
    status: string;
    created_at: Date;
  }[]
> {
  return many(
    db,
    `select id, kind, to_email, subject, body_text, status, created_at
     from public.email_deliveries
     order by created_at desc
     limit $1`,
    [limit],
  );
}
