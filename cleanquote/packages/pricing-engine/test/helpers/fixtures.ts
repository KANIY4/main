import type {
  CalendarAssumptions,
  LabourLine,
  LabourProfile,
  QuoteCalculationInput,
  ScenarioConfig,
} from '@cleanquote/types';
import { CALCULATION_SCHEMA_VERSION } from '@cleanquote/types';

/**
 * A deliberately boring calendar: 52 whole weeks and no public holidays, so hand-checked
 * expectations in tests stay exact. Production defaults use 52.1775 weeks.
 */
export const SIMPLE_CALENDAR: CalendarAssumptions = {
  weeksPerYear: 52,
  monthsPerYear: 12,
  publicHolidaysPerYear: 0,
  publicHolidayServiceDayFraction: 1,
};

export const CLEANER: LabourProfile = {
  code: 'cleaner',
  label: 'Cleaner',
  baseHourlyRate: '30.00',
  engagement: 'employee',
};

export const SUPERVISOR: LabourProfile = {
  code: 'supervisor',
  label: 'Supervisor',
  baseHourlyRate: '45.00',
  engagement: 'employee',
};

/** 1 cleaner x 2 hours x 5 nights a week = 520 productive hours a year. */
export const NIGHTLY_CLEAN: LabourLine = {
  id: 'nightly',
  kind: 'staffing',
  label: 'Nightly office clean',
  category: 'routine',
  labourProfileCode: 'cleaner',
  schedule: { pattern: 'weekly', daysPerWeek: 5 },
  cleanersPerShift: 1,
  hoursPerShift: 2,
};

export const NEUTRAL_SCENARIO: ScenarioConfig = {
  key: 'balanced',
  label: 'Recommended',
  pricingBasis: { type: 'margin', targetMarginPct: '25' },
  contingencyPct: '0',
  riskContingencyMultiplier: '1',
  productivityMultiplier: 1,
  supervisionMultiplier: 1,
};

/**
 * The smallest input that still exercises the whole pipeline. Every test starts here and
 * overrides only the field it is about, so a failure points at one behaviour.
 */
export function baseInput(overrides: Partial<QuoteCalculationInput> = {}): QuoteCalculationInput {
  return {
    calculationSchemaVersion: CALCULATION_SCHEMA_VERSION,
    currency: 'AUD',
    rounding: { increment: '0.01', mode: 'half_up' },
    calendar: SIMPLE_CALENDAR,
    labourProfiles: [CLEANER, SUPERVISOR],
    onCostRules: [],
    absenceAllowancePct: '0',
    labourLines: [NIGHTLY_CLEAN],
    costLines: [],
    overheadRules: [],
    risks: [],
    scenarios: [NEUTRAL_SCENARIO],
    guardrails: {},
    tax: { code: 'GST', label: 'GST', ratePct: '10', displayInclusive: false },
    contract: { termMonths: 12, quoteValidityDays: 30 },
    ...overrides,
  };
}

export function scenario(overrides: Partial<ScenarioConfig> = {}): ScenarioConfig {
  return { ...NEUTRAL_SCENARIO, ...overrides };
}

/** Convenience: the single scenario result from a one-scenario calculation. */
export function onlyScenario<T extends { scenarios: readonly unknown[] }>(result: T) {
  const [first] = result.scenarios;
  if (!first) throw new Error('Expected at least one scenario in the result');
  return first as T['scenarios'][number];
}
