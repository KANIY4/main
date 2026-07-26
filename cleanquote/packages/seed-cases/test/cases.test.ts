import { calculateQuote } from '@cleanquote/pricing-engine';
import type { QuoteCalculationResult, ScenarioKey } from '@cleanquote/types';
import { quoteCalculationInputSchema, safeParse } from '@cleanquote/validation';
import { describe, expect, it } from 'vitest';

import { SEED_CASES, seedCaseById } from '../src/cases';

function priced(id: string): QuoteCalculationResult {
  const seedCase = seedCaseById(id);
  if (!seedCase) throw new Error(`Unknown seed case: ${id}`);
  return calculateQuote(seedCase.input);
}

function scenario(result: QuoteCalculationResult, key: ScenarioKey) {
  const found = result.scenarios.find((s) => s.key === key);
  if (!found) throw new Error(`Scenario ${key} missing`);
  return found;
}

describe('every seed case', () => {
  it.each(SEED_CASES.map((c) => [c.id, c] as const))('%s passes input validation', (_id, c) => {
    const result = safeParse(quoteCalculationInputSchema, c.input);
    if (!result.ok) {
      throw new Error(result.issues.map((i) => `${i.path}: ${i.message}`).join('\n'));
    }
    expect(result.ok).toBe(true);
  });

  it.each(SEED_CASES.map((c) => [c.id] as const))('%s prices all three scenarios', (id) => {
    const result = priced(id);
    expect(result.scenarios.map((s) => s.key)).toEqual(['aggressive', 'balanced', 'premium']);
  });

  it.each(SEED_CASES.map((c) => [c.id] as const))(
    '%s orders the strategies from cheapest to dearest',
    (id) => {
      const result = priced(id);
      const prices = result.scenarios.map(
        (s) => Number(s.price.annualExTax) + Number(s.price.oneOffExTax),
      );
      expect(prices[0]).toBeLessThan(prices[1]!);
      expect(prices[1]).toBeLessThan(prices[2]!);
    },
  );

  it.each(SEED_CASES.map((c) => [c.id] as const))(
    '%s never produces a price below the organisation margin floor',
    (id) => {
      const result = priced(id);
      for (const s of result.scenarios) {
        const breached = s.guardrails.filter((g) => g.outcome === 'enforced');
        // An enforced guardrail means the engine already lifted the price; what
        // must never happen is a guardrail silently left breached.
        expect(s.guardrails.every((g) => g.outcome !== 'overridden')).toBe(true);
        for (const g of breached) {
          expect(g.enforcedAnnualPrice).toBeDefined();
        }
        // Measured on the whole deal: a purely one-off job has no recurring
        // revenue, so the recurring margin is not the meaningful figure.
        expect(Number(s.margin.overallGrossMarginPct)).toBeGreaterThanOrEqual(12);
      }
    },
  );

  it.each(SEED_CASES.map((c) => [c.id] as const))('%s explains its recommendation', (id) => {
    const result = priced(id);
    expect(result.recommendationReasons.length).toBeGreaterThan(0);
    expect(result.recommendedScenarioKey).toBeTruthy();
  });

  it.each(SEED_CASES.map((c) => [c.id] as const))('%s is reproducible', (id) => {
    expect(priced(id).inputHash).toBe(priced(id).inputHash);
  });
});

describe('case 1 — recurring multi-floor office', () => {
  const result = priced('recurring-office');
  const balanced = scenario(result, 'balanced');

  it('removes public holidays from the serviced year', () => {
    // 5 days x 52.1775 weeks = 260.8875, less 11 public holidays.
    expect(balanced.occurrencesPerYear).toBe('249.8875');
  });

  it('prices mobilisation separately from the recurring contract', () => {
    expect(Number(balanced.price.oneOffExTax)).toBeGreaterThan(0);
    expect(Number(balanced.price.contractTotalExTax)).toBeGreaterThan(
      Number(balanced.price.annualExTax) * 3,
    );
  });

  it('derives monthly value from the annual value, not from weekly x 4', () => {
    const monthly = Number(balanced.price.perMonthExTax);
    const weekly = Number(balanced.price.perWeekExTax);
    expect(monthly).toBeCloseTo(Number(balanced.price.annualExTax) / 12, 1);
    expect(monthly).not.toBeCloseTo(weekly * 4, 0);
  });

  it('carries supervision hours derived from the routine rounds', () => {
    const supervision = balanced.labour.lines.find((l) => l.lineId === 'supervision');
    expect(Number(supervision?.productiveHoursPerYear)).toBeGreaterThan(0);
  });

  it('separates periodical work onto its own frequency', () => {
    const carpet = balanced.labour.lines.find((l) => l.lineId === 'periodical-carpet');
    expect(carpet?.occurrencesPerYear).toBe('4.0000');
  });

  it('prices optional services outside the core contract value', () => {
    expect(balanced.price.optionalServicesAnnualExTax).toBe('53300.00');
  });

  it('recommends a strategy and explains why', () => {
    expect(['aggressive', 'balanced', 'premium']).toContain(result.recommendedScenarioKey);
  });
});

