import { CALCULATION_SCHEMA_VERSION } from '@cleanquote/types';
import { describe, expect, it } from 'vitest';

import { safeParse } from '../src/parse.js';
import {
  costLineSchema,
  guardrailOverrideSchema,
  labourLineSchema,
  overheadRuleSchema,
  quoteCalculationInputSchema,
  serviceScheduleSchema,
} from '../src/pricing.js';

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    calculationSchemaVersion: CALCULATION_SCHEMA_VERSION,
    currency: 'AUD',
    rounding: { increment: '0.01', mode: 'half_up' },
    calendar: {
      weeksPerYear: 52.1775,
      monthsPerYear: 12,
      publicHolidaysPerYear: 0,
      publicHolidayServiceDayFraction: 1,
    },
    labourProfiles: [
      { code: 'cleaner', label: 'Cleaner', baseHourlyRate: '30.00', engagement: 'employee' },
    ],
    onCostRules: [],
    absenceAllowancePct: '12',
    labourLines: [
      {
        id: 'nightly',
        kind: 'staffing',
        label: 'Nightly clean',
        category: 'routine',
        labourProfileCode: 'cleaner',
        schedule: { pattern: 'weekly', daysPerWeek: 5 },
        cleanersPerShift: 1,
        hoursPerShift: 2,
      },
    ],
    costLines: [],
    overheadRules: [],
    risks: [],
    scenarios: [
      {
        key: 'balanced',
        label: 'Recommended',
        pricingBasis: { type: 'margin', targetMarginPct: '35' },
        contingencyPct: '3',
        riskContingencyMultiplier: '1',
        productivityMultiplier: 1,
        supervisionMultiplier: 1,
      },
    ],
    guardrails: { minGrossMarginPct: '22' },
    tax: { code: 'GST', label: 'GST', ratePct: '10', displayInclusive: false },
    contract: { termMonths: 12, quoteValidityDays: 30 },
    ...overrides,
  };
}

