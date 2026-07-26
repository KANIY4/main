import { z } from 'zod';

import {
  currencyCode,
  decimalString,
  isoTimestamp,
  mediumText,
  nonNegativeDecimalString,
  nonNegativeNumber,
  percentString,
  positiveNumber,
  shortText,
  unitInterval,
} from './primitives';

/**
 * Runtime schema for the pricing engine's input.
 *
 * The engine is pure and trusts its input; this schema is what makes that safe. Any
 * calculation request crossing an API, a queue or a client boundary is parsed here
 * first, so a malformed rate card fails loudly at the edge rather than producing a
 * plausible-looking price.
 */

export const serviceScheduleSchema = z
  .object({
    pattern: z.enum([
      'one_off',
      'weekly',
      'fortnightly',
      'monthly',
      'quarterly',
      'biannual',
      'annual',
      'on_demand',
      'custom_per_year',
    ]),
    daysPerWeek: z.number().int().min(1).max(7).optional(),
    visitsPerServiceDay: positiveNumber.optional(),
    timesPerMonth: positiveNumber.optional(),
    occurrencesPerYear: nonNegativeNumber.optional(),
    budgetedCallOutsPerYear: nonNegativeNumber.optional(),
    serviceOnPublicHolidays: z.boolean().optional(),
  })
  .refine((s) => s.pattern !== 'custom_per_year' || s.occurrencesPerYear !== undefined, {
    message: 'A custom_per_year schedule requires occurrencesPerYear',
    path: ['occurrencesPerYear'],
  });

export const calendarAssumptionsSchema = z.object({
  weeksPerYear: z.number().min(1).max(53),
  monthsPerYear: z.number().min(1).max(12),
  publicHolidaysPerYear: z.number().min(0).max(60),
  publicHolidayServiceDayFraction: unitInterval,
});

export const labourProfileSchema = z.object({
  code: shortText,
  label: shortText,
  baseHourlyRate: nonNegativeDecimalString('baseHourlyRate'),
  engagement: z.enum(['employee', 'subcontractor', 'agency']),
});

export const onCostRuleSchema = z.object({
  code: shortText,
  label: shortText,
  method: z.enum(['percent', 'per_paid_hour', 'fixed_per_year']),
  value: decimalString('on-cost value'),
  appliesTo: z.enum(['base', 'running_total']),
  order: z.number().int(),
  appliesToEngagements: z.array(z.enum(['employee', 'subcontractor', 'agency'])).optional(),
});

const labourCategory = z.enum([
  'routine',
  'periodical',
  'supervision',
  'day_porter',
  'management',
  'mobilisation',
  'initial_clean',
  'reactive',
]);

const labourLineBase = {
  id: shortText,
  label: shortText,
  category: labourCategory,
  labourProfileCode: shortText,
  schedule: serviceScheduleSchema,
  rateLoadingPct: percentString('rateLoadingPct').optional(),
  sourceSpaceId: z.string().optional(),
  notes: mediumText.optional(),
};

/** Factors multiply production hours; a factor of 0 would erase the labour entirely. */
const adjustmentFactor = z.number().min(0.1).max(10);

export const labourLineSchema = z.discriminatedUnion('kind', [
  z.object({
    ...labourLineBase,
    kind: z.literal('productivity'),
    quantity: nonNegativeNumber,
    quantityUnit: z.enum(['m2', 'each', 'linear_m', 'fixture']),
    productivity: z.discriminatedUnion('method', [
      z.object({ method: z.literal('units_per_hour'), value: positiveNumber }),
      z.object({ method: z.literal('minutes_per_unit'), value: positiveNumber }),
    ]),
    factors: z
      .object({
        difficulty: adjustmentFactor.optional(),
        soil: adjustmentFactor.optional(),
        traffic: adjustmentFactor.optional(),
        furnitureDensity: adjustmentFactor.optional(),
        access: adjustmentFactor.optional(),
        compliance: adjustmentFactor.optional(),
      })
      .optional(),
    benchmarkId: z.string().optional(),
  }),
  z.object({
    ...labourLineBase,
    kind: z.literal('staffing'),
    cleanersPerShift: nonNegativeNumber,
    hoursPerShift: nonNegativeNumber,
  }),
  z.object({
    ...labourLineBase,
    kind: z.literal('percent_of_labour'),
    percentOfHours: percentString('percentOfHours'),
    basisCategories: z.array(labourCategory).optional(),
  }),
]);

