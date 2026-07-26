import type { Guardrails, OnCostRule, OverheadRule, ScenarioConfig } from '@cleanquote/types';

/**
 * "Recommended starter settings".
 *
 * These exist so a new organisation can reach its first quote without completing a full
 * rate-card configuration. Every value here is a visible, editable assumption — the
 * onboarding UI must present them as such and never silently apply them. They are
 * deliberately generic: labour on-costs differ by jurisdiction and employment model, and
 * nothing in this file is a substitute for an organisation entering its real numbers.
 */

export const STARTER_SCENARIOS: readonly ScenarioConfig[] = [
  {
    key: 'aggressive',
    label: 'Win Strategy',
    pricingBasis: { type: 'margin', targetMarginPct: '28' },
    contingencyPct: '1.5',
    riskContingencyMultiplier: '0.6',
    productivityMultiplier: 0.95,
    supervisionMultiplier: 0.9,
    rationale:
      'Lean but achievable production rates, reduced discretionary contingency and a thinner margin. Statutory labour costs and the organisation floors are untouched.',
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
      'Expected production rates, standard contingency and the organisation target margin. This is the default recommendation unless the evidence points elsewhere.',
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
      'Conservative production rates, deeper supervision and relief cover, and a larger buffer for uncertainty. Suited to sites with access, compliance or labour-supply risk.',
  },
];

/**
 * Illustrative on-cost cascade. `order` matters: rules with `appliesTo: 'running_total'`
 * are levied on the amounts added before them.
 */
export const STARTER_ON_COSTS: readonly OnCostRule[] = [
  {
    code: 'retirement_contribution',
    label: 'Retirement / superannuation contribution',
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
    value: '3.5',
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
    label: 'Subcontractor administration and compliance checks',
    method: 'percent',
    value: '4',
    appliesTo: 'base',
    order: 10,
    appliesToEngagements: ['subcontractor'],
  },
  {
    code: 'uniform_ppe',
    label: 'Uniform and PPE allowance',
    method: 'per_paid_hour',
    value: '0.35',
    appliesTo: 'base',
    order: 40,
  },
];

export const STARTER_OVERHEADS: readonly OverheadRule[] = [
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

export const STARTER_GUARDRAILS: Guardrails = {
  minGrossMarginPct: '22',
  minContributionMarginPct: '30',
  minHourlyRecovery: '38',
  minChargePerVisit: '35',
};

/**
 * Absence allowance converts productive hours into paid hours: annual leave, sick leave,
 * training and relief coverage are paid for but do not clean.
 */
export const STARTER_ABSENCE_ALLOWANCE_PCT = '12';
