import { describe, expect, it } from 'vitest';

import { dec, ONE, PricingError, ZERO } from '../src/decimal.js';
import { priceForMinimumMargin, solvePrice } from '../src/solver.js';

describe('solvePrice', () => {
  it('produces a price whose gross margin equals the target margin', () => {
    const price = solvePrice(dec('15600'), { type: 'margin', targetMarginPct: '25' }, ZERO);
    expect(price.toString()).toBe('20800');

    const margin = price.minus('15600').div(price);
    expect(margin.toString()).toBe('0.25');
  });

  it('produces a price whose markup equals the target markup', () => {
    const price = solvePrice(dec('15600'), { type: 'markup', markupPct: '25' }, ZERO);
    expect(price.toString()).toBe('19500');
  });

  it('distinguishes margin from markup at the same percentage', () => {
    const margin = solvePrice(dec('1000'), { type: 'margin', targetMarginPct: '40' }, ZERO);
    const markup = solvePrice(dec('1000'), { type: 'markup', markupPct: '40' }, ZERO);
    expect(margin.toFixed(2)).toBe('1666.67');
    expect(markup.toFixed(2)).toBe('1400.00');
    expect(margin.gt(markup)).toBe(true);
  });

  it('solves revenue-based overhead exactly rather than by iteration', () => {
    const costBase = dec('100000');
    const revenueRate = dec('0.08');
    const price = solvePrice(costBase, { type: 'margin', targetMarginPct: '35' }, revenueRate);

    // Substituting back: total cost = fixed base + 8% of the resulting revenue, and the
    // margin on that total must be exactly 35%.
    const totalCost = costBase.plus(price.mul(revenueRate));
    const achievedMargin = price.minus(totalCost).div(price);
    expect(achievedMargin.toFixed(10)).toBe(dec('0.35').toFixed(10));
  });

  it('solves revenue-based overhead exactly for a markup basis', () => {
    const costBase = dec('80000');
    const revenueRate = dec('0.1');
    const price = solvePrice(costBase, { type: 'markup', markupPct: '30' }, revenueRate);

    const totalCost = costBase.plus(price.mul(revenueRate));
    const achievedMarkup = price.minus(totalCost).div(totalCost);
    expect(achievedMarkup.toFixed(10)).toBe(dec('0.30').toFixed(10));
  });

  it('refuses a margin plus revenue overhead that reaches 100% of revenue', () => {
    expect(() =>
      solvePrice(dec('1000'), { type: 'margin', targetMarginPct: '95' }, dec('0.05')),
    ).toThrow(PricingError);
  });

  it('refuses a markup that cannot be recovered against revenue overhead', () => {
    expect(() =>
      solvePrice(dec('1000'), { type: 'markup', markupPct: '400' }, dec('0.25')),
    ).toThrow(/no finite solution/);
  });

  it('returns zero for a zero cost base', () => {
    expect(solvePrice(ZERO, { type: 'margin', targetMarginPct: '35' }, ZERO).toString()).toBe('0');
  });

  it('is monotonic: a higher target margin never lowers the price', () => {
    let previous = ZERO;
    for (const target of ['10', '20', '30', '40', '50']) {
      const price = solvePrice(dec('1000'), { type: 'margin', targetMarginPct: target }, ZERO);
      expect(price.gt(previous)).toBe(true);
      previous = price;
    }
  });
});

describe('priceForMinimumMargin', () => {
  it('returns the lowest price that still meets the floor', () => {
    const floor = priceForMinimumMargin(dec('1000'), '20', ZERO);
    expect(floor.toString()).toBe('1250');
    expect(floor.minus('1000').div(floor).toString()).toBe('0.2');
  });

  it('accounts for revenue-based overhead in the floor', () => {
    const floor = priceForMinimumMargin(dec('1000'), '20', dec('0.1'));
    const totalCost = dec('1000').plus(floor.mul('0.1'));
    expect(floor.minus(totalCost).div(floor).toFixed(6)).toBe(ONE.mul('0.2').toFixed(6));
  });
});