export const costLineSchema = z
  .object({
    id: shortText,
    label: shortText,
    category: z.enum([
      'chemicals',
      'consumables',
      'client_consumables',
      'equipment',
      'equipment_rental',
      'depreciation',
      'repairs',
      'vehicle',
      'fuel',
      'parking',
      'tolls',
      'waste',
      'laundry',
      'ppe',
      'testing',
      'certification',
      'induction',
      'security_checks',
      'high_access_equipment',
      'subcontractor',
      'software',
      'training',
      'other',
    ]),
    method: z.enum(['per_year', 'per_month', 'per_occurrence', 'per_labour_hour', 'one_off']),
    amount: nonNegativeDecimalString('cost amount'),
    schedule: serviceScheduleSchema.optional(),
    oneOff: z.boolean().optional(),
  })
  .refine((line) => line.method !== 'per_occurrence' || line.schedule !== undefined, {
    message: 'A per_occurrence cost line requires a schedule',
    path: ['schedule'],
  });

export const overheadRuleSchema = z
  .object({
    code: shortText,
    label: shortText,
    method: z.enum([
      'fixed_per_year',
      'per_month',
      'per_occurrence',
      'per_labour_hour',
      'percent_of_revenue',
      'percent_of_direct_cost',
    ]),
    value: nonNegativeDecimalString('overhead value'),
    schedule: serviceScheduleSchema.optional(),
  })
  .refine((rule) => rule.method !== 'percent_of_revenue' || Number(rule.value) < 100, {
    message: 'Revenue-based overhead of 100% or more leaves no revenue to price against',
    path: ['value'],
  });

export const riskItemSchema = z.object({
  id: shortText,
  code: shortText,
  label: mediumText,
  probability: unitInterval,
  impactAmount: nonNegativeDecimalString('impactAmount'),
  mitigation: mediumText.optional(),
  ownerUserId: z.string().optional(),
  status: z.enum(['open', 'mitigated', 'accepted', 'transferred']),
});

export const pricingBasisSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('margin'), targetMarginPct: percentString('targetMarginPct') }),
  z.object({ type: z.literal('markup'), markupPct: percentString('markupPct') }),
]);

export const scenarioConfigSchema = z.object({
  key: z.enum(['aggressive', 'balanced', 'premium']),
  label: shortText,
  pricingBasis: pricingBasisSchema,
  contingencyPct: percentString('contingencyPct'),
  riskContingencyMultiplier: nonNegativeDecimalString('riskContingencyMultiplier'),
  productivityMultiplier: z.number().min(0.5).max(2),
  supervisionMultiplier: z.number().min(0.5).max(3),
  discountPct: percentString('discountPct')
    .refine((v) => Number(v) < 100, 'A discount of 100% or more is not a price')
    .optional(),
  rationale: mediumText.optional(),
});

export const guardrailsSchema = z.object({
  minGrossMarginPct: percentString('minGrossMarginPct').optional(),
  minContributionMarginPct: percentString('minContributionMarginPct').optional(),
  minHourlyRecovery: nonNegativeDecimalString('minHourlyRecovery').optional(),
  minChargePerVisit: nonNegativeDecimalString('minChargePerVisit').optional(),
  minAnnualContractValue: nonNegativeDecimalString('minAnnualContractValue').optional(),
  minMobilisationCharge: nonNegativeDecimalString('minMobilisationCharge').optional(),
});

/**
 * An override is an auditable act, so the reason is mandatory and must be substantive —
 * a single character would defeat the purpose of recording one.
 */
export const guardrailOverrideSchema = z.object({
  guardrail: z.enum([
    'min_gross_margin',
    'min_contribution_margin',
    'min_hourly_recovery',
    'min_charge_per_visit',
    'min_annual_contract_value',
    'min_mobilisation_charge',
  ]),
  reason: z.string().trim().min(20, 'Explain why this floor is being overridden').max(1000),
  userId: shortText,
  at: isoTimestamp,
  approvedByUserId: z.string().optional(),
});

