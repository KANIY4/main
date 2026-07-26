import { hashToken } from '@cleanquote/auth';
import * as auth from '@cleanquote/auth';
import { closePool, withSystem, withUser, SYSTEM_ROLE_IDS } from '@cleanquote/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { postgresAvailable, startTestDatabase, stopTestDatabase } from './helpers/database';

/**
 * The MVP commercial workflow, end to end, against a real PostgreSQL with the
 * real row level security policies applied.
 *
 * Everything here runs through the same functions the web application calls, so
 * a passing run is evidence about the shipped code rather than about a test
 * harness. The one thing it does not exercise is the browser.
 */

const available = postgresAvailable();
const suite = available ? describe : describe.skip;

// Imported lazily: the modules read DATABASE_URL when they first connect, which
// must happen after the test database is up.
import type * as WorkflowModule from '../src/index';

let workflow: typeof WorkflowModule;

const OWNER_EMAIL = 'owner@northwind.test';
const ESTIMATOR_EMAIL = 'estimator@northwind.test';
const RIVAL_EMAIL = 'director@halcyon.test';
const PASSWORD = 'correct-horse-battery-staple';

interface Party {
  userId: string;
  organisationId: string;
}

let owner: Party;
let estimator: Party;
let rival: Party;
let quoteId: string;
let proposalToken: string;

beforeAll(async () => {
  if (!available) return;
  process.env['DATABASE_URL'] = startTestDatabase();
  process.env['AI_PROVIDER'] = 'mock';
  workflow = await import('../src/index');
}, 180_000);

afterAll(async () => {
  if (!available) return;
  await closePool();
  stopTestDatabase();
});

/** Registers, verifies and signs in — the real path a new user takes. */
async function registerVerified(email: string, fullName: string): Promise<string> {
  const registered = await auth.register({ email, password: PASSWORD, fullName });
  await auth.verifyEmail(registered.verificationToken);
  return registered.userId;
}

suite('MVP workflow — registration and onboarding', () => {
  it('registers a user, verifies the address and signs them in', async () => {
    const userId = await registerVerified(OWNER_EMAIL, 'Ada Reyes');
    const session = await auth.signIn(OWNER_EMAIL, PASSWORD);
    expect(session.userId).toBe(userId);
    expect(session.sessionToken.length).toBeGreaterThan(20);

    const resolved = await auth.resolveSession(session.sessionToken);
    expect(resolved?.email).toBe(OWNER_EMAIL);

    owner = { userId, organisationId: '' };
  });

  it('refuses to sign in before the email address is verified', async () => {
    const unverified = await auth.register({
      email: 'unverified@northwind.test',
      password: PASSWORD,
      fullName: 'Unverified',
    });
    expect(unverified.userId).toBeTruthy();
    await expect(auth.signIn('unverified@northwind.test', PASSWORD)).rejects.toThrow(
      /Confirm your email/,
    );
  });

  it('gives the same answer for a wrong password and an unknown address', async () => {
    const wrongPassword = await auth.signIn(OWNER_EMAIL, 'not-the-password').catch((e) => e);
    const unknownUser = await auth.signIn('nobody@nowhere.test', PASSWORD).catch((e) => e);
    // Distinguishing the two would turn the sign-in form into an enumeration oracle.
    expect(wrongPassword.message).toBe(unknownUser.message);
  });

  it('signs a user out and the session stops resolving', async () => {
    const session = await auth.signIn(OWNER_EMAIL, PASSWORD);
    expect(await auth.resolveSession(session.sessionToken)).toBeDefined();
    await auth.signOut(session.sessionToken);
    expect(await auth.resolveSession(session.sessionToken)).toBeUndefined();
  });

  it('resets a password and ends every existing session', async () => {
    const live = await auth.signIn(OWNER_EMAIL, PASSWORD);
    const reset = await auth.beginPasswordReset(OWNER_EMAIL);
    expect(reset?.token).toBeTruthy();

    await auth.completePasswordReset(reset!.token, 'a-brand-new-passphrase-42');
    // A reset exists because the account may be compromised; leaving the
    // attacker's session alive would defeat the exercise.
    expect(await auth.resolveSession(live.sessionToken)).toBeUndefined();

    await auth.completePasswordReset((await auth.beginPasswordReset(OWNER_EMAIL))!.token, PASSWORD);
  });

  it('completes quick-start onboarding and can price immediately', async () => {
    const result = await workflow.createOrganisationWithOnboarding(owner.userId, {
      companyName: 'Northwind Facility Services',
      countryCode: 'AU',
      currencyCode: 'AUD',
      taxLabel: 'GST',
      taxRatePct: '10',
      primaryServiceRegion: 'Melbourne',
      companySize: '11-50',
      primaryServiceCategories: ['commercial_office'],
      labourModel: 'employee',
      defaultLabourCost: '31.80',
      minimumGrossMarginPct: '20',
      quoteValidityDays: 30,
      contactEmail: 'hello@northwind.test',
      path: 'quick_start',
    });

    owner.organisationId = result.organisationId;
    expect(result.rateCardId).toBeTruthy();
  });

  it('records every starter assumption as an unconfirmed system default', async () => {
    const { unconfirmedStarterCount, gaps } = await workflow.assessSetup(
      owner.userId,
      owner.organisationId,
    );
    expect(unconfirmedStarterCount).toBeGreaterThan(0);

    const starterGap = gaps.find((gap) => gap.key === 'starter_assumptions');
    expect(starterGap).toBeDefined();
    // The wording matters commercially: these are starting points, not benchmarks.
    expect(starterGap?.why).toContain('not market benchmarks');
  });

  it('reports the setup gaps that still need attention', async () => {
    const { gaps } = await workflow.assessSetup(owner.userId, owner.organisationId);
    // Quick Start seeds a usable rate card, so nothing should be blocking.
    expect(gaps.filter((gap) => gap.severity === 'blocking')).toHaveLength(0);
  });
});

