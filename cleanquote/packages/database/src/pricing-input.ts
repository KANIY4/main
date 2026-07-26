import type {
  CostLine,
  Guardrails,
  LabourLine,
  LabourProfile,
  OnCostRule,
  OverheadRule,
  QuoteCalculationInput,
  RiskItem,
  ScenarioConfig,
  ServiceSchedule,
} from '@cleanquote/types';
import { CALCULATION_SCHEMA_VERSION } from '@cleanquote/types';

import type { Queryable } from './client';
import {
  getMarginRules,
  getRateCardContents,
  listScenarioConfigs,
  type LabourProfileRow,
  type OnCostRuleRow,
  type OverheadRuleRow,
} from './rate-card-store';
import {
  getCurrentVersion,
  getQuote,
  listCostLines,
  listRisks,
  listSpaces,
  listTasks,
  type QuoteTaskRow,
  type SpaceRow,
} from './quote-store';
import { getSettings } from './tenancy-store';

/**
 * Assembles the pricing engine's input from stored rows.
 *
 * This module contains **no formulas**. It is a mapping: rows in, the engine's
 * documented input type out. Every calculation — annualisation, on-cost cascade,
 * price solve, guardrails — stays in `@cleanquote/pricing-engine`, which is the
 * only place a price is produced.
 *
 * The adjustment factors that turn a descriptive level ("high traffic") into a
 * multiplier come from the engine's own starter defaults, so a component never
 * invents one.
 */

/** Provided by the caller so the mapping stays free of engine internals. */
export interface FactorResolver {
  (dimension: 'traffic' | 'soil' | 'furnitureDensity' | 'access', level: string | null): number;
}

function scheduleFor(task: QuoteTaskRow): ServiceSchedule {
  const pattern = task.frequency_pattern as ServiceSchedule['pattern'];
  switch (pattern) {
    case 'weekly':
      return { pattern, daysPerWeek: task.days_per_week ?? 5 };
    case 'monthly':
      return { pattern, timesPerMonth: task.times_per_month ? Number(task.times_per_month) : 1 };
    case 'custom_per_year':
      return {
        pattern,
        occurrencesPerYear: task.occurrences_per_year ? Number(task.occurrences_per_year) : 0,
      };
    default:
      return { pattern };
  }
}

function unitFor(unit: string): 'm2' | 'each' | 'linear_m' | 'fixture' {
  if (unit === 'm2' || unit === 'linear_m' || unit === 'fixture') return unit;
  return 'each';
}

function labourLineFromTask(
  task: QuoteTaskRow,
  space: SpaceRow | undefined,
  resolveFactor: FactorResolver,
): LabourLine {
  const productivity = task.units_per_hour
    ? ({ method: 'units_per_hour', value: Number(task.units_per_hour) } as const)
    : ({ method: 'minutes_per_unit', value: Number(task.minutes_per_unit ?? 0) } as const);

  return {
    id: task.id,
    kind: 'productivity',
    label: space ? `${space.name} — ${task.label}` : task.label,
    category: task.frequency_pattern === 'one_off' ? 'initial_clean' : 'routine',
    labourProfileCode: task.labour_profile_code,
    schedule: scheduleFor(task),
    quantity: Number(task.quantity),
    quantityUnit: unitFor(task.unit),
    productivity,
    factors: space
      ? {
          traffic: resolveFactor('traffic', space.traffic_level),
          soil: resolveFactor('soil', space.soil_level),
          furnitureDensity: resolveFactor('furnitureDensity', space.furniture_density),
          access: resolveFactor('access', space.access_difficulty),
        }
      : undefined,
    sourceSpaceId: space?.id,
  };
}

function toLabourProfile(row: LabourProfileRow): LabourProfile {
  return {
    code: row.code,
    label: row.label,
    baseHourlyRate: row.base_hourly_rate,
    engagement: row.engagement as LabourProfile['engagement'],
  };
}

