import { expiryFromNow, hashToken, issueToken, TOKEN_LIFETIMES } from '@cleanquote/auth';
import {
  auditStore,
  crmStore,
  proposalStore,
  quoteStore,
  tenancyStore,
  withAnonymous,
  withSystem,
  withUser,
} from '@cleanquote/database';
import { sendEmail } from '@cleanquote/email';
import type { QuoteCalculationResult, ScenarioKey, ScenarioResult } from '@cleanquote/types';

import { approvalTriggersFor } from './pricing';

/**
 * Approval, proposal generation and the secure client link.
 */

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------

/**
 * A date as a person reads it.
 *
 * Fixed to en-GB rather than the server's locale: a proposal must not say
 * 07/08 in Sydney and 08/07 in London, and "26 August 2026" cannot be
 * misread either way.
 */
function formatDate(value: Date): string {
  return value.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export interface SubmitApprovalInput {
  readonly userId: string;
  readonly organisationId: string;
  readonly quoteId: string;
  readonly scenarioKey: ScenarioKey;
}

export async function submitForApproval(
  input: SubmitApprovalInput,
): Promise<{ approvalId: string; triggers: readonly string[] }> {
  return withUser(input.userId, async (db) => {
    const version = await quoteStore.getCurrentVersion(db, input.quoteId);
    if (!version) throw new Error('That quote has no version to submit.');

    const snapshot = await quoteStore.latestSnapshot(db, version.id);
    if (!snapshot) throw new Error('Price the quote before submitting it for approval.');

    const result = snapshot.engine_output as QuoteCalculationResult;
    const scenario = result.scenarios.find((s) => s.key === input.scenarioKey);
    if (!scenario) throw new Error('That pricing strategy is not on this calculation.');

    const settings = await tenancyStore.getSettings(db, input.organisationId);
    const triggers = approvalTriggersFor(scenario, settings);

    const approvalId = await proposalStore.submitForApproval(db, {
      organisationId: input.organisationId,
      versionId: version.id,
      scenarioKey: input.scenarioKey,
      priceAtSubmission: scenario.price.annualExTax,
      marginPctAtSubmission: scenario.margin.overallGrossMarginPct,
      // The hash binds the approval to this exact calculation. A later
      // recalculation with a different hash invalidates it, by trigger.
      calculationInputHash: snapshot.input_hash,
      triggerReasons: triggers.map((t) => t.code),
      requestedByUserId: input.userId,
    });

    await quoteStore.setQuoteStatus(db, input.quoteId, 'awaiting_approval', input.userId);

    await auditStore.writeAudit(db, {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: 'approval.submitted',
      entityType: 'quote',
      entityId: input.quoteId,
      after: {
        scenario: input.scenarioKey,
        price: scenario.price.annualExTax,
        margin: scenario.margin.overallGrossMarginPct,
        calculationHash: snapshot.input_hash,
        triggers: triggers.map((t) => t.code),
      },
    });

    return { approvalId, triggers: triggers.map((t) => t.description) };
  });
}

export async function decideApproval(input: {
  userId: string;
  organisationId: string;
  quoteId: string;
  approvalId: string;
  decision: 'approved' | 'rejected' | 'changes_requested';
  comment?: string | null;
}): Promise<void> {
  await withUser(input.userId, async (db) => {
    await proposalStore.decideApproval(db, {
      approvalId: input.approvalId,
      status: input.decision,
      reason: input.comment ?? null,
      userId: input.userId,
    });

    const nextStatus =
      input.decision === 'approved'
        ? 'approved'
        : input.decision === 'rejected'
          ? 'rejected'
          : 'in_review';
    await quoteStore.setQuoteStatus(db, input.quoteId, nextStatus, input.userId);

    await auditStore.writeAudit(db, {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: `approval.${input.decision}`,
      entityType: 'quote',
      entityId: input.quoteId,
      reason: input.comment ?? null,
    });
  });

  await sendEmail({
    kind: 'approval_decision',
    to: 'estimator@example.invalid',
    subject: `Quote ${input.decision.replace('_', ' ')}`,
    body: `A reviewer marked the quote ${input.decision.replace('_', ' ')}.${
      input.comment ? `\n\nComment: ${input.comment}` : ''
    }`,
    organisationId: input.organisationId,
    relatedEntityType: 'quote',
    relatedEntityId: input.quoteId,
  });
}

// ---------------------------------------------------------------------------
// Proposal content
// ---------------------------------------------------------------------------

export type ProposalSectionKey =
  | 'cover'
  | 'executive_summary'
  | 'understanding'
  | 'site_summary'
  | 'scope'
  | 'service_schedule'
  | 'staffing'
  | 'equipment'
  | 'quality_control'
  | 'safety_compliance'
  | 'sustainability'
  | 'implementation'
  | 'optional_services'
  | 'investment'
  | 'assumptions'
  | 'exclusions'
  | 'terms'
  | 'acceptance';

export const DEFAULT_SECTION_ORDER: readonly ProposalSectionKey[] = [
  'cover',
  'executive_summary',
  'understanding',
  'site_summary',
  'scope',
  'service_schedule',
  'staffing',
  'equipment',
  'quality_control',
  'safety_compliance',
  'sustainability',
  'implementation',
  'optional_services',
  'investment',
  'assumptions',
  'exclusions',
  'terms',
  'acceptance',
];

export interface ProposalSection {
  readonly key: ProposalSectionKey;
  readonly heading: string;
  readonly body: string;
  readonly items?: readonly string[];
}

export interface ProposalContent {
  readonly title: string;
  readonly organisationName: string;
  readonly clientName: string;
  readonly siteName: string | null;
  readonly reference: string;
  /** Human-readable, because a client reads this. */
  readonly preparedOn: string;
  readonly validUntil: string;
  /** ISO, for anything that needs to compute with the date rather than show it. */
  readonly validUntilIso: string;
  readonly brandColour: string | null;
  readonly sections: readonly ProposalSection[];
  /** The one price the client sees. Never a scenario name, never a cost. */
  readonly investment: {
    readonly annualExTax: string;
    readonly annualIncTax: string;
    readonly taxLabel: string;
    readonly perVisitExTax: string | null;
    readonly perMonthExTax: string | null;
    readonly oneOffExTax: string | null;
    readonly contractTermMonths: number;
    readonly currency: string;
  };
}

/**
 * Builds the client-facing document.
 *
 * The projection is deliberately narrow. Internal margin, cost, contingency,
 * strategy names, approval thresholds and the negotiation floor are all absent
 * by construction — this function simply never reads them onto the object, so
 * there is nothing for a template bug to leak.
 */
export async function buildProposalContent(input: {
  userId: string;
  organisationId: string;
  quoteId: string;
  scenarioKey: ScenarioKey;
  includeSections?: readonly ProposalSectionKey[];
  clientMessage?: string | null;
  implementationNotes?: string | null;
}): Promise<ProposalContent> {
  return withUser(input.userId, async (db) => {
    const quote = await quoteStore.getQuote(db, input.quoteId);
    if (!quote) throw new Error('That quote was not found.');

    const version = await quoteStore.getCurrentVersion(db, input.quoteId);
    if (!version) throw new Error('That quote has no version.');

    const snapshot = await quoteStore.latestSnapshot(db, version.id);
    if (!snapshot) throw new Error('Price the quote before generating a proposal.');

    const result = snapshot.engine_output as QuoteCalculationResult;
    const scenario = result.scenarios.find((s) => s.key === input.scenarioKey);
    if (!scenario) throw new Error('That pricing strategy is not on this calculation.');

    const [settings, spaces, tasks, assumptions, exclusions, site] = await Promise.all([
      tenancyStore.getSettings(db, input.organisationId),
      quoteStore.listSpaces(db, input.quoteId),
      quoteStore.listTasks(db, input.quoteId),
      quoteStore.listQualifiers(db, input.quoteId, 'assumption'),
      quoteStore.listQualifiers(db, input.quoteId, 'exclusion'),
      quote.site_id ? crmStore.getSite(db, quote.site_id) : Promise.resolve(undefined),
    ]);

    const clients = await crmStore.listClients(db, input.organisationId);
    const client = clients.find((c) => c.id === quote.client_id);

    // The trading name, then the registered name, and only then a placeholder.
    // A proposal that says "Our company" in the body while the header carries
    // the real name reads like a template somebody forgot to fill in.
    const organisation = await tenancyStore.getOrganisation(db, input.organisationId);
    const organisationName = settings?.brand_name ?? organisation?.name ?? 'Our company';
    const included = new Set(input.includeSections ?? DEFAULT_SECTION_ORDER);
    const validUntil = new Date(Date.now() + quote.quote_validity_days * 86_400_000);

    const sections: ProposalSection[] = DEFAULT_SECTION_ORDER.filter((key) =>
      included.has(key),
    ).map((key) =>
      buildSection(key, {
        organisationName,
        clientName: client?.name ?? 'Client',
        siteName: site?.name ?? null,
        quoteTitle: quote.title,
        spaces,
        tasks,
        assumptions: assumptions.map((a) => a.statement),
        exclusions: exclusions.map((e) => e.statement),
        clientMessage: input.clientMessage ?? settings?.default_proposal_intro ?? null,
        implementationNotes: input.implementationNotes ?? null,
        paymentTerms: settings?.default_payment_terms ?? null,
        validityDays: quote.quote_validity_days,
        scenario,
        currency: quote.currency_code,
        taxLabel: settings?.tax_label ?? 'Tax',
      }),
    );

    const recurring = Number(scenario.price.annualExTax) > 0;

    return {
      title: quote.title,
      organisationName,
      clientName: client?.name ?? 'Client',
      siteName: site?.name ?? null,
      reference: quote.reference,
      preparedOn: formatDate(new Date()),
      validUntil: formatDate(validUntil),
      validUntilIso: validUntil.toISOString(),
      brandColour: settings?.primary_colour ?? null,
      sections,
      investment: {
        annualExTax: scenario.price.annualExTax,
        annualIncTax: scenario.price.annualIncTax,
        taxLabel: settings?.tax_label ?? 'Tax',
        perVisitExTax: recurring ? scenario.price.perOccurrenceExTax : null,
        perMonthExTax: recurring ? scenario.price.perMonthExTax : null,
        oneOffExTax: Number(scenario.price.oneOffExTax) > 0 ? scenario.price.oneOffExTax : null,
        contractTermMonths: quote.contract_term_months,
        currency: quote.currency_code,
      },
    };
  });
}

interface SectionContext {
  organisationName: string;
  clientName: string;
  siteName: string | null;
  quoteTitle: string;
  spaces: { name: string; room_type: string; floor_area_sqm: string | null }[];
  tasks: { label: string; frequency_pattern: string }[];
  assumptions: string[];
  exclusions: string[];
  clientMessage: string | null;
  implementationNotes: string | null;
  paymentTerms: string | null;
  validityDays: number;
  scenario: ScenarioResult;
  currency: string;
  taxLabel: string;
}

function buildSection(key: ProposalSectionKey, ctx: SectionContext): ProposalSection {
  switch (key) {
    case 'cover':
      return {
        key,
        heading: ctx.quoteTitle,
        body: `Prepared for ${ctx.clientName}${ctx.siteName ? ` — ${ctx.siteName}` : ''} by ${ctx.organisationName}.`,
      };
    case 'executive_summary':
      return {
        key,
        heading: 'Executive summary',
        body:
          ctx.clientMessage ??
          `${ctx.organisationName} proposes a cleaning programme covering ${ctx.spaces.length} area(s) across ${ctx.tasks.length} scheduled task(s), delivered by a trained and supervised team.`,
      };
    case 'understanding':
      return {
        key,
        heading: 'Understanding of your requirements',
        body: `Our understanding is based on a site walkthrough covering ${ctx.spaces.length} area(s). Anything we have assumed rather than confirmed is listed in the assumptions section, so nothing is hidden in the price.`,
      };
    case 'site_summary':
      return {
        key,
        heading: 'Site summary',
        body: ctx.siteName ? `Site: ${ctx.siteName}.` : 'Site details as discussed.',
        items: ctx.spaces.map(
          (space) =>
            `${space.name} (${space.room_type.replace(/_/g, ' ')})${
              space.floor_area_sqm
                ? ` — approximately ${Number(space.floor_area_sqm).toFixed(0)} m²`
                : ''
            }`,
        ),
      };
    case 'scope':
      return {
        key,
        heading: 'Scope of services',
        body: 'The following tasks are included in the recurring service.',
        items: ctx.tasks.map(
          (task) => `${task.label} — ${task.frequency_pattern.replace(/_/g, ' ')}`,
        ),
      };
    case 'service_schedule':
      return {
        key,
        heading: 'Service schedule',
        body: `Services are performed on the agreed schedule, ${Number(ctx.scenario.occurrencesPerYear).toFixed(0)} visits a year.`,
      };
    case 'staffing':
      return {
        key,
        heading: 'Staffing approach',
        body: 'Work is performed by trained cleaners under a named site supervisor, with relief cover arranged so service continues during leave and absence.',
      };
    case 'equipment':
      return {
        key,
        heading: 'Equipment',
        body: 'Machinery and equipment appropriate to the surfaces and areas in scope are provided and maintained by us unless stated otherwise.',
      };
    case 'quality_control':
      return {
        key,
        heading: 'Quality control',
        body: 'Scheduled supervisor audits, a documented corrective-action process, and a named contact for any issue raised between audits.',
      };
    case 'safety_compliance':
      return {
        key,
        heading: 'Safety and compliance',
        body: 'Staff are inducted to your site requirements and work to documented safe work method statements. Any regulatory requirements identified during the walkthrough are listed for your confirmation rather than assumed.',
      };
    case 'sustainability':
      return {
        key,
        heading: 'Sustainability',
        body: 'Dilution-controlled chemical systems, reusable microfibre and waste separation in line with your site arrangements.',
      };
    case 'implementation':
      return {
        key,
        heading: 'Implementation',
        body:
          ctx.implementationNotes ??
          'A mobilisation plan covering induction, key and alarm arrangements, equipment placement and the first service date is agreed before commencement.',
      };
    case 'optional_services':
      return {
        key,
        heading: 'Optional services',
        body: 'Additional services can be added at any time and are quoted separately.',
      };
    case 'investment':
      return {
        key,
        heading: 'Investment',
        body: `Pricing is set out below in ${ctx.currency}, excluding ${ctx.taxLabel} unless stated.`,
      };
    case 'assumptions':
      return {
        key,
        heading: 'Assumptions',
        body:
          ctx.assumptions.length > 0
            ? 'This price assumes the following. Please confirm or correct any that are wrong.'
            : 'No material assumptions were required.',
        items: ctx.assumptions,
      };
    case 'exclusions':
      return {
        key,
        heading: 'Exclusions',
        body:
          ctx.exclusions.length > 0
            ? 'The following are not included in this price.'
            : 'No exclusions apply.',
        items: ctx.exclusions,
      };
    case 'terms':
      return {
        key,
        heading: 'Terms',
        body: `${ctx.paymentTerms ?? 'Payment terms as agreed.'} This proposal is valid for ${ctx.validityDays} days from the date of issue.`,
      };
    case 'acceptance':
      return {
        key,
        heading: 'Acceptance',
        body: 'To proceed, accept below with your name and title. Your acceptance is recorded with the date and time and a copy is retained by both parties.',
      };
    default:
      return { key, heading: key, body: '' };
  }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export interface SendProposalResult {
  readonly proposalId: string;
  /** The full link. Returned once; only its hash is stored. */
  readonly publicUrl: string;
}

/**
 * Issues an immutable proposal and its secure link.
 *
 * Refuses when the quote needs approval and does not have it. The gate is here,
 * on the server, rather than in a disabled button.
 */
export async function sendProposal(input: {
  userId: string;
  organisationId: string;
  quoteId: string;
  scenarioKey: ScenarioKey;
  toEmail: string | null;
  clientMessage?: string | null;
  includeSections?: readonly ProposalSectionKey[];
  baseUrl: string;
}): Promise<SendProposalResult> {
  const content = await buildProposalContent({
    userId: input.userId,
    organisationId: input.organisationId,
    quoteId: input.quoteId,
    scenarioKey: input.scenarioKey,
    ...(input.includeSections ? { includeSections: input.includeSections } : {}),
    clientMessage: input.clientMessage ?? null,
  });

  const token = issueToken();

  const proposalId = await withUser(input.userId, async (db) => {
    const version = await quoteStore.getCurrentVersion(db, input.quoteId);
    if (!version) throw new Error('That quote has no version.');

    const snapshot = await quoteStore.latestSnapshot(db, version.id);
    if (!snapshot) throw new Error('Price the quote before sending it.');

    const settings = await tenancyStore.getSettings(db, input.organisationId);
    const result = snapshot.engine_output as QuoteCalculationResult;
    const scenario = result.scenarios.find((s) => s.key === input.scenarioKey);
    if (!scenario) throw new Error('That pricing strategy is not on this calculation.');

    const triggers = approvalTriggersFor(scenario, settings);
    if (triggers.length > 0) {
      const approval = await proposalStore.latestApproval(db, version.id);
      const approved = approval?.status === 'approved' && approval.invalidated_at === null;
      if (!approved) {
        throw new ApprovalRequiredError(triggers.map((t) => t.description));
      }
      // An approval granted against a different calculation is not an approval
      // of this one.
      if (approval && approval.calculation_input_hash !== snapshot.input_hash) {
        throw new ApprovalRequiredError([
          'The quote was recalculated after approval. Resubmit the current calculation for approval before sending.',
        ]);
      }
    }

    const id = await proposalStore.createProposal(db, {
      organisationId: input.organisationId,
      versionId: version.id,
      scenarioKey: input.scenarioKey,
      title: content.title,
      clientMessage: input.clientMessage ?? null,
      renderedContent: content,
      publicTokenHash: token.hash,
      publicTokenExpiresAt: expiryFromNow(TOKEN_LIFETIMES.proposalLink),
      expiresAt: new Date(content.validUntilIso),
      sentToEmail: input.toEmail,
      createdByUserId: input.userId,
    });

    await quoteStore.setQuoteStatus(db, input.quoteId, 'sent', input.userId);

    await auditStore.writeAudit(db, {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: 'proposal.sent',
      entityType: 'quote',
      entityId: input.quoteId,
      after: { proposalId: id, scenario: input.scenarioKey, to: input.toEmail },
    });

    return id;
  });

  // Sealing happens after the proposal exists, so a failure to seal cannot
  // leave a sent proposal without a record.
  await withSystem(async (db) => {
    await db.query(
      `update public.quote_versions set sealed_at = coalesce(sealed_at, now())
       where quote_id = $1 and sealed_at is null`,
      [input.quoteId],
    );
  });

  const publicUrl = `${input.baseUrl.replace(/\/$/, '')}/p/${token.value}`;

  if (input.toEmail) {
    await sendEmail({
      kind: 'proposal_sent',
      to: input.toEmail,
      subject: `Your proposal from ${content.organisationName}`,
      body: `${content.organisationName} has prepared a proposal for ${content.clientName}.\n\nView and accept it here:\n${publicUrl}\n\nThis link is valid until ${content.validUntil}.`,
      organisationId: input.organisationId,
      relatedEntityType: 'proposal',
      relatedEntityId: proposalId,
    });
  }

  return { proposalId, publicUrl };
}

export class ApprovalRequiredError extends Error {
  readonly reasons: readonly string[];
  constructor(reasons: readonly string[]) {
    super(`This quote needs approval before it can be sent: ${reasons.join('; ')}`);
    this.name = 'ApprovalRequiredError';
    this.reasons = reasons;
  }
}

// ---------------------------------------------------------------------------
// Client-side access
// ---------------------------------------------------------------------------

/**
 * Reads a proposal from its link.
 *
 * The link carries the token; only its hash is stored, so a database leak hands
 * over no readable proposal. Runs as the anonymous role, which holds no table
 * grants at all — the only thing it can call is the definer function that checks
 * expiry and revocation and returns client-facing fields.
 */
export async function readPublicProposal(token: string) {
  return withAnonymous(async (db) => proposalStore.readPublicProposal(db, hashToken(token)));
}

export async function recordProposalView(
  token: string,
  context: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  await withSystem(async (db) => {
    await proposalStore.recordProposalView(db, hashToken(token), context);
  });
}

export async function acceptProposalAsClient(input: {
  token: string;
  signerName: string;
  signerTitle: string | null;
  selectedOptionIds?: readonly string[];
  ip: string | null;
  userAgent: string | null;
}): Promise<{ accepted: boolean }> {
  const statement = `${input.signerName}${
    input.signerTitle ? `, ${input.signerTitle}` : ''
  } accepted this proposal electronically on ${new Date().toISOString()}.`;

  const outcome = await withSystem(async (db) =>
    proposalStore.acceptProposal(db, {
      tokenHash: hashToken(input.token),
      signerName: input.signerName,
      signerTitle: input.signerTitle,
      signatureStatement: statement,
      selectedOptionIds: input.selectedOptionIds ?? [],
      ip: input.ip,
      userAgent: input.userAgent,
    }),
  );

  if (!outcome) return { accepted: false };

  await withSystem(async (db) => {
    await auditStore.writeAudit(db, {
      organisationId: null,
      actorUserId: null,
      action: 'proposal.accepted_by_client',
      entityType: 'proposal',
      entityId: outcome.proposalId,
      after: { signer: input.signerName, title: input.signerTitle },
      ip: input.ip,
      userAgent: input.userAgent,
    });
  });

  return { accepted: true };
}

export async function declineProposalAsClient(
  token: string,
  reason: string,
  signerName: string | null,
): Promise<boolean> {
  return withSystem(async (db) =>
    proposalStore.declineProposal(db, hashToken(token), reason, signerName),
  );
}

export async function requestProposalRevision(
  token: string,
  note: string,
  authorName: string | null,
): Promise<boolean> {
  return withSystem(async (db) =>
    proposalStore.requestRevision(db, hashToken(token), note, authorName),
  );
}

export async function commentOnProposal(
  token: string,
  body: string,
  authorName: string | null,
): Promise<boolean> {
  return withSystem(async (db) =>
    proposalStore.addClientComment(db, hashToken(token), body, authorName),
  );
}
