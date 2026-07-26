import type { CostLine, LabourLine, OverheadRule, RiskItem } from '@cleanquote/types';
import { CALCULATION_SCHEMA_VERSION, DEFAULT_CALENDAR } from '@cleanquote/types';
import { describe, expect, it } from 'vitest';

import { PricingError } from '../src/decimal.js';
import { calculateQuote } from '../src/engine.js';
import { baseInput, scenario } from './helpers/fixtures.js';

function single(input = baseInput()) {
  const result = calculateQuote(input);
  const first = result.scenarios[0];
  if (!first) throw new Error('expected a scenario');
  return { result, s: first };
}

describe('calculateQuote — core arithmetic', () => {
  it('prices a simple recurring contract at the scenario target margin', () => {
    const { s } = single();
    // 520 paid hours x $30 = $15,600 cost; a 25% margin gives $20,800.
    expect(s.totalRecurringCost).toBe('15600.00');
    expect(s.price.annualExTax).toBe('20800.00');
    expect(s.margin.grossMarginPct).toBe('25.0000');
    expect(s.margin.grossProfit).toBe('5200.00');
  });

  it('recovers the expected selling price per paid labour hour', () => {
    const { s } = single();
    expect(s.hourlyRecovery).toBe('40.0000');
  });

  it('derives monthly value from the annual value, never from weekly x 4', () => {
    const { s } = single();
    expect(s.price.perWeekExTax).toBe('400.00');
    expect(s.price.perMonthExTax).toBe('1733.33');
    // The naive "weekly x 4" answer would be 1,600 — a 7.7% understatement.
    expect(s.price.perMonthExTax).not.toBe('1600.00');
  });

  it('derives per-visit value from the annualised occurrence count', () => {
    const { s } = single();
    expect(s.occurrencesPerYear).toBe('260.0000');
    expect(s.price.perOccurrenceExTax).toBe('80.00');
  });

  it('applies tax on top of the ex-tax price', () => {
    const { s } = single();
    expect(s.price.annualTax).toBe('2080.00');
    expect(s.price.annualIncTax).toBe('22880.00');
  });

  it('extends the contract total over the full term and adds one-off charges', () => {
    const { s } = single(baseInput({ contract: { termMonths: 36, quoteValidityDays: 30 } }));
    expect(s.price.contractTotalExTax).toBe('62400.00');
  });

  it('reports margin and markup as different numbers for the same price', () => {
    const { s } = single();
    expect(s.margin.grossMarginPct).toBe('25.0000');
    expect(s.margin.markupPct).toBe('33.3333');
  });

  it('produces identical output for identical input', () => {
    const input = baseInput();
    const a = calculateQuote(input);
    const b = calculateQuote(input);
    expect(a.inputHash).toBe(b.inputHash);
    expect(a.scenarios[0]?.price).toEqual(b.scenarios[0]?.price);
  });

  it('changes the input hash when any input changes', () => {
    const a = calculateQuote(baseInput());
    const b = calculateQuote(baseInput({ absenceAllowancePct: '12' }));
    expect(a.inputHash).not.toBe(b.inputHash);
  });
});

describe('calculateQuote — cost stack', () => {
  it('includes non-labour direct costs in the cost base', () => {
    const costs: CostLine[] = [
      { id: 'chem', label: 'Chemicals', category: 'chemicals', method: 'per_month', amount: '150' },
      { id: 'waste', label: 'Waste', category: 'waste', method: 'per_year', amount: '600' },
    ];
    const { s } = single(baseInput({ costLines: costs }));
    expect(s.costs.recurring).toBe('2400.00');
    expect(s.totalRecurringCost).toBe('18000.00');
    expect(s.price.annualExTax).toBe('24000.00');
  });

  it('recovers fixed overhead before margin is applied', () => {
    const overheads: OverheadRule[] = [
      { code: 'ops', label: 'Operations', method: 'per_labour_hour', value: '2.00' },
    ];
    const { s } = single(baseInput({ overheadRules: overheads }));
    // 520 hours x $2 = $1,040 overhead on top of $15,600 labour.
    expect(s.overheadTotal).toBe('1040.00');
    expect(s.totalRecurringCost).toBe('16640.00');
    expect(s.price.annualExTax).toBe('22186.67');
  });

  it('recovers revenue-based overhead while still hitting the target margin', () => {
    const overheads: OverheadRule[] = [
      { code: 'ho', label: 'Head office', method: 'percent_of_revenue', value: '10' },
    ];
    const { s } = single(baseInput({ overheadRules: overheads }));
    // 15,600 / (1 - 0.25 - 0.10) = 24,000.
    expect(s.price.annualExTax).toBe('24000.00');
    expect(s.overheadTotal).toBe('2400.00');
    expect(s.totalRecurringCost).toBe('18000.00');
    expect(s.margin.grossMarginPct).toBe('25.0000');
  });

  it('prices mobilisation separately from the recurring contract', () => {
    const initial: LabourLine = {
      id: 'initial',
      kind: 'staffing',
      label: 'Initial deep clean',
      category: 'initial_clean',
      labourProfileCode: 'cleaner',
      schedule: { pattern: 'one_off' },
      cleanersPerShift: 4,
      hoursPerShift: 8,
    };
    const { s } = single(
      baseInput({
        labourLines: [...baseInput().labourLines, initial],
        contract: { termMonths: 12, quoteValidityDays: 30 },
      }),
    );
    // 32 hours x $30 = $960 cost, at a 25% margin = $1,280.
    expect(s.totalOneOffCost).toBe('960.00');
    expect(s.price.oneOffExTax).toBe('1280.00');
    // The recurring price is untouched by the one-off work.
    expect(s.price.annualExTax).toBe('20800.00');
    expect(s.price.contractTotalExTax).toBe('22080.00');
  });
});