describe('case 2 — high-traffic childcare facility', () => {
  const result = priced('childcare-facility');
  const balanced = scenario(result, 'balanced');

  it('raises production hours for compliance and soil', () => {
    const classrooms = balanced.labour.lines.find((l) => l.lineId === 'classrooms');
    // 8 rooms x 14 minutes = 1.8667 h, x1.25 soil x1.15 compliance = 2.6833 h a visit.
    const perVisit =
      Number(classrooms?.productiveHoursPerYear) / Number(classrooms?.occurrencesPerYear);
    expect(perVisit).toBeCloseTo(2.6833, 3);
  });

  it('carries the daytime round as a fixed staffing commitment', () => {
    const porter = balanced.labour.lines.find((l) => l.lineId === 'daytime-touchpoint');
    expect(porter?.category).toBe('day_porter');
    expect(Number(porter?.productiveHoursPerYear)).toBeCloseTo(2.5 * 249.8875, 2);
  });

  it('bases supervision on both the nightly and daytime rounds', () => {
    const supervision = balanced.labour.lines.find((l) => l.lineId === 'supervision');
    expect(Number(supervision?.productiveHoursPerYear)).toBeGreaterThan(90);
  });
});

describe('case 3 — GMP manufacturing site', () => {
  const result = priced('gmp-manufacturing');
  const balanced = scenario(result, 'balanced');

  it('carries a substantial risk contingency', () => {
    expect(Number(balanced.contingency.riskExpectedValue)).toBeGreaterThan(20000);
  });

  it('ranks the largest exposure first', () => {
    expect(balanced.contingency.topRisks[0]?.code).toBe('shift_restriction');
  });

  it('reports low input confidence from an unverified capture', () => {
    expect(balanced.confidence).toBeLessThan(0.7);
    expect(balanced.confidenceBasis).toBe('measured');
  });

  it('recommends margin protection when labour is scarce and the site is isolated', () => {
    expect(result.recommendedScenarioKey).toBe('premium');
    expect(result.recommendationReasons.join(' ')).toMatch(/scarce|isolated|stretched/);
  });
});

describe('case 4 — one-off window cleaning', () => {
  const result = priced('window-cleaning');
  const balanced = scenario(result, 'balanced');

  it('produces no recurring value for a genuinely one-off job', () => {
    expect(balanced.price.annualExTax).toBe('0.00');
    expect(Number(balanced.price.oneOffExTax)).toBeGreaterThan(0);
  });

  it('warns that per-visit and per-week values are not meaningful', () => {
    expect(balanced.warnings.some((w) => w.includes('not meaningful'))).toBe(true);
  });

  it('applies subcontractor on-costs to the high-access labour only', () => {
    const high = balanced.labour.lines.find((l) => l.lineId === 'glass-high');
    const low = balanced.labour.lines.find((l) => l.lineId === 'glass-low');
    // The subcontractor rule adds 4% of base; the employee cascade adds far more.
    expect(Number(high?.effectiveHourlyCost) / Number(high?.baseRate)).toBeCloseTo(1.04, 2);
    expect(Number(low?.effectiveHourlyCost) / Number(low?.baseRate)).toBeGreaterThan(1.15);
  });

  it('rolls the whole job into the contract total', () => {
    expect(balanced.price.contractTotalExTax).toBe(balanced.price.oneOffExTax);
  });
});

describe('case 5 — tender submission', () => {
  const result = priced('tender-submission');
  const balanced = scenario(result, 'balanced');

  it('counts multiple visits a day across a seven-day week', () => {
    const amenities = balanced.labour.lines.find((l) => l.lineId === 'amenities');
    // 7 days x 4 visits x 52.1775 weeks.
    expect(Number(amenities?.occurrencesPerYear)).toBeCloseTo(1460.97, 1);
  });

  it('applies the weekend rate loading to the covering shift only', () => {
    const weekend = balanced.labour.lines.find((l) => l.lineId === 'weekend-loading');
    const concourse = balanced.labour.lines.find((l) => l.lineId === 'concourse');
    expect(Number(weekend?.baseRate)).toBeCloseTo(Number(concourse?.baseRate) * 1.5, 2);
  });

  it('flags budgeted on-demand work as an assumption rather than a contracted quantity', () => {
    expect(balanced.warnings.some((w) => w.includes('budgeted on-demand'))).toBe(true);
  });

  it('scores low confidence when the tender was read without a walkthrough', () => {
    expect(balanced.confidence).toBeLessThan(0.5);
  });

  it('recommends the premium strategy despite a price-driven buyer', () => {
    // Price sensitivity pulls towards the win strategy, but unverified scope,
    // scarce labour and stretched capacity outweigh it.
    expect(result.recommendedScenarioKey).toBe('premium');
    expect(
      result.recommendationReasons.some((r) => r.startsWith('Considered but outweighed')),
    ).toBe(true);
  });

  it('prices a five-year term across the whole contract', () => {
    expect(Number(balanced.price.contractTotalExTax)).toBeCloseTo(
      Number(balanced.price.annualExTax) * 5 + Number(balanced.price.oneOffExTax),
      0,
    );
  });
});
