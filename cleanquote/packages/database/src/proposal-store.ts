import { many, one, type Queryable } from './client';

/** Approvals, proposals, the public client view and delivery tracking. */

export interface ApprovalRow {
  id: string;
  quote_version_id: string;
  status: string;
  scenario_key: string | null;
  price_at_submission: string | null;
  margin_pct_at_submission: string | null;
  calculation_input_hash: string | null;
  trigger_reasons: string[];
  invalidated_at: Date | null;
  invalidation_reason: string | null;
  requested_by_user_id: string | null;
  decided_by_user_id: string | null;
  decided_at: Date | null;
  reason: string | null;
  created_at: Date;
}

export async function submitForApproval(
  db: Queryable,
  input: {
    organisationId: string;
    versionId: string;
    scenarioKey: string;
    priceAtSubmission: string;
    marginPctAtSubmission: string;
    calculationInputHash: string;
    triggerReasons: readonly string[];
    requestedByUserId: string;
  },
): Promise<string> {
  const row = await one<{ id: string }>(
    db,
    `insert into public.approvals
       (organisation_id, quote_version_id, status, scenario_key, price_at_submission,
        margin_pct_at_submission, calculation_input_hash, trigger_reasons, requested_by_user_id)
     values ($1,$2,'pending',$3::public.scenario_key,$4,$5,$6,$7,$8)
     returning id`,
    [
      input.organisationId,
      input.versionId,
      input.scenarioKey,
      input.priceAtSubmission,
      input.marginPctAtSubmission,
      input.calculationInputHash,
      [...input.triggerReasons],
      input.requestedByUserId,
    ],
  );
  if (!row) throw new Error('Failed to submit the quote for approval.');
  return row.id;
}

export async function decideApproval(
  db: Queryable,
  input: {
    approvalId: string;
    status: 'approved' | 'rejected' | 'changes_requested';
    reason?: string | null;
    userId: string;
  },
): Promise<void> {
  await db.query(
    `update public.approvals
     set status = $2, reason = $3, decided_by_user_id = $4, decided_at = now()
     where id = $1 and status = 'pending'`,
    [input.approvalId, input.status, input.reason ?? null, input.userId],
  );
}

export async function latestApproval(
  db: Queryable,
  versionId: string,
): Promise<ApprovalRow | undefined> {
  return one<ApprovalRow>(
    db,
    `select id, quote_version_id, status, scenario_key::text as scenario_key, price_at_submission,
            margin_pct_at_submission, calculation_input_hash, trigger_reasons, invalidated_at,
            invalidation_reason, requested_by_user_id, decided_by_user_id, decided_at, reason, created_at
     from public.approvals
     where quote_version_id = $1
     order by created_at desc
     limit 1`,
    [versionId],
  );
}