function toOnCostRule(row: OnCostRuleRow): OnCostRule {
  return {
    code: row.code,
    label: row.label,
    method: row.method as OnCostRule['method'],
    value: row.value,
    appliesTo: row.applies_to as OnCostRule['appliesTo'],
    order: row.sort_order,
    appliesToEngagements: row.applies_to_engagements as OnCostRule['appliesToEngagements'],
  };
}

function toOverheadRule(row: OverheadRuleRow): OverheadRule {
  return {
    code: row.code,
    label: row.label,
    method: row.method as OverheadRule['method'],
    value: row.value,
  };
}

function guardrailsFrom(row: Awaited<ReturnType<typeof getMarginRules>>): Guardrails {
  if (!row) return {};
  const guardrails: Record<string, string> = {};
  if (row.min_gross_margin_pct) guardrails['minGrossMarginPct'] = row.min_gross_margin_pct;
  if (row.min_contribution_margin_pct)
    guardrails['minContributionMarginPct'] = row.min_contribution_margin_pct;
  if (row.min_hourly_recovery) guardrails['minHourlyRecovery'] = row.min_hourly_recovery;
  if (row.min_charge_per_visit) guardrails['minChargePerVisit'] = row.min_charge_per_visit;
  if (row.min_annual_contract_value)
    guardrails['minAnnualContractValue'] = row.min_annual_contract_value;
  if (row.min_mobilisation_charge)
    guardrails['minMobilisationCharge'] = row.min_mobilisation_charge;
  return guardrails as Guardrails;
}

export class QuoteNotPriceableError extends Error {
  readonly reasons: readonly string[];
  constructor(reasons: readonly string[]) {
    super(`This quote cannot be priced yet: ${reasons.join('; ')}`);
    this.name = 'QuoteNotPriceableError';
    this.reasons = reasons;
  }
}

export interface AssembledInput {
  readonly input: QuoteCalculationInput;
  readonly versionId: string;
  readonly rateCardId: string;
}

/**
 * Reads everything a quote needs and returns the engine's input.
 *
 * Refuses rather than guesses: a quote with no rate card, no scenarios or no
 * tasks would otherwise produce a confident zero.
 */