export const taxConfigSchema = z.object({
  code: shortText,
  label: shortText,
  ratePct: percentString('ratePct'),
  displayInclusive: z.boolean(),
});

export const contractTermsSchema = z.object({
  termMonths: z.number().int().min(1).max(240),
  quoteValidityDays: z.number().int().min(1).max(365),
});

export const optionalServiceSchema = z.object({
  id: shortText,
  label: shortText,
  annualPrice: nonNegativeDecimalString('annualPrice'),
  annualCost: nonNegativeDecimalString('annualCost'),
  description: mediumText.optional(),
});

export const dataCompletenessSchema = z.object({
  measurementVerifiedRatio: unitInterval,
  aiFactsConfirmedRatio: unitInterval,
  missingInformationCount: z.number().int().min(0),
  walkthroughCompleted: z.boolean(),
});

export const strategicContextSchema = z.object({
  priceSensitivity: z.enum(['low', 'medium', 'high']).optional(),
  incumbentDissatisfaction: z.enum(['unknown', 'none', 'some', 'high']).optional(),
  relationshipStrength: z.enum(['none', 'weak', 'established', 'strong']).optional(),
  routeDensity: z.enum(['isolated', 'adjacent', 'clustered']).optional(),
  labourAvailability: z.enum(['scarce', 'normal', 'plentiful']).optional(),
  capacityAvailable: z.enum(['stretched', 'normal', 'spare']).optional(),
  contractAttractiveness: z.enum(['low', 'medium', 'high']).optional(),
  salesStage: z.enum(['early', 'shortlisted', 'final_negotiation']).optional(),
  historicalWinRatePct: percentString('historicalWinRatePct').optional(),
  crossSellPotential: z.enum(['none', 'some', 'high']).optional(),
});

export const quoteCalculationInputSchema = z
  .object({
    calculationSchemaVersion: z.string(),
    currency: currencyCode,
    rounding: z.object({
      increment: nonNegativeDecimalString('rounding increment').refine(
        (v) => Number(v) > 0,
        'Rounding increment must be greater than zero',
      ),
      mode: z.enum(['half_up', 'half_even', 'up', 'down']),
    }),
    calendar: calendarAssumptionsSchema,
    labourProfiles: z.array(labourProfileSchema).min(1),
    onCostRules: z.array(onCostRuleSchema),
    absenceAllowancePct: percentString('absenceAllowancePct'),
    labourLines: z.array(labourLineSchema),
    costLines: z.array(costLineSchema),
    overheadRules: z.array(overheadRuleSchema),
    risks: z.array(riskItemSchema),
    scenarios: z.array(scenarioConfigSchema).min(1),
    guardrails: guardrailsSchema,
    guardrailOverrides: z.array(guardrailOverrideSchema).optional(),
    tax: taxConfigSchema,
    contract: contractTermsSchema,
    optionalServices: z.array(optionalServiceSchema).optional(),
    dataCompleteness: dataCompletenessSchema.optional(),
    strategicContext: strategicContextSchema.optional(),
  })
  .superRefine((input, ctx) => {
    const profileCodes = new Set(input.labourProfiles.map((p) => p.code));
    input.labourLines.forEach((line, index) => {
      if (!profileCodes.has(line.labourProfileCode)) {
        ctx.addIssue({
          code: 'custom',
          path: ['labourLines', index, 'labourProfileCode'],
          message: `Labour line references rate-card profile "${line.labourProfileCode}", which is not on this rate card`,
        });
      }
    });

    const lineIds = input.labourLines.map((l) => l.id);
    const duplicate = lineIds.find((id, i) => lineIds.indexOf(id) !== i);
    if (duplicate) {
      ctx.addIssue({
        code: 'custom',
        path: ['labourLines'],
        message: `Duplicate labour line id "${duplicate}"; ids must be unique within a quote`,
      });
    }

    const scenarioKeys = input.scenarios.map((s) => s.key);
    const duplicateScenario = scenarioKeys.find((k, i) => scenarioKeys.indexOf(k) !== i);
    if (duplicateScenario) {
      ctx.addIssue({
        code: 'custom',
        path: ['scenarios'],
        message: `Scenario "${duplicateScenario}" is defined more than once`,
      });
    }
  });

export type QuoteCalculationInputDto = z.infer<typeof quoteCalculationInputSchema>;