export async function listApprovals(
  db: Queryable,
  organisationId: string,
  status = 'pending',
): Promise<(ApprovalRow & { quote_id: string; quote_title: string; reference: string })[]> {
  return many(
    db,
    `select a.id, a.quote_version_id, a.status, a.scenario_key::text as scenario_key,
            a.price_at_submission, a.margin_pct_at_submission, a.calculation_input_hash,
            a.trigger_reasons, a.invalidated_at, a.invalidation_reason, a.requested_by_user_id,
            a.decided_by_user_id, a.decided_at, a.reason, a.created_at,
            q.id as quote_id, q.title as quote_title, q.reference
     from public.approvals a
     join public.quote_versions v on v.id = a.quote_version_id
     join public.quotes q on q.id = v.quote_id
     where a.organisation_id = $1 and a.status = $2
     order by a.created_at`,
    [organisationId, status],
  );
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

export async function createProposal(
  db: Queryable,
  input: {
    organisationId: string;
    versionId: string;
    scenarioKey: string;
    title: string;
    clientMessage: string | null;
    renderedContent: unknown;
    publicTokenHash: string;
    publicTokenExpiresAt: Date;
    expiresAt: Date | null;
    sentToEmail: string | null;
    createdByUserId: string;
  },
): Promise<string> {
  const row = await one<{ id: string }>(
    db,
    `insert into public.proposals
       (organisation_id, quote_version_id, scenario_key, title, client_message, rendered_content,
        public_token, public_token_expires_at, expires_at, sent_to_email, sent_at, created_by_user_id)
     values ($1,$2,$3::public.scenario_key,$4,$5,$6,$7,$8,$9,$10,now(),$11)
     returning id`,
    [
      input.organisationId,
      input.versionId,
      input.scenarioKey,
      input.title,
      input.clientMessage,
      JSON.stringify(input.renderedContent),
      input.publicTokenHash,
      input.publicTokenExpiresAt,
      input.expiresAt,
      input.sentToEmail,
      input.createdByUserId,
    ],
  );
  if (!row) throw new Error('Failed to create the proposal.');

  await db.query(
    `insert into public.proposal_events (organisation_id, proposal_id, event_type, actor)
     values ($1, $2, 'sent', $3)`,
    [input.organisationId, row.id, input.createdByUserId],
  );

  return row.id;
}

export async function listProposals(
  db: Queryable,
  versionId: string,
): Promise<
  {
    id: string;
    scenario_key: string;
    title: string | null;
    sent_at: Date | null;
    first_viewed_at: Date | null;
    view_count: number;
    accepted_at: Date | null;
    declined_at: Date | null;
    revoked_at: Date | null;
  }[]
> {
  return many(
    db,
    `select id, scenario_key::text as scenario_key, title, sent_at, first_viewed_at,
            view_count, accepted_at, declined_at, revoked_at
     from public.proposals
     where quote_version_id = $1
     order by created_at desc`,
    [versionId],
  );
}

export async function revokeProposalLink(db: Queryable, proposalId: string): Promise<void> {
  await db.query(`update public.proposals set revoked_at = now() where id = $1`, [proposalId]);
  await db.query(
    `insert into public.proposal_events (organisation_id, proposal_id, event_type)
     select organisation_id, id, 'link_revoked' from public.proposals where id = $1`,
    [proposalId],
  );
}

export async function listProposalEvents(
  db: Queryable,
  proposalId: string,
): Promise<{ event_type: string; actor: string | null; created_at: Date }[]> {
  return many(
    db,
    `select event_type, actor, created_at
     from public.proposal_events where proposal_id = $1 order by created_at desc limit 100`,
    [proposalId],
  );
}

// ---------------------------------------------------------------------------
// Public client access
// ---------------------------------------------------------------------------

export interface PublicProposalView {
  proposalId: string;
  content: Record<string, unknown>;
  organisationName: string;
  sentAt: Date | null;
  expiresAt: Date | null;
  acceptedAt: Date | null;
  declinedAt: Date | null;
}

/**
 * Resolves a proposal from its link token.
 *
 * Delegates to `public.get_public_proposal`, the SECURITY DEFINER function that
 * checks expiry and revocation and returns only client-facing fields. The
 * anonymous role holds no table grants at all, so a leaked token cannot be
 * widened into table access.
 */
export async function readPublicProposal(
  db: Queryable,
  tokenHash: string,
): Promise<PublicProposalView | undefined> {
  const row = await one<{ result: Record<string, unknown> | null }>(
    db,
    `select public.get_public_proposal($1) as result`,
    [tokenHash],
  );
  const result = row?.result;
  if (!result) return undefined;
  return {
    proposalId: String(result['proposalId']),
    content: (result['content'] ?? {}) as Record<string, unknown>,
    organisationName: String(result['organisationName'] ?? ''),
    sentAt: result['sentAt'] ? new Date(String(result['sentAt'])) : null,
    expiresAt: result['expiresAt'] ? new Date(String(result['expiresAt'])) : null,
    acceptedAt: result['acceptedAt'] ? new Date(String(result['acceptedAt'])) : null,
    declinedAt: result['declinedAt'] ? new Date(String(result['declinedAt'])) : null,
  };
}

/** Records a client view. Runs at system level: the visitor has no identity. */
export async function recordProposalView(
  db: Queryable,
  tokenHash: string,
  context: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  const row = await one<{ id: string; organisation_id: string }>(
    db,
    `update public.proposals
     set view_count = view_count + 1,
         first_viewed_at = coalesce(first_viewed_at, now()),
         last_viewed_at = now()
     where public_token = $1 and revoked_at is null and public_token_expires_at > now()
     returning id, organisation_id`,
    [tokenHash],
  );
  if (!row) return;

  await db.query(
    `insert into public.proposal_events (organisation_id, proposal_id, event_type, metadata)
     values ($1, $2, 'viewed', $3)`,
    [
      row.organisation_id,
      row.id,
      JSON.stringify({ ip: context.ip ?? null, userAgent: context.userAgent ?? null }),
    ],
  );
}

export interface AcceptanceInput {
  readonly tokenHash: string;
  readonly signerName: string;
  readonly signerTitle: string | null;
  readonly signatureStatement: string;
  readonly selectedOptionIds: readonly string[];
  readonly ip: string | null;
  readonly userAgent: string | null;
}

/**
 * Accepts a proposal and moves the quote to won.
 *
 * The whole transition happens in one transaction: a proposal marked accepted
 * while its quote still reads "sent" would misreport the pipeline, and a
 * won quote with no acceptance record would be unauditable.
 */
export async function acceptProposal(
  db: Queryable,
  input: AcceptanceInput,
): Promise<{ proposalId: string; quoteId: string } | undefined> {
  const proposal = await one<{ id: string; organisation_id: string; quote_version_id: string }>(
    db,
    `update public.proposals
     set accepted_at = now(),
         accepted_by_name = $2,
         signer_name = $2,
         signer_title = $3,
         signature_statement = $4,
         selected_option_ids = $5,
         accepted_ip = $6,
         accepted_user_agent = $7
     where public_token = $1
       and revoked_at is null
       and public_token_expires_at > now()
       and accepted_at is null
       and declined_at is null
     returning id, organisation_id, quote_version_id`,
    [
      input.tokenHash,
      input.signerName,
      input.signerTitle,
      input.signatureStatement,
      [...input.selectedOptionIds],
      input.ip,
      input.userAgent,
    ],
  );
  if (!proposal) return undefined;

  await db.query(
    `insert into public.proposal_events (organisation_id, proposal_id, event_type, actor, metadata)
     values ($1, $2, 'accepted', $3, $4)`,
    [
      proposal.organisation_id,
      proposal.id,
      input.signerName,
      JSON.stringify({ ip: input.ip, userAgent: input.userAgent }),
    ],
  );

  const quote = await one<{ id: string }>(
    db,
    `update public.quotes q
     set status = 'accepted'
     from public.quote_versions v
     where v.id = $1 and q.id = v.quote_id
     returning q.id`,
    [proposal.quote_version_id],
  );

  if (quote) {
    await db.query(
      `insert into public.quote_outcomes (organisation_id, quote_id, outcome, decided_at)
       values ($1, $2, 'won', now())
       on conflict (quote_id) do update set outcome = 'won', decided_at = now()`,
      [proposal.organisation_id, quote.id],
    );

    await db.query(
      `update public.opportunities o
       set stage = 'won'
       from public.quotes q
       where q.id = $1 and o.id = q.opportunity_id`,
      [quote.id],
    );
  }

  return { proposalId: proposal.id, quoteId: quote?.id ?? '' };
}

export async function declineProposal(
  db: Queryable,
  tokenHash: string,
  reason: string,
  signerName: string | null,
): Promise<boolean> {
  const proposal = await one<{ id: string; organisation_id: string; quote_version_id: string }>(
    db,
    `update public.proposals
     set declined_at = now(), decline_reason = $2
     where public_token = $1 and revoked_at is null and accepted_at is null and declined_at is null
     returning id, organisation_id, quote_version_id`,
    [tokenHash, reason],
  );
  if (!proposal) return false;

  await db.query(
    `insert into public.proposal_events (organisation_id, proposal_id, event_type, actor, metadata)
     values ($1, $2, 'declined', $3, $4)`,
    [proposal.organisation_id, proposal.id, signerName, JSON.stringify({ reason })],
  );

  await db.query(
    `update public.quotes q set status = 'declined'
     from public.quote_versions v
     where v.id = $1 and q.id = v.quote_id`,
    [proposal.quote_version_id],
  );

  return true;
}

export async function requestRevision(
  db: Queryable,
  tokenHash: string,
  note: string,
  authorName: string | null,
): Promise<boolean> {
  const proposal = await one<{ id: string; organisation_id: string }>(
    db,
    `update public.proposals
     set revision_requested_at = now(), revision_request_note = $2
     where public_token = $1 and revoked_at is null and accepted_at is null
     returning id, organisation_id`,
    [tokenHash, note],
  );
  if (!proposal) return false;

  await db.query(
    `insert into public.proposal_comments
       (organisation_id, proposal_id, author_name, body, is_from_client)
     values ($1, $2, $3, $4, true)`,
    [proposal.organisation_id, proposal.id, authorName, note],
  );

  await db.query(
    `insert into public.proposal_events (organisation_id, proposal_id, event_type, actor)
     values ($1, $2, 'revision_requested', $3)`,
    [proposal.organisation_id, proposal.id, authorName],
  );

  return true;
}

export async function addClientComment(
  db: Queryable,
  tokenHash: string,
  body: string,
  authorName: string | null,
): Promise<boolean> {
  const proposal = await one<{ id: string; organisation_id: string }>(
    db,
    `select id, organisation_id from public.proposals
     where public_token = $1 and revoked_at is null and public_token_expires_at > now()`,
    [tokenHash],
  );
  if (!proposal) return false;

  await db.query(
    `insert into public.proposal_comments
       (organisation_id, proposal_id, author_name, body, is_from_client)
     values ($1, $2, $3, $4, true)`,
    [proposal.organisation_id, proposal.id, authorName, body],
  );

  await db.query(
    `insert into public.proposal_events (organisation_id, proposal_id, event_type, actor)
     values ($1, $2, 'commented', $3)`,
    [proposal.organisation_id, proposal.id, authorName],
  );

  return true;
}