describe('calculateQuote — contingency and risk', () => {
  const risks: RiskItem[] = [
    {
      id: 'r1',
      code: 'short_cleaning_window',
      label: 'Cleaning window may be shorter than assumed',
      probability: 0.4,
      impactAmount: '3000',
      status: 'open',
    },
    {
      id: 'r2',
      code: 'transferred',
      label: 'Specialist high-access work subcontracted',
      probability: 1,
      impactAmount: '9000',
      status: 'transferred',
    },
  ];

  it('loads contingency by the expected value of open risks only', () => {
    const { s } = single(baseInput({ risks }));
    expect(s.contingency.riskExpectedValue).toBe('1200.00');
    expect(s.contingency.total).toBe('1200.00');
    expect(s.totalRecurringCost).toBe('16800.00');
  });

  it('scales the risk register by the scenario multiplier', () => {
    const lean = single(
      baseInput({ risks, scenarios: [scenario({ riskContingencyMultiplier: '0.5' })] }),
    );
    expect(lean.s.contingency.riskContingency).toBe('600.00');
  });

  it('adds discretionary contingency as a percentage of the cost base', () => {
    const { s } = single(baseInput({ scenarios: [scenario({ contingencyPct: '5' })] }));
    expect(s.contingency.discretionaryContingency).toBe('780.00');
    expect(s.totalRecurringCost).toBe('16380.00');
  });

  it('ranks the largest risks by expected value', () => {
    const { s } = single(baseInput({ risks }));
    expect(s.contingency.topRisks[0]?.code).toBe('short_cleaning_window');
    expect(s.contingency.topRisks).toHaveLength(1);
  });
});

describe('calculateQuote — guardrails and negotiation', () => {
  it('lifts a scenario price that breaches the organisation margin floor', () => {
    const { s } = single(
      baseInput({
        guardrails: { minGrossMarginPct: '40' },
        scenarios: [scenario({ pricingBasis: { type: 'margin', targetMarginPct: '25' } })],
      }),
    );
    expect(s.price.annualExTax).toBe('26000.00');
    expect(s.guardrails.some((g) => g.outcome === 'enforced')).toBe(true);
    expect(s.warnings.some((w) => w.includes('min_gross_margin'))).toBe(true);
  });

  it('keeps the overridden price but still warns', () => {
    const { s } = single(
      baseInput({
        guardrails: { minGrossMarginPct: '40' },
        guardrailOverrides: [
          {
            guardrail: 'min_gross_margin',
            reason: 'Strategic entry price approved by the director.',
            userId: 'user-7',
            at: '2026-07-26T00:00:00.000Z',
          },
        ],
      }),
    );
    expect(s.price.annualExTax).toBe('20800.00');
    expect(s.guardrails[0]?.outcome).toBe('overridden');
    expect(s.warnings.some((w) => w.includes('overridden'))).toBe(true);
  });

  it('reports negotiation headroom down to the lowest authorised price', () => {
    const { s } = single(baseInput({ guardrails: { minGrossMarginPct: '20' } }));
    expect(s.negotiation.lowestAuthorisedAnnualPrice).toBe('19500.00');
    expect(s.negotiation.headroomFromQuoted).toBe('1300.00');
    expect(s.negotiation.recommendedFloorAnnualPrice).toBe('20150.00');
  });

  it('never reports a negotiation floor above the quoted price', () => {
    const { s } = single(baseInput({ guardrails: { minGrossMarginPct: '45' } }));
    expect(Number(s.negotiation.lowestAuthorisedAnnualPrice)).toBeLessThanOrEqual(
      Number(s.price.annualExTax),
    );
  });
});