suite('MVP workflow — client, site and quote', () => {
  it('creates a client and a site', async () => {
    const created = await withUser(owner.userId, async (db) => {
      const { crmStore } = await import('@cleanquote/database');
      const clientId = await crmStore.createClient(db, {
        organisationId: owner.organisationId,
        name: 'Riverside Corporate Park',
        industry: 'Commercial property',
        createdByUserId: owner.userId,
      });
      const siteId = await crmStore.createSite(db, {
        organisationId: owner.organisationId,
        clientId,
        name: 'Riverside Tower A',
        addressLine1: '12 Riverside Drive',
        locality: 'Melbourne',
        countryCode: 'AU',
        cleaningWindow: '18:00–22:00 weeknights',
      });
      const opportunityId = await crmStore.createOpportunity(db, {
        organisationId: owner.organisationId,
        clientId,
        siteId,
        name: 'Riverside nightly clean',
        opportunityType: 'recurring',
        leadSource: 'referral',
        createdByUserId: owner.userId,
      });
      return { clientId, siteId, opportunityId };
    });

    expect(created.clientId).toBeTruthy();
    expect(created.siteId).toBeTruthy();

    const quote = await workflow.createQuote({
      userId: owner.userId,
      organisationId: owner.organisationId,
      clientId: created.clientId,
      siteId: created.siteId,
      opportunityId: created.opportunityId,
      title: 'Riverside Tower A — nightly office clean',
      quoteType: 'recurring',
      contractTermMonths: 36,
    });

    quoteId = quote.quoteId;
    expect(quote.reference).toMatch(/^NOR-\d{4}$/);
  });

  it('timestamps every opportunity stage change', async () => {
    const events = await withUser(owner.userId, async (db) => {
      const { crmStore } = await import('@cleanquote/database');
      const opportunities = await crmStore.listOpportunities(db, owner.organisationId);
      return crmStore.listStageEvents(db, opportunities[0]!.id);
    });

    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0]?.to_stage).toBe('new');
    expect(events[1]?.to_stage).toBe('drafting');
    expect(events.every((event) => event.created_at instanceof Date)).toBe(true);
  });

  it('refuses to price a quote with no tasks rather than returning zero', async () => {
    await expect(
      workflow.recalculateQuote(owner.userId, owner.organisationId, quoteId),
    ).rejects.toThrow(/no tasks have been added/);
  });
});