export async function assembleCalculationInput(
  db: Queryable,
  quoteId: string,
  resolveFactor: FactorResolver,
): Promise<AssembledInput> {
  const quote = await getQuote(db, quoteId);
  if (!quote) throw new QuoteNotPriceableError(['the quote was not found']);

  const version = await getCurrentVersion(db, quoteId);
  if (!version) throw new QuoteNotPriceableError(['the quote has no version']);
  if (!version.rate_card_id) throw new QuoteNotPriceableError(['the quote has no rate card']);

  const [settings, rateCard, scenarioRows, marginRules, spaces, tasks, costLines, risks] =
    await Promise.all([
      getSettings(db, quote.organisation_id),
      getRateCardContents(db, version.rate_card_id),
      listScenarioConfigs(db, quote.organisation_id),
      getMarginRules(db, quote.organisation_id),
      listSpaces(db, quoteId),
      listTasks(db, quoteId),
      listCostLines(db, version.id),
      listRisks(db, quoteId),
    ]);

  const reasons: string[] = [];
  if (!settings) reasons.push('the organisation has no settings');
  if (rateCard.labourProfiles.length === 0) reasons.push('the rate card has no labour rates');
  if (scenarioRows.length === 0) reasons.push('no pricing strategies are configured');
  if (tasks.length === 0) reasons.push('no tasks have been added');
  if (reasons.length > 0) throw new QuoteNotPriceableError(reasons);
  if (!settings) throw new QuoteNotPriceableError(['the organisation has no settings']);

  const spaceById = new Map(spaces.map((space) => [space.id, space]));

  const labourLines: LabourLine[] = tasks.map((task) =>
    labourLineFromTask(
      task,
      task.space_id ? spaceById.get(task.space_id) : undefined,
      resolveFactor,
    ),
  );

  const scenarios: ScenarioConfig[] = scenarioRows.map((row) => ({
    key: row.scenario_key as ScenarioConfig['key'],
    label: row.label,
    pricingBasis:
      row.pricing_basis_type === 'markup'
        ? { type: 'markup', markupPct: row.pricing_basis_value }
        : { type: 'margin', targetMarginPct: row.pricing_basis_value },
    contingencyPct: row.contingency_pct,
    riskContingencyMultiplier: row.risk_contingency_multiplier,
    productivityMultiplier: Number(row.productivity_multiplier),
    supervisionMultiplier: Number(row.supervision_multiplier),
    ...(row.discount_pct ? { discountPct: row.discount_pct } : {}),
    ...(row.rationale ? { rationale: row.rationale } : {}),
  }));

  const engineCostLines: CostLine[] = costLines.map((line) => ({
    id: line.id,
    label: line.label,
    category: line.category as CostLine['category'],
    method: line.method as CostLine['method'],
    amount: line.amount,
    oneOff: line.one_off,
    // Stored as jsonb; the schema validates it on the way back out.
    ...(line.schedule ? { schedule: line.schedule as unknown as ServiceSchedule } : {}),
  }));

  const engineRisks: RiskItem[] = risks.map((risk) => ({
    id: risk.id,
    code: risk.code,
    label: risk.label,
    probability: Number(risk.probability),
    impactAmount: risk.impact_amount,
    status: risk.status as RiskItem['status'],
    ...(risk.mitigation ? { mitigation: risk.mitigation } : {}),
  }));

  // Confidence reflects how much of the capture a human has actually confirmed.
  const confirmable = spaces.length + tasks.length;
  const confirmed =
    spaces.filter((s) => s.field_status === 'confirmed').length +
    tasks.filter((t) => t.field_status === 'confirmed').length;

  const input: QuoteCalculationInput = {
    calculationSchemaVersion: CALCULATION_SCHEMA_VERSION,
    currency: quote.currency_code,
    rounding: {
      increment: settings.rounding_increment,
      mode: settings.rounding_mode as 'half_up' | 'half_even' | 'up' | 'down',
    },
    calendar: {
      weeksPerYear: Number(settings.weeks_per_year),
      monthsPerYear: Number(settings.months_per_year),
      publicHolidaysPerYear: Number(settings.public_holidays_per_year),
      publicHolidayServiceDayFraction: Number(settings.public_holiday_service_day_fraction),
    },
    labourProfiles: rateCard.labourProfiles.map(toLabourProfile),
    onCostRules: rateCard.onCostRules.map(toOnCostRule),
    absenceAllowancePct: settings.absence_allowance_pct,
    labourLines,
    costLines: engineCostLines,
    overheadRules: rateCard.overheadRules.map(toOverheadRule),
    risks: engineRisks,
    scenarios,
    guardrails: guardrailsFrom(marginRules),
    tax: {
      code: settings.tax_code,
      label: settings.tax_label,
      ratePct: settings.tax_rate_pct,
      displayInclusive: settings.tax_display_inclusive,
    },
    contract: {
      termMonths: quote.contract_term_months,
      quoteValidityDays: quote.quote_validity_days,
    },
    dataCompleteness: {
      // No AR measurement in this milestone, so nothing is instrument-verified.
      measurementVerifiedRatio: 0,
      aiFactsConfirmedRatio: confirmable === 0 ? 0 : confirmed / confirmable,
      missingInformationCount: tasks.filter((t) => t.field_status === 'pending_clarification')
        .length,
      walkthroughCompleted: spaces.length > 0,
    },
    strategicContext: quote.strategic_context as QuoteCalculationInput['strategicContext'],
  };

  return { input, versionId: version.id, rateCardId: version.rate_card_id };
}