describe('calculateQuote — scenarios', () => {
  const threeScenarios = [
    scenario({
      key: 'aggressive',
      label: 'Win Strategy',
      pricingBasis: { type: 'margin', targetMarginPct: '28' },
      contingencyPct: '1.5',
      riskContingencyMultiplier: '0.6',
      productivityMultiplier: 0.95,
      supervisionMultiplier: 0.9,
    }),
    scenario({
      key: 'balanced',
      label: 'Recommended',
      pricingBasis: { type: 'margin', targetMarginPct: '35' },
      contingencyPct: '3',
    }),
    scenario({
      key: 'premium',
      label: 'Margin Protection',
      pricingBasis: { type: 'margin', targetMarginPct: '42' },
      contingencyPct: '6',
      riskContingencyMultiplier: '1.4',
      productivityMultiplier: 1.08,
      supervisionMultiplier: 1.25,
    }),
  ];

  it('orders the three strategies from cheapest to dearest', () => {
    const result = calculateQuote(baseInput({ scenarios: threeScenarios }));
    const prices = result.scenarios.map((s) => Number(s.price.annualExTax));
    expect(prices[0]).toBeLessThan(prices[1]!);
    expect(prices[1]).toBeLessThan(prices[2]!);
  });

  it('gives the aggressive scenario leaner labour hours than the premium scenario', () => {
    const result = calculateQuote(baseInput({ scenarios: threeScenarios }));
    const aggressive = result.scenarios.find((s) => s.key === 'aggressive');
    const premium = result.scenarios.find((s) => s.key === 'premium');
    expect(aggressive?.labour.recurringProductiveHoursPerYear).toBe('494.0000');
    expect(premium?.labour.recurringProductiveHoursPerYear).toBe('561.6000');
  });

  it('applies a strategic discount and reports the margin cost of doing so', () => {
    const { s } = single(baseInput({ scenarios: [scenario({ discountPct: '10' })] }));
    expect(s.price.annualExTax).toBe('18720.00');
    expect(Number(s.margin.grossMarginPct)).toBeLessThan(25);
    expect(s.warnings.some((w) => w.includes('strategic discount'))).toBe(true);
  });

  it('recommends the balanced scenario by default', () => {
    const result = calculateQuote(baseInput({ scenarios: threeScenarios }));
    expect(result.recommendedScenarioKey).toBe('balanced');
    expect(result.recommendationReasons.length).toBeGreaterThan(0);
  });

  it('recommends the premium scenario when input confidence is low', () => {
    const result = calculateQuote(
      baseInput({
        scenarios: threeScenarios,
        dataCompleteness: {
          measurementVerifiedRatio: 0,
          aiFactsConfirmedRatio: 0,
          missingInformationCount: 8,
          walkthroughCompleted: false,
        },
      }),
    );
    expect(result.recommendedScenarioKey).toBe('premium');
  });

  it('rejects a discount of 100% or more', () => {
    expect(() =>
      calculateQuote(baseInput({ scenarios: [scenario({ discountPct: '100' })] })),
    ).toThrow(PricingError);
  });
});

describe('calculateQuote — input validation', () => {
  it('refuses to run against a different calculation schema version', () => {
    expect(() => calculateQuote(baseInput({ calculationSchemaVersion: '0.9.0' }))).toThrow(
      /SCHEMA|schema/,
    );
  });

  it('refuses a calculation with no scenarios', () => {
    expect(() => calculateQuote(baseInput({ scenarios: [] }))).toThrow(
      /At least one pricing scenario/,
    );
  });

  it('stamps the engine schema version on every result', () => {
    const { result } = single();
    expect(result.calculationSchemaVersion).toBe(CALCULATION_SCHEMA_VERSION);
  });

  it('warns when on-demand work is priced from a budgeted call-out count', () => {
    const reactive: LabourLine = {
      id: 'reactive',
      kind: 'staffing',
      label: 'Reactive call-outs',
      category: 'reactive',
      labourProfileCode: 'cleaner',
      schedule: { pattern: 'on_demand', budgetedCallOutsPerYear: 6 },
      cleanersPerShift: 1,
      hoursPerShift: 3,
    };
    const { s } = single(baseInput({ labourLines: [...baseInput().labourLines, reactive] }));
    expect(s.warnings.some((w) => w.includes('budgeted on-demand'))).toBe(true);
  });

  it('uses the organisation calendar rather than a hard-coded 52-week year', () => {
    const { s } = single(baseInput({ calendar: DEFAULT_CALENDAR }));
    expect(s.occurrencesPerYear).toBe('260.8875');
    expect(s.price.annualExTax).toBe('20871.00');
  });
});
