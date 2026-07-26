import {
  assembleCalculationInput,
  auditStore,
  proposalStore,
  quoteStore,
  tenancyStore,
  withUser,
  type Queryable,
} from '@cleanquote/database';
import { calculateQuote, starterFactorFor } from '@cleanquote/pricing-engine';
import type { QuoteCalculationResult, ScenarioKey, ScenarioResult } from '@cleanquote/types';
import { quoteCalculationInputSchema, safeParse } from '@cleanquote/validation';

/**
 * Pricing integration.
 *
 * The engine is called in exactly one place — here. No React component, route
 * handler or SQL view reproduces any part of the calculation. Everything else
 * reads the stored snapshot.
 */

export interface PricedQuote {
  readonly result: QuoteCalculationResult;
  readonly snapshotId: string;
  readonly versionId: string;
  readonly notes: readonly ScenarioNote[];
}

/**
 * Internal commentary shown beside the scenario comparison.
 *
 * Never rendered in a client-facing proposal — these read the cost stack and the
 * negotiation floor, both of which are internal by definition.
 */
export interface ScenarioNote {
  readonly scenarioKey: ScenarioKey;
  readonly changedFromBalanced: string;
  readonly largestPricingRisk: string;
  readonly lowestPermittedPrice: string;
  readonly approvalRequired: boolean;
}

/**
 * Recalculates and stores an immutable snapshot.
 *
 * The input is validated before it reaches the engine, so a malformed rate card
 * fails loudly at the boundary rather than producing a plausible-looking price.
 */
export async function recalculateQuote(
  userId: string,
  organisationId: string,
  quoteId: string,
): Promise<PricedQuote> {
  return withUser(userId, async (db) => {
    const assembled = await assembleCalculationInput(db, quoteId, (dimension, level) =>
      starterFactorFor(dimension, level),
    );

    const parsed = safeParse(quoteCalculationInputSchema, assembled.input);
    if (!parsed.ok) {
      throw new Error(
        `The quote cannot be priced because its inputs are invalid: ${parsed.issues
          .map((issue) => `${issue.path} — ${issue.message}`)
          .join('; ')}`,
      );
    }

    const result = calculateQuote(assembled.input);

    const snapshotId = await quoteStore.saveSnapshot(db, {
      organisationId,
      versionId: assembled.versionId,
      schemaVersion: result.calculationSchemaVersion,
      engineInput: assembled.input,
      engineOutput: result,
      inputHash: result.inputHash,
      recommendedScenario: result.recommendedScenarioKey,
      userId,
    });

    const notes = await buildScenarioNotes(db, organisationId, result);

    return { result, snapshotId, versionId: assembled.versionId, notes };
  });
}

/** Reads the stored calculation without recalculating. */
export async function readLatestCalculation(
  userId: string,
  quoteId: string,
): Promise<{ result: QuoteCalculationResult; inputHash: string; calculatedAt: Date } | undefined> {
  return withUser(userId, async (db) => {
    const version = await quoteStore.getCurrentVersion(db, quoteId);
    if (!version) return undefined;
    const snapshot = await quoteStore.latestSnapshot(db, version.id);
    if (!snapshot) return undefined;
    return {
      result: snapshot.engine_output as QuoteCalculationResult,
      inputHash: snapshot.input_hash,
      calculatedAt: snapshot.created_at,
    };
  });
}

async function buildScenarioNotes(
  db: Queryable,
  organisationId: string,
  result: QuoteCalculationResult,
): Promise<ScenarioNote[]> {
  const settings = await tenancyStore.getSettings(db, organisationId);
  const balanced = result.scenarios.find((s) => s.key === 'balanced');

  return result.scenarios.map((scenario) => ({
    scenarioKey: scenario.key,
    changedFromBalanced: describeDifference(scenario, balanced),
    largestPricingRisk: describeLargestRisk(scenario),
    lowestPermittedPrice: scenario.negotiation.lowestAuthorisedAnnualPrice,
    approvalRequired: approvalTriggersFor(scenario, settings).length > 0,
  }));
}

function describeDifference(
  scenario: ScenarioResult,
  balanced: ScenarioResult | undefined,
): string {
  if (!balanced || scenario.key === 'balanced') {
    return 'Expected production rates, standard contingency and the organisation target margin.';
  }

  const hoursDelta =
    Number(scenario.labour.recurringProductiveHoursPerYear) -
    Number(balanced.labour.recurringProductiveHoursPerYear);
  const marginDelta =
    Number(scenario.margin.grossMarginPct) - Number(balanced.margin.grossMarginPct);
  const contingencyDelta = Number(scenario.contingency.total) - Number(balanced.contingency.total);

  const parts: string[] = [];
  if (Math.abs(hoursDelta) > 0.5) {
    parts.push(
      `${hoursDelta > 0 ? 'Adds' : 'Removes'} ${Math.abs(hoursDelta).toFixed(0)} labour hours a year`,
    );
  }
  if (Math.abs(marginDelta) > 0.05) {
    parts.push(
      `${marginDelta > 0 ? 'raises' : 'lowers'} gross margin by ${Math.abs(marginDelta).toFixed(1)} points`,
    );
  }
  if (Math.abs(contingencyDelta) > 1) {
    parts.push(
      `${contingencyDelta > 0 ? 'carries' : 'releases'} ${Math.abs(contingencyDelta).toFixed(0)} of contingency`,
    );
  }
  return parts.length > 0
    ? `${parts.join(', ')} compared with the recommended strategy.`
    : 'Materially the same as the recommended strategy.';
}