describe('quoteCalculationInputSchema', () => {
  it('accepts a complete, well-formed calculation input', () => {
    const result = safeParse(quoteCalculationInputSchema, validInput());
    expect(result.ok).toBe(true);
  });

  it('rejects a labour line pointing at a profile that is not on the rate card', () => {
    const input = validInput({
      labourLines: [
        {
          id: 'nightly',
          kind: 'staffing',
          label: 'Nightly clean',
          category: 'routine',
          labourProfileCode: 'ghost',
          schedule: { pattern: 'weekly', daysPerWeek: 5 },
          cleanersPerShift: 1,
          hoursPerShift: 2,
        },
      ],
    });
    const result = safeParse(quoteCalculationInputSchema, input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.message).toContain('not on this rate card');
    }
  });

  it('rejects duplicate labour line ids', () => {
    const line = validInput().labourLines[0];
    const result = safeParse(quoteCalculationInputSchema, validInput({ labourLines: [line, line] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.message).toContain('Duplicate labour line id');
  });

  it('rejects a duplicated scenario key', () => {
    const s = validInput().scenarios[0];
    const result = safeParse(quoteCalculationInputSchema, validInput({ scenarios: [s, s] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.message).toContain('defined more than once');
  });

  it('requires at least one pricing scenario', () => {
    expect(safeParse(quoteCalculationInputSchema, validInput({ scenarios: [] })).ok).toBe(false);
  });

  it('rejects a floating point number where a decimal string is required', () => {
    const input = validInput({
      labourProfiles: [
        { code: 'cleaner', label: 'Cleaner', baseHourlyRate: 30.1, engagement: 'employee' },
      ],
    });
    expect(safeParse(quoteCalculationInputSchema, input).ok).toBe(false);
  });

  it('rejects a currency that is not a three-letter ISO code', () => {
    expect(safeParse(quoteCalculationInputSchema, validInput({ currency: 'Dollars' })).ok).toBe(
      false,
    );
  });

  it('rejects a zero rounding increment rather than dividing by zero downstream', () => {
    const input = validInput({ rounding: { increment: '0', mode: 'half_up' } });
    expect(safeParse(quoteCalculationInputSchema, input).ok).toBe(false);
  });

  it('reports every problem at once rather than only the first', () => {
    const result = safeParse(
      quoteCalculationInputSchema,
      validInput({ currency: 'nope', absenceAllowancePct: 'twelve' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(1);
  });
});

describe('serviceScheduleSchema', () => {
  it('rejects a weekly schedule with eight service days', () => {
    expect(safeParse(serviceScheduleSchema, { pattern: 'weekly', daysPerWeek: 8 }).ok).toBe(false);
  });

  it('requires an occurrence count on a custom schedule', () => {
    expect(safeParse(serviceScheduleSchema, { pattern: 'custom_per_year' }).ok).toBe(false);
    expect(
      safeParse(serviceScheduleSchema, { pattern: 'custom_per_year', occurrencesPerYear: 17 }).ok,
    ).toBe(true);
  });
});

describe('labourLineSchema', () => {
  it('rejects a productivity rate of zero', () => {
    const line = {
      id: 'a',
      kind: 'productivity',
      label: 'Vacuum',
      category: 'routine',
      labourProfileCode: 'cleaner',
      schedule: { pattern: 'annual' },
      quantity: 100,
      quantityUnit: 'm2',
      productivity: { method: 'units_per_hour', value: 0 },
    };
    expect(safeParse(labourLineSchema, line).ok).toBe(false);
  });

  it('rejects an adjustment factor of zero, which would erase the labour', () => {
    const line = {
      id: 'a',
      kind: 'productivity',
      label: 'Vacuum',
      category: 'routine',
      labourProfileCode: 'cleaner',
      schedule: { pattern: 'annual' },
      quantity: 100,
      quantityUnit: 'm2',
      productivity: { method: 'units_per_hour', value: 250 },
      factors: { soil: 0 },
    };
    expect(safeParse(labourLineSchema, line).ok).toBe(false);
  });
});

describe('costLineSchema', () => {
  it('requires a schedule for a per-occurrence cost', () => {
    const base = { id: 'w', label: 'Waste', category: 'waste', method: 'per_occurrence', amount: '45' };
    expect(safeParse(costLineSchema, base).ok).toBe(false);
    expect(
      safeParse(costLineSchema, { ...base, schedule: { pattern: 'weekly', daysPerWeek: 2 } }).ok,
    ).toBe(true);
  });

  it('rejects a negative cost amount', () => {
    const line = { id: 'w', label: 'Waste', category: 'waste', method: 'per_year', amount: '-45' };
    expect(safeParse(costLineSchema, line).ok).toBe(false);
  });
});

describe('overheadRuleSchema', () => {
  it('rejects revenue-based overhead of 100% or more', () => {
    const rule = { code: 'ho', label: 'Head office', method: 'percent_of_revenue', value: '100' };
    expect(safeParse(overheadRuleSchema, rule).ok).toBe(false);
  });
});

describe('guardrailOverrideSchema', () => {
  it('rejects an override without a substantive reason', () => {
    const override = {
      guardrail: 'min_gross_margin',
      reason: 'because',
      userId: 'u1',
      at: '2026-07-26T00:00:00.000Z',
    };
    expect(safeParse(guardrailOverrideSchema, override).ok).toBe(false);
  });

  it('accepts an override that records a real justification', () => {
    const override = {
      guardrail: 'min_gross_margin',
      reason: 'Strategic entry price for the northern precinct, approved by the director.',
      userId: 'u1',
      at: '2026-07-26T00:00:00.000Z',
      approvedByUserId: 'u0',
    };
    expect(safeParse(guardrailOverrideSchema, override).ok).toBe(true);
  });

  it('rejects a timestamp that is not ISO 8601', () => {
    const override = {
      guardrail: 'min_gross_margin',
      reason: 'Strategic entry price for the northern precinct, approved by the director.',
      userId: 'u1',
      at: '26 July 2026',
    };
    expect(safeParse(guardrailOverrideSchema, override).ok).toBe(false);
  });
});