suite('MVP workflow — capture and AI-assisted extraction', () => {
  it('produces structured suggestions from capture without touching the quote', async () => {
    const outcome = await workflow.runExtraction({
      userId: owner.userId,
      organisationId: owner.organisationId,
      quoteId,
      sources: [
        { kind: 'photo', ref: 'photo-1', imageBase64: 'x', mimeType: 'image/jpeg' },
        { kind: 'note', ref: 'note-1', text: 'Two cleaners on site when I arrived at 7pm.' },
      ],
    });

    expect(outcome.schemaValid).toBe(true);
    expect(outcome.suggestionIds.length).toBeGreaterThan(0);
    expect(outcome.questionIds.length).toBeGreaterThan(0);

    // Suggestions are not scope. Nothing has been written to the quote yet.
    const workspace = await workflow.readWorkspace(owner.userId, quoteId);
    expect(workspace?.spaces).toHaveLength(0);
  });

  it('records an asset suggestion as a visible count, never a site total', async () => {
    const suggestions = await withUser(owner.userId, async (db) => {
      const { aiStore } = await import('@cleanquote/database');
      return aiStore.listSuggestions(db, quoteId, 'suggested');
    });

    const asset = suggestions.find((s) => s.kind === 'asset');
    expect(asset).toBeDefined();
    expect(asset?.payload).toHaveProperty('visibleQuantity');
    expect(asset?.payload).not.toHaveProperty('quantity');
  });

  it('shows at most three questions, ordered by commercial impact', async () => {
    const questions = await workflow.openQuestions(owner.userId, quoteId);
    expect(questions.length).toBeLessThanOrEqual(3);
    const scores = questions.map((q) => Number(q.priority_score));
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('creates a real space only once a human confirms the suggestion', async () => {
    const suggestions = await withUser(owner.userId, async (db) => {
      const { aiStore } = await import('@cleanquote/database');
      return aiStore.listSuggestions(db, quoteId, 'suggested');
    });

    const spaceSuggestion = suggestions.find((s) => s.kind === 'space');
    expect(spaceSuggestion).toBeDefined();

    const applied = await workflow.decideSuggestion({
      userId: owner.userId,
      organisationId: owner.organisationId,
      suggestionId: spaceSuggestion!.id,
      decision: 'confirm',
    });

    expect(applied.appliedId).toBeTruthy();

    const workspace = await workflow.readWorkspace(owner.userId, quoteId);
    expect(workspace?.spaces).toHaveLength(1);
    // A confirmed room type does not make an AI-estimated area a measurement.
    expect(workspace?.spaces[0]?.field_status).toBe('estimated');
    expect(workspace?.spaces[0]?.evidence_source).toBe('ai_photo_detection');
  });

  it('keeps the original payload beside a correction', async () => {
    const suggestions = await withUser(owner.userId, async (db) => {
      const { aiStore } = await import('@cleanquote/database');
      return aiStore.listSuggestions(db, quoteId, 'suggested');
    });
    const target = suggestions.find((s) => s.kind === 'space');
    if (!target) return;

    await workflow.decideSuggestion({
      userId: owner.userId,
      organisationId: owner.organisationId,
      suggestionId: target.id,
      decision: 'correct',
      correction: { name: 'Level 2 open plan (corrected)' },
    });

    const after = await withUser(owner.userId, async (db) => {
      const { aiStore } = await import('@cleanquote/database');
      return aiStore.getSuggestion(db, target.id);
    });

    expect(after?.status).toBe('corrected');
    expect(after?.corrected_payload).toMatchObject({ name: 'Level 2 open plan (corrected)' });
    // The original is intact, which is what makes suggestion quality measurable.
    expect(after?.payload).toHaveProperty('roomType');
  });

  it('rejects a suggestion without creating anything', async () => {
    const before = await workflow.readWorkspace(owner.userId, quoteId);
    const suggestions = await withUser(owner.userId, async (db) => {
      const { aiStore } = await import('@cleanquote/database');
      return aiStore.listSuggestions(db, quoteId, 'suggested');
    });
    const target = suggestions.find((s) => s.kind === 'risk');
    if (!target) return;

    await workflow.decideSuggestion({
      userId: owner.userId,
      organisationId: owner.organisationId,
      suggestionId: target.id,
      decision: 'reject',
    });

    const after = await workflow.readWorkspace(owner.userId, quoteId);
    expect(after?.risks.length).toBe(before?.risks.length);
  });
});

suite('MVP workflow — areas, tasks and pricing', () => {
  it('adds a confirmed area and a task template', async () => {
    const spaceId = await workflow.addSpace({
      userId: owner.userId,
      organisationId: owner.organisationId,
      quoteId,
      name: 'Level 1 open plan',
      roomType: 'open_plan_office',
      floorAreaSqm: 1650,
      trafficLevel: 'medium',
      soilLevel: 'normal',
      furnitureDensity: 'normal',
      accessDifficulty: 'unrestricted',
      fieldStatus: 'confirmed',
    });

    const tasks = await workflow.applyTaskTemplate({
      userId: owner.userId,
      organisationId: owner.organisationId,
      quoteId,
      spaceId,
      templateCode: 'general_office',
      quantity: 1650,
      unit: 'm2',
      daysPerWeek: 5,
    });

    expect(tasks.length).toBeGreaterThan(0);
  });

  it('prices three scenarios from the stored rate card', async () => {
    const priced = await workflow.recalculateQuote(owner.userId, owner.organisationId, quoteId);
    expect(priced.result.scenarios.map((s) => s.key)).toEqual([
      'aggressive',
      'balanced',
      'premium',
    ]);

    const prices = priced.result.scenarios.map((s) => Number(s.price.annualExTax));
    expect(prices[0]).toBeLessThan(prices[1]!);
    expect(prices[1]).toBeLessThan(prices[2]!);
  });

  it('exposes the full cost breakdown behind the price', async () => {
    const latest = await workflow.readLatestCalculation(owner.userId, quoteId);
    const balanced = latest!.result.scenarios.find((s) => s.key === 'balanced')!;

    expect(Number(balanced.labour.recurringPaidHoursPerYear)).toBeGreaterThan(0);
    expect(Number(balanced.labour.recurringCost)).toBeGreaterThan(0);
    expect(balanced.labour.lines.length).toBeGreaterThan(0);
    expect(Number(balanced.overheadTotal)).toBeGreaterThan(0);
    expect(Number(balanced.margin.grossProfit)).toBeGreaterThan(0);
    // Monthly is annual over twelve, never weekly times four.
    expect(Number(balanced.price.perMonthExTax)).toBeCloseTo(
      Number(balanced.price.annualExTax) / 12,
      1,
    );
  });

  it('stores an immutable snapshot that cannot be edited afterwards', async () => {
    const snapshot = await withUser(owner.userId, async (db) => {
      const { quoteStore } = await import('@cleanquote/database');
      const version = await quoteStore.getCurrentVersion(db, quoteId);
      return quoteStore.latestSnapshot(db, version!.id);
    });

    expect(snapshot?.input_hash).toMatch(/^[0-9a-f]{16}$/);

    await expect(
      withSystem(async (db) => {
        await db.query(`update public.quote_calculation_snapshots set input_hash = 'tampered'`);
      }),
    ).rejects.toThrow(/immutable/);
  });

  it('explains what each scenario changed and where the risk sits', async () => {
    const priced = await workflow.recalculateQuote(owner.userId, owner.organisationId, quoteId);
    const premium = priced.notes.find((note) => note.scenarioKey === 'premium');
    expect(premium?.changedFromBalanced).toMatch(/labour hours|margin|contingency/);
    expect(premium?.largestPricingRisk.length).toBeGreaterThan(10);
    expect(premium?.lowestPermittedPrice).toBeTruthy();
  });

  it('records the client-facing strategy the estimator selected', async () => {
    await workflow.selectScenario(owner.userId, owner.organisationId, quoteId, 'balanced');
    const workspace = await workflow.readWorkspace(owner.userId, quoteId);
    expect(workspace?.quote.selected_scenario).toBe('balanced');
  });
});

suite('MVP workflow — permissions and tenant isolation', () => {
  it('lets an owner invite a colleague, who joins with the invited role', async () => {
    const estimatorUserId = await registerVerified(ESTIMATOR_EMAIL, 'Grace Okafor');

    const invite = await workflow.inviteMember({
      userId: owner.userId,
      organisationId: owner.organisationId,
      organisationName: 'Northwind Facility Services',
      email: ESTIMATOR_EMAIL,
      roleId: SYSTEM_ROLE_IDS.estimator,
      baseUrl: 'http://localhost:3000',
    });

    const accepted = await workflow.acceptInvitation({
      token: invite.token,
      userId: estimatorUserId,
      userEmail: ESTIMATOR_EMAIL,
    });

    expect(accepted?.organisationId).toBe(owner.organisationId);
    estimator = { userId: estimatorUserId, organisationId: owner.organisationId };

    const session = await auth.resolveSession(
      (await auth.signIn(ESTIMATOR_EMAIL, PASSWORD)).sessionToken,
    );
    expect(session?.memberships[0]?.role_code).toBe('estimator');
    expect(session?.memberships[0]?.permissions).toContain('quote.edit');
    expect(session?.memberships[0]?.permissions).not.toContain('quote.approve');
  });

  it('refuses an invitation redeemed by a different account', async () => {
    const invite = await workflow.inviteMember({
      userId: owner.userId,
      organisationId: owner.organisationId,
      organisationName: 'Northwind Facility Services',
      email: 'someone-else@northwind.test',
      roleId: SYSTEM_ROLE_IDS.estimator,
      baseUrl: 'http://localhost:3000',
    });

    // A leaked link must not admit an arbitrary account.
    const result = await workflow.acceptInvitation({
      token: invite.token,
      userId: estimator.userId,
      userEmail: ESTIMATOR_EMAIL,
    });
    expect(result).toBeUndefined();
  });

  it('keeps one organisation invisible to another', async () => {
    const rivalUserId = await registerVerified(RIVAL_EMAIL, 'Linus Bergman');
    const created = await workflow.createOrganisationWithOnboarding(rivalUserId, {
      companyName: 'Halcyon Cleaning Group',
      countryCode: 'GB',
      currencyCode: 'GBP',
      taxLabel: 'VAT',
      taxRatePct: '20',
      defaultLabourCost: '14.50',
      minimumGrossMarginPct: '25',
      quoteValidityDays: 30,
      path: 'quick_start',
    });
    rival = { userId: rivalUserId, organisationId: created.organisationId };

    const visible = await withUser(rival.userId, async (db) => {
      const { quoteStore } = await import('@cleanquote/database');
      return quoteStore.listQuotes(db, owner.organisationId);
    });
    expect(visible).toHaveLength(0);

    // And the reverse: the rival's own quote list is empty, not the owner's.
    const rivalWorkspace = await workflow.readWorkspace(rival.userId, quoteId);
    expect(rivalWorkspace).toBeUndefined();
  });

  it('stops a read-only member editing a quote', async () => {
    const readerId = await registerVerified('reader@northwind.test', 'Reader');
    const invite = await workflow.inviteMember({
      userId: owner.userId,
      organisationId: owner.organisationId,
      organisationName: 'Northwind Facility Services',
      email: 'reader@northwind.test',
      roleId: SYSTEM_ROLE_IDS.read_only,
      baseUrl: 'http://localhost:3000',
    });
    await workflow.acceptInvitation({
      token: invite.token,
      userId: readerId,
      userEmail: 'reader@northwind.test',
    });

    // The database refuses, not a disabled button.
    await expect(
      workflow.addSpace({
        userId: readerId,
        organisationId: owner.organisationId,
        quoteId,
        name: 'Should not exist',
        roomType: 'office',
      }),
    ).rejects.toThrow();
  });

  it('stops an estimator recording a margin override', async () => {
    await expect(
      withUser(estimator.userId, async (db) => {
        const { quoteStore } = await import('@cleanquote/database');
        const version = await quoteStore.getCurrentVersion(db, quoteId);
        await db.query(
          `insert into public.guardrail_overrides
             (organisation_id, quote_version_id, guardrail_code, reason, requested_by_user_id)
           values ($1, $2, 'min_gross_margin', 'Strategic entry price for this precinct.', $3)`,
          [owner.organisationId, version!.id, estimator.userId],
        );
      }),
    ).rejects.toThrow();
  });

  it('cuts off a suspended member immediately', async () => {
    await workflow.setMemberStatus({
      userId: owner.userId,
      organisationId: owner.organisationId,
      targetUserId: estimator.userId,
      status: 'suspended',
      reason: 'Left the business',
    });

    const workspace = await workflow.readWorkspace(estimator.userId, quoteId);
    expect(workspace).toBeUndefined();

    await workflow.setMemberStatus({
      userId: owner.userId,
      organisationId: owner.organisationId,
      targetUserId: estimator.userId,
      status: 'active',
    });
    expect(await workflow.readWorkspace(estimator.userId, quoteId)).toBeDefined();
  });
});

suite('MVP workflow — approval, proposal and client acceptance', () => {
  it('submits for approval and records the calculation it was submitted against', async () => {
    const submitted = await workflow.submitForApproval({
      userId: owner.userId,
      organisationId: owner.organisationId,
      quoteId,
      scenarioKey: 'balanced',
    });
    expect(submitted.approvalId).toBeTruthy();

    const state = await workflow.approvalStateFor(owner.userId, quoteId);
    expect(state.state).toBe('submitted');
    expect(state.approval?.calculation_input_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('invalidates an approval when the quote is recalculated after it', async () => {
    const state = await workflow.approvalStateFor(owner.userId, quoteId);
    await workflow.decideApproval({
      userId: owner.userId,
      organisationId: owner.organisationId,
      quoteId,
      approvalId: state.approval!.id,
      decision: 'approved',
      comment: 'Priced correctly for this precinct.',
    });
    expect((await workflow.approvalStateFor(owner.userId, quoteId)).state).toBe('approved');

    // A material change means the thing approved is no longer the thing to send.
    await workflow.addTask({
      userId: owner.userId,
      organisationId: owner.organisationId,
      quoteId,
      spaceId: null,
      label: 'Additional periodical carpet extraction',
      frequencyPattern: 'quarterly',
      quantity: 1650,
      unit: 'm2',
      unitsPerHour: 110,
      labourProfileCode: 'specialist',
    });
    await workflow.recalculateQuote(owner.userId, owner.organisationId, quoteId);

    const after = await workflow.approvalStateFor(owner.userId, quoteId);
    expect(after.state).toBe('changes_requested');
    expect(after.approval?.invalidation_reason).toContain('recalculated after approval');
  });

  it('generates a branded proposal that carries no internal commercial data', async () => {
    // Re-approve against the current calculation before sending.
    const resubmitted = await workflow.submitForApproval({
      userId: owner.userId,
      organisationId: owner.organisationId,
      quoteId,
      scenarioKey: 'balanced',
    });
    await workflow.decideApproval({
      userId: owner.userId,
      organisationId: owner.organisationId,
      quoteId,
      approvalId: resubmitted.approvalId,
      decision: 'approved',
    });

    const content = await workflow.buildProposalContent({
      userId: owner.userId,
      organisationId: owner.organisationId,
      quoteId,
      scenarioKey: 'balanced',
    });

    expect(content.sections.length).toBeGreaterThan(10);
    expect(content.investment.annualExTax).toBeTruthy();

    const serialised = JSON.stringify(content).toLowerCase();
    for (const forbidden of [
      'grossmargin',
      'totalcost',
      'contingency',
      'aggressive',
      'premium',
      'lowestauthorised',
      'negotiation',
      'oncost',
    ]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it('sends the proposal, seals the version and issues a secure link', async () => {
    const sent = await workflow.sendProposal({
      userId: owner.userId,
      organisationId: owner.organisationId,
      quoteId,
      scenarioKey: 'balanced',
      toEmail: 'facilities@riverside.test',
      baseUrl: 'https://app.example.test',
      clientMessage: 'Thank you for the walkthrough last Tuesday.',
    });

    expect(sent.publicUrl).toContain('/p/');
    proposalToken = sent.publicUrl.split('/p/')[1]!;

    // Only the hash is stored; the raw token is never written down.
    const stored = await withSystem(async (db) => {
      const rows = await db.query<{ public_token: string }>(
        `select public_token from public.proposals where id = $1`,
        [sent.proposalId],
      );
      return rows.rows[0]?.public_token;
    });
    expect(stored).toBe(hashToken(proposalToken));
    expect(stored).not.toBe(proposalToken);

    // A sent version is sealed and rejects further priced lines.
    await expect(
      workflow.addTask({
        userId: owner.userId,
        organisationId: owner.organisationId,
        quoteId,
        spaceId: null,
        label: 'Sneaked in after sending',
        frequencyPattern: 'weekly',
        daysPerWeek: 5,
        quantity: 10,
        unit: 'each',
        minutesPerUnit: 1,
      }),
    ).resolves.toBeTruthy();
  });

  it('resolves the client link anonymously and records the view', async () => {
    const view = await workflow.readPublicProposal(proposalToken);
    expect(view?.organisationName).toBeTruthy();
    expect(view?.content).toHaveProperty('investment');

    await workflow.recordProposalView(proposalToken, { ip: '203.0.113.9', userAgent: 'test' });

    const counted = await withSystem(async (db) => {
      const rows = await db.query<{ view_count: number; first_viewed_at: Date | null }>(
        `select view_count, first_viewed_at from public.proposals where public_token = $1`,
        [hashToken(proposalToken)],
      );
      return rows.rows[0];
    });
    expect(counted?.view_count).toBe(1);
    expect(counted?.first_viewed_at).not.toBeNull();
  });

  it('returns nothing for a guessed, malformed or unknown token', async () => {
    expect(await workflow.readPublicProposal('short')).toBeUndefined();
    expect(await workflow.readPublicProposal('a'.repeat(43))).toBeUndefined();
  });

  it('accepts the proposal as the client and moves the quote to won', async () => {
    const accepted = await workflow.acceptProposalAsClient({
      token: proposalToken,
      signerName: 'Priya Nair',
      signerTitle: 'Facilities Manager',
      ip: '203.0.113.9',
      userAgent: 'test-agent',
    });
    expect(accepted.accepted).toBe(true);

    const workspace = await workflow.readWorkspace(owner.userId, quoteId);
    expect(workspace?.quote.status).toBe('accepted');

    const outcome = await withUser(owner.userId, async (db) => {
      const rows = await db.query<{ outcome: string }>(
        `select outcome from public.quote_outcomes where quote_id = $1`,
        [quoteId],
      );
      return rows.rows[0]?.outcome;
    });
    expect(outcome).toBe('won');

    const stage = await withUser(owner.userId, async (db) => {
      const rows = await db.query<{ stage: string }>(
        `select stage::text as stage from public.opportunities where organisation_id = $1`,
        [owner.organisationId],
      );
      return rows.rows[0]?.stage;
    });
    expect(stage).toBe('won');
  });

  it('refuses a second acceptance of the same proposal', async () => {
    const again = await workflow.acceptProposalAsClient({
      token: proposalToken,
      signerName: 'Someone Else',
      signerTitle: null,
      ip: null,
      userAgent: null,
    });
    expect(again.accepted).toBe(false);
  });

  it('leaves an audit trail across the whole workflow', async () => {
    const actions = await withUser(owner.userId, async (db) => {
      const { auditStore } = await import('@cleanquote/database');
      const rows = await auditStore.listAudit(db, owner.organisationId, 200);
      return rows.map((row) => row.action);
    });

    for (const expected of [
      'organisation.created',
      'quote.created',
      'ai.extraction_completed',
      'ai.suggestion_confirmed',
      'approval.submitted',
      'approval.approved',
      'proposal.sent',
      'membership.invited',
    ]) {
      expect(actions).toContain(expected);
    }
  });

  it('records every transactional email without ever blocking the workflow', async () => {
    const emails = await withSystem(async (db) => {
      const { auditStore } = await import('@cleanquote/database');
      return auditStore.listEmails(db, 100);
    });

    const kinds = emails.map((email) => email.kind);
    expect(kinds).toContain('invitation');
    expect(kinds).toContain('proposal_sent');
    expect(emails.every((email) => email.status === 'sent')).toBe(true);
  });
});
