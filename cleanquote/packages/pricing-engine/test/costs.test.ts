import type { CostLine, OverheadRule } from '@cleanquote/types';
import { describe, expect, it } from 'vitest';

import { computeCosts, computeOverheads, resolveRevenueOverheads } from '../src/costs';
import { dec, PricingError, ZERO } from '../src/decimal';
import { SIMPLE_CALENDAR } from './helpers/fixtures';

const RECURRING_HOURS = dec('520');

function cost(overrides: Partial<CostLine> & Pick<CostLine, 'id' | 'method' | 'amount'>): CostLine {
  return {
    label: overrides.label ?? overrides.id,
    category: overrides.category ?? 'other',
    ...overrides,
  } as CostLine;
}

describe('computeCosts', () => {
  it.each([
    ['per_year' as const, '1200', undefined, '1200.00'],
    ['per_month' as const, '100', undefined, '1200.00'],
    ['per_labour_hour' as const, '0.50', undefined, '260.00'],
    ['one_off' as const, '2500', undefined, '2500.00'],
  ])('annualises a %s cost line', (method, amount, _schedule, expected) => {
    const result = computeCosts(
      [cost({ id: 'c1', method, amount })],
      SIMPLE_CALENDAR,
      RECURRING_HOURS,
    );
    expect(result.lines[0]?.annualAmount).toBe(expected);
  });

  it('annualises a per-occurrence cost from its own schedule', () => {
    const line = cost({
      id: 'waste',
      method: 'per_occurrence',
      amount: '45',
      schedule: { pattern: 'weekly', daysPerWeek: 2 },
    });
    const result = computeCosts([line], SIMPLE_CALENDAR, RECURRING_HOURS);
    expect(result.lines[0]?.annualAmount).toBe('4680.00');
  });

  it('rejects a per-occurrence cost with no schedule', () => {
    const line = cost({ id: 'waste', method: 'per_occurrence', amount: '45' });
    expect(() => computeCosts([line], SIMPLE_CALENDAR, RECURRING_HOURS)).toThrow(PricingError);
  });

  it('separates one-off cost from recurring cost', () => {
    const result = computeCosts(
      [
        cost({ id: 'chemicals', method: 'per_month', amount: '150', category: 'chemicals' }),
        cost({ id: 'machine', method: 'one_off', amount: '4200', category: 'equipment' }),
      ],
      SIMPLE_CALENDAR,
      RECURRING_HOURS,
    );
    expect(result.recurring).toBe('1800.00');
    expect(result.oneOff).toBe('4200.00');
    expect(result.total).toBe('6000.00');
  });

  it('treats an explicit oneOff flag as authoritative over the method', () => {
    const result = computeCosts(
      [cost({ id: 'setup', method: 'per_year', amount: '900', oneOff: true })],
      SIMPLE_CALENDAR,
      RECURRING_HOURS,
    );
    expect(result.oneOff).toBe('900.00');
    expect(result.recurring).toBe('0.00');
  });

  it('groups annual amounts by cost category', () => {
    const result = computeCosts(
      [
        cost({ id: 'a', method: 'per_year', amount: '100', category: 'chemicals' }),
        cost({ id: 'b', method: 'per_year', amount: '250', category: 'chemicals' }),
        cost({ id: 'c', method: 'per_year', amount: '80', category: 'waste' }),
      ],
      SIMPLE_CALENDAR,
      RECURRING_HOURS,
    );
    expect(result.byCategory['chemicals']).toBe('350.00');
    expect(result.byCategory['waste']).toBe('80.00');
  });

  it('sums fractional amounts without binary floating point drift', () => {
    const result = computeCosts(
      [
        cost({ id: 'a', method: 'per_year', amount: '0.1', category: 'chemicals' }),
        cost({ id: 'b', method: 'per_year', amount: '0.2', category: 'chemicals' }),
      ],
      SIMPLE_CALENDAR,
      RECURRING_HOURS,
    );
    expect(result.byCategory['chemicals']).toBe('0.30');
    expect(0.1 + 0.2).not.toBe(0.3);
  });
});

describe('computeOverheads', () => {
  const direct = dec('20000');
  const occurrences = dec('260');

  it.each([
    ['fixed_per_year' as const, '5000', '5000.00'],
    ['per_month' as const, '400', '4800.00'],
    ['per_labour_hour' as const, '2.20', '1144.00'],
    ['percent_of_direct_cost' as const, '12', '2400.00'],
  ])('resolves a %s overhead rule', (method, value, expected) => {
    const rule: OverheadRule = { code: 'o', label: 'Overhead', method, value };
    const result = computeOverheads([rule], SIMPLE_CALENDAR, direct, RECURRING_HOURS, occurrences);
    expect(result.results[0]?.annualAmount).toBe(expected);
    expect(result.fixedTotal.toString()).toBe(dec(expected).toString());
  });

  it('falls back to the primary occurrence count for a per-occurrence rule with no schedule', () => {
    const rule: OverheadRule = {
      code: 'o',
      label: 'Audit',
      method: 'per_occurrence',
      value: '1.5',
    };
    const result = computeOverheads([rule], SIMPLE_CALENDAR, direct, RECURRING_HOURS, occurrences);
    expect(result.results[0]?.annualAmount).toBe('390.00');
  });

  it('defers revenue-based overhead to the price solver instead of resolving it', () => {
    const rule: OverheadRule = {
      code: 'head_office',
      label: 'Head office',
      method: 'percent_of_revenue',
      value: '8',
    };
    const result = computeOverheads([rule], SIMPLE_CALENDAR, direct, RECURRING_HOURS, occurrences);
    expect(result.fixedTotal.toString()).toBe('0');
    expect(result.revenueRate.toString()).toBe('0.08');
    expect(result.results[0]?.annualAmount).toBe('0.00');
  });

  it('combines several revenue-based rules into a single rate', () => {
    const rules: OverheadRule[] = [
      { code: 'a', label: 'Head office', method: 'percent_of_revenue', value: '8' },
      { code: 'b', label: 'Sales commission', method: 'percent_of_revenue', value: '2.5' },
    ];
    const result = computeOverheads(rules, SIMPLE_CALENDAR, direct, RECURRING_HOURS, occurrences);
    expect(result.revenueRate.toString()).toBe('0.105');
  });
});

describe('resolveRevenueOverheads', () => {
  it('fills in revenue-based amounts once the price is known', () => {
    const rules: OverheadRule[] = [
      { code: 'head_office', label: 'Head office', method: 'percent_of_revenue', value: '8' },
      { code: 'ops', label: 'Operations', method: 'fixed_per_year', value: '1000' },
    ];
    const computed = computeOverheads(rules, SIMPLE_CALENDAR, ZERO, ZERO, ZERO);
    const resolved = resolveRevenueOverheads(computed.results, rules, dec('50000'));
    expect(resolved.find((r) => r.code === 'head_office')?.annualAmount).toBe('4000.00');
    expect(resolved.find((r) => r.code === 'ops')?.annualAmount).toBe('1000.00');
  });
});
