import type {
  CalendarAssumptions,
  Guardrails,
  LabourProfile,
  OnCostRule,
  OverheadRule,
  ScenarioConfig,
  TaxConfig,
} from '@cleanquote/types';

/**
 * Shared rate-card material for the demonstration cases.
 *
 * These are illustrative figures for a mid-sized contractor, not advice. Real
 * on-cost rates, award loadings and overhead recovery vary by jurisdiction and by
 * employment model, which is exactly why they are configuration rather than code.
 */

export const AU_CALENDAR: CalendarAssumptions = {
  weeksPerYear: 52.1775,
  monthsPerYear: 12,
  publicHolidaysPerYear: 11,
  publicHolidayServiceDayFraction: 1,
};

export const PROFILES: readonly LabourProfile[] = [
  { code: 'cleaner', label: 'Cleaner', baseHourlyRate: '31.80', engagement: 'employee' },
  {
    code: 'cleaner_night',
    label: 'Cleaner (night)',
    baseHourlyRate: '34.95',
    engagement: 'employee',
  },
  { code: 'supervisor', label: 'Site supervisor', baseHourlyRate: '42.60', engagement: 'employee' },
  {
    code: 'specialist',
    label: 'Specialist operator',
    baseHourlyRate: '48.20',
    engagement: 'employee',
  },
  {
    code: 'high_access',
    label: 'High-access subcontractor',
    baseHourlyRate: '78.00',
    engagement: 'subcontractor',
  },
];

export const ON_COSTS: readonly OnCostRule[] = [
  {
    code: 'retirement_contribution',
    label: 'Retirement contribution',
    method: 'percent',
    value: '11.5',
    appliesTo: 'base',
    order: 10,
    appliesToEngagements: ['employee'],
  },
  {
    code: 'workers_compensation',
    label: 'Workers compensation insurance',
    method: 'percent',
    value: '3.4',
    appliesTo: 'base',
    order: 20,
    appliesToEngagements: ['employee'],
  },
  {
    code: 'payroll_tax',
    label: 'Payroll tax',
    method: 'percent',
    value: '4.85',
    appliesTo: 'running_total',
    order: 30,
    appliesToEngagements: ['employee'],
  },
  {
    code: 'subcontractor_admin',
    label: 'Subcontractor compliance and administration',
    method: 'percent',
    value: '4',
    appliesTo: 'base',
    order: 10,
    appliesToEngagements: ['subcontractor'],
  },
  {
    code: 'uniform_ppe',
    label: 'Uniform and PPE',
    method: 'per_paid_hour',
    value: '0.35',
    appliesTo: 'base',
    order: 40,
    appliesToEngagements: ['employee'],
  },
];

export const OVERHEADS: readonly OverheadRule[] = [
  {
    code: 'operations_management',
    label: 'Operations management and quality auditing',
    method: 'per_labour_hour',
    value: '2.20',
  },
  {
    code: 'head_office',
    label: 'Head office and administration recovery',
    method: 'percent_of_revenue',
    value: '8',
  },
];

export const GUARDRAILS: Guardrails = {
  minGrossMarginPct: '22',
  minContributionMarginPct: '30',
  minHourlyRecovery: '48',
  minChargePerVisit: '45',
};

export const GST: TaxConfig = {
  code: 'GST',
  label: 'GST',
  ratePct: '10',
  displayInclusive: false,
};

export const SCENARIOS: readonly ScenarioConfig[] = [
  {
    key: 'aggressive',
    label: 'Win Strategy',
    pricingBasis: { type: 'margin', targetMarginPct: '28' },
    contingencyPct: '1.5',
    riskContingencyMultiplier: '0.6',
    productivityMultiplier: 0.95,
    supervisionMultiplier: 0.9,
    rationale:
      'Lean but achievable production rates and reduced discretionary contingency. Statutory labour costs and the organisation floors are untouched.',
  },
  {
    key: 'balanced',
    label: 'Recommended',
    pricingBasis: { type: 'margin', targetMarginPct: '35' },
    contingencyPct: '3',
    riskContingencyMultiplier: '1',
    productivityMultiplier: 1,
    supervisionMultiplier: 1,
    rationale:
      'Expected production rates, standard contingency and the organisation target margin.',
  },
  {
    key: 'premium',
    label: 'Margin Protection',
    pricingBasis: { type: 'margin', targetMarginPct: '42' },
    contingencyPct: '6',
    riskContingencyMultiplier: '1.4',
    productivityMultiplier: 1.08,
    supervisionMultiplier: 1.25,
    rationale:
      'Conservative production rates, deeper supervision and relief cover, and a larger buffer for uncertainty.',
  },
];

export const ABSENCE_ALLOWANCE_PCT = '12';
