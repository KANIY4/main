'use server';

import { publicEnv } from '@cleanquote/config';
import { crmStore, withUser } from '@cleanquote/database';
import type { ScenarioKey } from '@cleanquote/types';
import * as flow from '@cleanquote/workflow';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { consumeRateLimit } from '../rate-limit';
import { assertPermission, requestContext, requireActor, setActiveOrganisation } from '../session';

/**
 * Workflow actions.
 *
 * Each one resolves the actor, checks the permission it needs, then delegates to
 * `@cleanquote/workflow`. No business rule and no pricing formula lives here —
 * this file is a boundary, not a layer.
 */

export interface ActionState {
  readonly error?: string;
  readonly notice?: string;
}

function fail(error: unknown): ActionState {
  return { error: error instanceof Error ? error.message : 'Something went wrong.' };
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export async function completeOnboardingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await import('../session').then((m) => m.currentSession());
  if (!session) redirect('/sign-in');

  const path = String(formData.get('path') ?? 'quick_start') as 'quick_start' | 'advanced';

  try {
    const result = await flow.createOrganisationWithOnboarding(session.userId, {
      companyName: String(formData.get('companyName') ?? '').trim(),
      countryCode: String(formData.get('countryCode') ?? 'AU').toUpperCase(),
      currencyCode: String(formData.get('currencyCode') ?? 'AUD').toUpperCase(),
      taxLabel: String(formData.get('taxLabel') ?? 'GST'),
      taxRatePct: String(formData.get('taxRatePct') ?? '10'),
      primaryServiceRegion: String(formData.get('primaryServiceRegion') ?? '') || null,
      companySize: String(formData.get('companySize') ?? '') || null,
      primaryServiceCategories: formData.getAll('serviceCategories').map(String),
      labourModel: String(formData.get('labourModel') ?? 'employee') as 'employee',
      defaultLabourCost: String(formData.get('defaultLabourCost') ?? '30'),
      minimumGrossMarginPct: String(formData.get('minimumGrossMarginPct') ?? '20'),
      quoteValidityDays: Number(formData.get('quoteValidityDays') ?? 30),
      contactEmail: String(formData.get('contactEmail') ?? '') || null,
      contactPhone: String(formData.get('contactPhone') ?? '') || null,
      path,
    });

    await setActiveOrganisation(result.organisationId);
  } catch (error) {
    return fail(error);
  }

  redirect('/dashboard');
}

// ---------------------------------------------------------------------------
// Clients, sites, quotes
// ---------------------------------------------------------------------------