function describeLargestRisk(scenario: ScenarioResult): string {
  const topRisk = scenario.contingency.topRisks[0];
  if (topRisk) {
    return `${topRisk.code.replace(/_/g, ' ')} carries the largest exposure at ${topRisk.expectedValue}.`;
  }
  if (scenario.confidenceBasis === 'unknown' || scenario.confidence < 0.6) {
    return 'Input confidence is low: most of the capture has not been confirmed, so the hours themselves are the risk.';
  }
  return 'No individual risk dominates; the estimate rests on the production rates in the rate card.';
}

// ---------------------------------------------------------------------------
// Approval triggers
// ---------------------------------------------------------------------------

export interface ApprovalTrigger {
  readonly code: string;
  readonly description: string;
}

/**
 * Why this scenario would need approval before it can be sent.
 *
 * Evaluated from the stored settings and the calculated scenario, never from
 * anything the client sends. Returning an empty list means "Not Required".
 */
export function approvalTriggersFor(
  scenario: ScenarioResult,
  settings:
    | {
        approval_required_below_margin_pct: string | null;
        approval_required_above_annual_value: string | null;
      }
    | undefined,
): ApprovalTrigger[] {
  const triggers: ApprovalTrigger[] = [];

  const marginFloor = settings?.approval_required_below_margin_pct;
  if (marginFloor && Number(scenario.margin.overallGrossMarginPct) < Number(marginFloor)) {
    triggers.push({
      code: 'below_minimum_margin',
      description: `Gross margin of ${Number(scenario.margin.overallGrossMarginPct).toFixed(1)}% is below the organisation minimum of ${marginFloor}%.`,
    });
  }

  const valueCeiling = settings?.approval_required_above_annual_value;
  if (valueCeiling && Number(scenario.price.annualExTax) > Number(valueCeiling)) {
    triggers.push({
      code: 'above_value_threshold',
      description: `Annual value exceeds the ${valueCeiling} approval threshold.`,
    });
  }

  const overridden = scenario.guardrails.filter((g) => g.outcome === 'overridden');
  if (overridden.length > 0) {
    triggers.push({
      code: 'guardrail_override',
      description: `${overridden.length} commercial floor(s) were overridden and need a reviewer's sign-off.`,
    });
  }

  const enforced = scenario.guardrails.filter((g) => g.outcome === 'enforced');
  if (enforced.length > 0) {
    triggers.push({
      code: 'guardrail_enforced',
      description: `The price had to be lifted to meet ${enforced.length} commercial floor(s); a reviewer should confirm the position.`,
    });
  }

  return triggers;
}

/** Records the client-facing scenario the estimator selected. */
export async function selectScenario(
  userId: string,
  organisationId: string,
  quoteId: string,
  scenarioKey: ScenarioKey,
): Promise<void> {
  await withUser(userId, async (db) => {
    const before = await quoteStore.getQuote(db, quoteId);
    await quoteStore.setSelectedScenario(db, quoteId, scenarioKey);
    await auditStore.writeAudit(db, {
      organisationId,
      actorUserId: userId,
      action: 'quote.scenario_selected',
      entityType: 'quote',
      entityId: quoteId,
      before: { selectedScenario: before?.selected_scenario ?? null },
      after: { selectedScenario: scenarioKey },
    });
  });
}

/** The approval state a quote version is currently in. */
export async function approvalStateFor(
  userId: string,
  quoteId: string,
): Promise<{
  state:
    | 'not_required'
    | 'draft'
    | 'submitted'
    | 'changes_requested'
    | 'approved'
    | 'rejected'
    | 'cancelled';
  approval: Awaited<ReturnType<typeof proposalStore.latestApproval>>;
}> {
  return withUser(userId, async (db) => {
    const version = await quoteStore.getCurrentVersion(db, quoteId);
    if (!version) return { state: 'not_required' as const, approval: undefined };

    const approval = await proposalStore.latestApproval(db, version.id);
    if (!approval) return { state: 'not_required' as const, approval: undefined };

    if (approval.invalidated_at) return { state: 'changes_requested' as const, approval };
    if (approval.status === 'pending') return { state: 'submitted' as const, approval };
    if (approval.status === 'approved') return { state: 'approved' as const, approval };
    if (approval.status === 'rejected') return { state: 'rejected' as const, approval };
    return { state: 'changes_requested' as const, approval };
  });
}