export async function createClientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.edit');

  try {
    await withUser(actor.userId, async (db) => {
      const clientId = await crmStore.createClient(db, {
        organisationId: actor.organisationId,
        name: String(formData.get('name') ?? '').trim(),
        industry: String(formData.get('industry') ?? '') || null,
        notes: String(formData.get('notes') ?? '') || null,
        createdByUserId: actor.userId,
      });

      const contactName = String(formData.get('contactName') ?? '').trim();
      if (contactName) {
        await crmStore.createClientContact(db, {
          organisationId: actor.organisationId,
          clientId,
          fullName: contactName,
          email: String(formData.get('contactEmail') ?? '') || null,
          phone: String(formData.get('contactPhone') ?? '') || null,
          isPrimary: true,
        });
      }
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath('/clients');
  return { notice: 'Client created.' };
}

export async function createSiteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.edit');

  try {
    await withUser(actor.userId, async (db) => {
      await crmStore.createSite(db, {
        organisationId: actor.organisationId,
        clientId: String(formData.get('clientId') ?? '') || null,
        name: String(formData.get('name') ?? '').trim(),
        addressLine1: String(formData.get('addressLine1') ?? '') || null,
        locality: String(formData.get('locality') ?? '') || null,
        region: String(formData.get('region') ?? '') || null,
        postcode: String(formData.get('postcode') ?? '') || null,
        siteOperatingHours: String(formData.get('operatingHours') ?? '') || null,
        cleaningWindow: String(formData.get('cleaningWindow') ?? '') || null,
        accessProcess: String(formData.get('accessProcess') ?? '') || null,
        parkingNotes: String(formData.get('parking') ?? '') || null,
        securityRequirements: String(formData.get('security') ?? '') || null,
        inductionRequirements: String(formData.get('induction') ?? '') || null,
        currentContractor: String(formData.get('incumbent') ?? '') || null,
      });
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath('/clients');
  return { notice: 'Site created.' };
}

export async function createQuoteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.create');

  let quoteId: string;
  try {
    const clientId = String(formData.get('clientId') ?? '') || null;
    const siteId = String(formData.get('siteId') ?? '') || null;

    const opportunityId = await withUser(actor.userId, async (db) =>
      crmStore.createOpportunity(db, {
        organisationId: actor.organisationId,
        clientId,
        siteId,
        name: String(formData.get('title') ?? 'New opportunity').trim(),
        opportunityType: String(formData.get('quoteType') ?? 'recurring'),
        leadSource: String(formData.get('leadSource') ?? '') || null,
        createdByUserId: actor.userId,
      }),
    );

    const created = await flow.createQuote({
      userId: actor.userId,
      organisationId: actor.organisationId,
      clientId,
      siteId,
      opportunityId,
      title: String(formData.get('title') ?? '').trim(),
      quoteType: String(formData.get('quoteType') ?? 'recurring') as flow.QuoteType,
      contractTermMonths: Number(formData.get('contractTermMonths') ?? 12),
    });
    quoteId = created.quoteId;
  } catch (error) {
    return fail(error);
  }

  redirect(`/quotes/${quoteId}`);
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

export async function addSpaceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.edit');
  const quoteId = String(formData.get('quoteId') ?? '');

  try {
    await flow.addSpace({
      userId: actor.userId,
      organisationId: actor.organisationId,
      quoteId,
      name: String(formData.get('name') ?? '').trim(),
      roomType: String(formData.get('roomType') ?? 'other'),
      floorAreaSqm: formData.get('floorAreaSqm') ? Number(formData.get('floorAreaSqm')) : null,
      trafficLevel: String(formData.get('traffic') ?? 'medium'),
      soilLevel: String(formData.get('soil') ?? 'normal'),
      furnitureDensity: String(formData.get('furniture') ?? 'normal'),
      accessDifficulty: String(formData.get('access') ?? 'unrestricted'),
      fieldStatus: String(formData.get('fieldStatus') ?? 'confirmed') as 'confirmed',
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath(`/quotes/${quoteId}/capture`);
  return { notice: 'Area added.' };
}

export async function applyTemplateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.edit');
  const quoteId = String(formData.get('quoteId') ?? '');

  try {
    await flow.applyTaskTemplate({
      userId: actor.userId,
      organisationId: actor.organisationId,
      quoteId,
      spaceId: String(formData.get('spaceId') ?? ''),
      templateCode: String(formData.get('templateCode') ?? 'general_office'),
      quantity: Number(formData.get('quantity') ?? 1),
      unit: String(formData.get('unit') ?? 'm2'),
      daysPerWeek: Number(formData.get('daysPerWeek') ?? 5),
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath(`/quotes/${quoteId}`);
  return { notice: 'Tasks added from the template.' };
}

export async function addTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.edit');
  const quoteId = String(formData.get('quoteId') ?? '');
  const spaceId = String(formData.get('spaceId') ?? '');

  // Minutes-per-unit and units-per-hour are two ways of saying the same thing.
  // Whichever the estimator filled in is the one that travels; sending both
  // would leave the engine to guess which the person meant.
  const minutes = formData.get('minutesPerUnit');
  const perHour = formData.get('unitsPerHour');

  try {
    await flow.addTask({
      userId: actor.userId,
      organisationId: actor.organisationId,
      quoteId,
      spaceId: spaceId || null,
      label: String(formData.get('label') ?? '').trim(),
      frequencyPattern: String(formData.get('frequencyPattern') ?? 'weekly'),
      daysPerWeek: formData.get('daysPerWeek') ? Number(formData.get('daysPerWeek')) : null,
      quantity: Number(formData.get('quantity') ?? 1),
      unit: String(formData.get('unit') ?? 'm2'),
      minutesPerUnit: minutes ? Number(minutes) : null,
      unitsPerHour: perHour ? Number(perHour) : null,
      labourProfileCode: String(formData.get('labourProfileCode') ?? 'cleaner'),
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath(`/quotes/${quoteId}`);
  return { notice: 'Task added. Recalculate to see it in the price.' };
}

export async function addCostLineAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.edit');
  const quoteId = String(formData.get('quoteId') ?? '');
  const label = String(formData.get('label') ?? '').trim();
  if (!label) return { error: 'Name the cost so it can be recognised on the breakdown.' };

  // The amount stays a string the whole way down. Parsing it to a float here to
  // "validate" it would quietly round the value before the engine ever sees it.
  const amount = String(formData.get('amount') ?? '').trim();
  if (!/^\d+(\.\d{1,4})?$/.test(amount)) {
    return { error: 'Enter the amount as a number, for example 1250 or 1250.50.' };
  }

  try {
    await flow.addCostLine({
      userId: actor.userId,
      organisationId: actor.organisationId,
      quoteId,
      lineKey:
        String(formData.get('lineKey') ?? '').trim() || label.toLowerCase().replace(/\W+/g, '_'),
      label,
      category: String(formData.get('category') ?? 'consumables'),
      method: String(formData.get('method') ?? 'per_year'),
      amount,
      oneOff: formData.get('oneOff') === 'yes',
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath(`/quotes/${quoteId}`);
  return { notice: 'Cost line saved. Recalculate to see it in the price.' };
}

export async function addQualifierAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.edit');
  const quoteId = String(formData.get('quoteId') ?? '');
  const statement = String(formData.get('statement') ?? '').trim();
  if (!statement) return { error: 'Write the statement as it should appear to the client.' };

  try {
    await flow.addQualifier({
      userId: actor.userId,
      organisationId: actor.organisationId,
      quoteId,
      kind: String(formData.get('kind') ?? 'assumption') as 'assumption',
      statement,
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath(`/quotes/${quoteId}`);
  return { notice: 'Saved. It will appear in the proposal.' };
}

export async function addObservationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.edit');
  const quoteId = String(formData.get('quoteId') ?? '');

  try {
    await withUser(actor.userId, async (db) => {
      const { quoteStore } = await import('@cleanquote/database');
      await quoteStore.createObservation(db, {
        organisationId: actor.organisationId,
        quoteId,
        observationType: String(formData.get('type') ?? 'other'),
        summary: String(formData.get('summary') ?? '').trim(),
        // Asked explicitly, never defaulted: a partial window can support a
        // price but must not define one.
        observationWindowComplete: formData.get('windowComplete') === 'yes',
        createdByUserId: actor.userId,
        evidenceSource: 'manual_entry',
      });
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath(`/quotes/${quoteId}/capture`);
  return { notice: 'Observation recorded.' };
}

export async function addRiskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.edit');
  const quoteId = String(formData.get('quoteId') ?? '');

  try {
    await flow.addRisk({
      userId: actor.userId,
      organisationId: actor.organisationId,
      quoteId,
      code: String(formData.get('code') ?? 'site_risk'),
      label: String(formData.get('label') ?? '').trim(),
      probability: Number(formData.get('probability') ?? 0.3),
      impactAmount: String(formData.get('impact') ?? '0'),
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath(`/quotes/${quoteId}`);
  return { notice: 'Risk added.' };
}

export async function setFieldStatusAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.edit');
  await flow.setFieldStatus({
    userId: actor.userId,
    organisationId: actor.organisationId,
    entity: String(formData.get('entity') ?? 'space') as 'space',
    entityId: String(formData.get('entityId') ?? ''),
    status: String(formData.get('status') ?? 'confirmed') as 'confirmed',
  });
  revalidatePath(`/quotes/${String(formData.get('quoteId') ?? '')}`);
}

export async function setPhotoVisibilityAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.edit');
  await flow.setMediaProposalVisibility({
    userId: actor.userId,
    organisationId: actor.organisationId,
    fileId: String(formData.get('fileId') ?? ''),
    allow: formData.get('allow') === 'yes',
  });
  revalidatePath(`/quotes/${String(formData.get('quoteId') ?? '')}`);
}

export async function deletePhotoAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.edit');
  await flow.deleteMedia({
    userId: actor.userId,
    organisationId: actor.organisationId,
    fileId: String(formData.get('fileId') ?? ''),
    reason: String(formData.get('reason') ?? '') || null,
  });
  const quoteId = String(formData.get('quoteId') ?? '');
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath(`/quotes/${quoteId}/capture`);
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export async function runExtractionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.edit');
  const quoteId = String(formData.get('quoteId') ?? '');
  const note = String(formData.get('note') ?? '').trim();

  // Model calls cost money and a stuck finger should not spend it. The
  // organisation is the key rather than the user: the budget is the company's.
  const limit = await consumeRateLimit(`extraction:${actor.organisationId}`, {
    limit: 30,
    windowSeconds: 300,
  });
  if (!limit.allowed) {
    return {
      error: `The assistant has been asked to analyse a lot in a short time. Try again in ${limit.retryAfterSeconds} seconds.`,
    };
  }

  try {
    const outcome = await flow.runExtraction({
      userId: actor.userId,
      organisationId: actor.organisationId,
      quoteId,
      sources: note
        ? [{ kind: 'note', ref: `note-${Date.now()}`, text: note }]
        : [{ kind: 'photo', ref: `capture-${Date.now()}` }],
    });

    revalidatePath(`/quotes/${quoteId}`);

    if (!outcome.schemaValid) {
      return {
        error:
          'The analysis came back in a shape we could not trust, so nothing was saved. The attempt is recorded in the AI log.',
      };
    }
    return {
      notice: `${outcome.suggestionIds.length} suggestion(s) ready for review, from ${outcome.provider}.`,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function decideSuggestionAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.edit');
  const quoteId = String(formData.get('quoteId') ?? '');
  const correctionName = String(formData.get('correctedName') ?? '').trim();

  await flow.decideSuggestion({
    userId: actor.userId,
    organisationId: actor.organisationId,
    suggestionId: String(formData.get('suggestionId') ?? ''),
    decision: String(formData.get('decision') ?? 'confirm') as 'confirm',
    ...(correctionName ? { correction: { name: correctionName } } : {}),
  });

  revalidatePath(`/quotes/${quoteId}`);
}

/** The form variant, for answering a question with text rather than one tap. */
export async function submitQuestionAnswerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const answer = String(formData.get('answer') ?? '').trim();
  if (!answer) return { error: 'Write the answer, or use one of the buttons below.' };

  try {
    await answerQuestionAction(formData);
  } catch (error) {
    return fail(error);
  }
  return { notice: 'Answer recorded.' };
}

export async function answerQuestionAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.edit');
  await flow.answerQuestion({
    userId: actor.userId,
    organisationId: actor.organisationId,
    questionId: String(formData.get('questionId') ?? ''),
    status: String(formData.get('status') ?? 'answered') as 'answered',
    answer: String(formData.get('answer') ?? '') || null,
  });
  revalidatePath(`/quotes/${String(formData.get('quoteId') ?? '')}`);
}

// ---------------------------------------------------------------------------
// Pricing, approval, proposal
// ---------------------------------------------------------------------------

export async function recalculateAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.edit');
  const quoteId = String(formData.get('quoteId') ?? '');
  await flow.recalculateQuote(actor.userId, actor.organisationId, quoteId);
  revalidatePath(`/quotes/${quoteId}`);
}

export async function selectScenarioAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.edit');
  const quoteId = String(formData.get('quoteId') ?? '');
  await flow.selectScenario(
    actor.userId,
    actor.organisationId,
    quoteId,
    String(formData.get('scenarioKey') ?? 'balanced') as ScenarioKey,
  );
  revalidatePath(`/quotes/${quoteId}`);
}

export async function submitForApprovalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.edit');
  const quoteId = String(formData.get('quoteId') ?? '');

  try {
    const result = await flow.submitForApproval({
      userId: actor.userId,
      organisationId: actor.organisationId,
      quoteId,
      scenarioKey: String(formData.get('scenarioKey') ?? 'balanced') as ScenarioKey,
    });
    revalidatePath(`/quotes/${quoteId}`);
    return {
      notice:
        result.triggers.length > 0
          ? `Submitted. Approval is required because: ${result.triggers.join(' ')}`
          : 'Submitted for approval.',
    };
  } catch (error) {
    return fail(error);
  }
}

export async function decideApprovalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  // The reviewer permission, checked here and again by the database policy.
  assertPermission(actor, 'quote.approve');
  const quoteId = String(formData.get('quoteId') ?? '');

  try {
    await flow.decideApproval({
      userId: actor.userId,
      organisationId: actor.organisationId,
      quoteId,
      approvalId: String(formData.get('approvalId') ?? ''),
      decision: String(formData.get('decision') ?? 'approved') as 'approved',
      comment: String(formData.get('comment') ?? '') || null,
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath('/approvals');
  return { notice: 'Decision recorded.' };
}

export async function sendProposalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  assertPermission(actor, 'quote.send');
  const quoteId = String(formData.get('quoteId') ?? '');

  try {
    const sent = await flow.sendProposal({
      userId: actor.userId,
      organisationId: actor.organisationId,
      quoteId,
      scenarioKey: String(formData.get('scenarioKey') ?? 'balanced') as ScenarioKey,
      toEmail: String(formData.get('toEmail') ?? '') || null,
      clientMessage: String(formData.get('clientMessage') ?? '') || null,
      baseUrl: publicEnv().NEXT_PUBLIC_APP_URL,
    });

    revalidatePath(`/quotes/${quoteId}`);
    return { notice: `Proposal sent. Client link: ${sent.publicUrl}` };
  } catch (error) {
    if (error instanceof flow.ApprovalRequiredError) {
      return { error: error.message };
    }
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// Client-facing
// ---------------------------------------------------------------------------

export async function acceptProposalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = String(formData.get('token') ?? '');
  const signerName = String(formData.get('signerName') ?? '').trim();
  if (!signerName) return { error: 'Enter the name of the person accepting.' };

  const context = await requestContext();
  // Keyed on the caller, never on the token: keying on the token would let one
  // visitor lock a client out of accepting their own proposal.
  const limit = await consumeRateLimit(`proposal-decision:${context.ip ?? 'unknown'}`, {
    limit: 20,
    windowSeconds: 600,
  });
  if (!limit.allowed) {
    return { error: 'Too many attempts. Please wait a moment and try again.' };
  }

  const result = await flow.acceptProposalAsClient({
    token,
    signerName,
    signerTitle: String(formData.get('signerTitle') ?? '') || null,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  if (!result.accepted) {
    return {
      error: 'This proposal can no longer be accepted. Contact us and we will re-issue it.',
    };
  }
  revalidatePath(`/p/${token}`);
  return { notice: 'Thank you — your acceptance has been recorded.' };
}

export async function declineProposalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = String(formData.get('token') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  const declined = await flow.declineProposalAsClient(
    token,
    reason || 'No reason given',
    String(formData.get('signerName') ?? '') || null,
  );
  if (!declined) return { error: 'This proposal can no longer be declined.' };
  revalidatePath(`/p/${token}`);
  return { notice: 'Thank you for letting us know.' };
}

export async function requestRevisionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = String(formData.get('token') ?? '');
  const note = String(formData.get('note') ?? '').trim();
  if (!note) return { error: 'Tell us what you would like changed.' };

  const ok = await flow.requestProposalRevision(
    token,
    note,
    String(formData.get('authorName') ?? '') || null,
  );
  if (!ok) return { error: 'This proposal is no longer open for revisions.' };
  revalidatePath(`/p/${token}`);
  return { notice: 'Your request has been sent to the team.' };
}

// ---------------------------------------------------------------------------
// Rate card and organisation settings
// ---------------------------------------------------------------------------

export async function updateLabourRateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  assertPermission(actor, 'rate_card.manage');

  const rate = String(formData.get('baseHourlyRate') ?? '').trim();
  if (!/^\d+(\.\d{1,4})?$/.test(rate)) {
    return { error: 'Enter the hourly rate as a number, for example 31.80.' };
  }

  try {
    await flow.updateLabourProfile({
      userId: actor.userId,
      organisationId: actor.organisationId,
      code: String(formData.get('code') ?? ''),
      label: String(formData.get('label') ?? '').trim(),
      baseHourlyRate: rate,
      engagement: String(formData.get('engagement') ?? 'employee'),
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath('/settings/rate-card');
  return { notice: 'Saved. Quotes already sent keep the rate card they were priced against.' };
}

export async function updateCommercialRulesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  assertPermission(actor, 'rate_card.manage');

  try {
    await flow.updateCommercialRules({
      userId: actor.userId,
      organisationId: actor.organisationId,
      minGrossMarginPct: optionalDecimal(formData.get('minGrossMarginPct')),
      minHourlyRecovery: optionalDecimal(formData.get('minHourlyRecovery')),
      minChargePerVisit: optionalDecimal(formData.get('minChargePerVisit')),
      approvalBelowMarginPct: optionalDecimal(formData.get('approvalBelowMarginPct')),
      approvalAboveAnnualValue: optionalDecimal(formData.get('approvalAboveAnnualValue')),
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath('/settings/rate-card');
  return { notice: 'Commercial rules updated.' };
}

/** Blank means "no rule", which is different from zero. */
function optionalDecimal(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return /^\d+(\.\d{1,4})?$/.test(text) ? text : null;
}

export async function confirmStarterValueAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  assertPermission(actor, 'organisation.manage');
  await flow.confirmStarterValue({
    userId: actor.userId,
    organisationId: actor.organisationId,
    settingKey: String(formData.get('settingKey') ?? ''),
  });
  revalidatePath('/settings/assumptions');
  revalidatePath('/dashboard');
}

export async function inviteMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  assertPermission(actor, 'user.manage');
  const email = String(formData.get('email') ?? '').trim();
  if (!email.includes('@')) return { error: 'Enter the colleague’s email address.' };

  try {
    await flow.inviteMember({
      userId: actor.userId,
      organisationId: actor.organisationId,
      organisationName: actor.organisationName,
      email,
      roleId: String(formData.get('roleId') ?? ''),
      baseUrl: publicEnv().NEXT_PUBLIC_APP_URL,
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath('/settings/team');
  return { notice: `Invitation sent to ${email}. It expires in 14 days.` };
}

export async function setMemberStatusAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  assertPermission(actor, 'user.manage');
  await flow.setMemberStatus({
    userId: actor.userId,
    organisationId: actor.organisationId,
    targetUserId: String(formData.get('memberUserId') ?? ''),
    status: String(formData.get('status') ?? 'suspended') as 'suspended',
  });
  revalidatePath('/settings/team');
}
