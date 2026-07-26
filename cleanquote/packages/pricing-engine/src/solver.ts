import type { PricingBasis } from '@cleanquote/types';

import type { Decimal } from './decimal.js';
import { fromPct, ONE, PricingError } from './decimal.js';

/**
 * Closed-form selling price.
 *
 * Overhead recovered as a percentage of revenue makes the cost base depend on the price,
 * which in turn depends on the cost base. Rather than iterating to convergence (which is
 * non-deterministic at the cent and produces different answers on different machines),
 * the engine solves it exactly.
 *
 * With C the price-independent cost base, `o` the revenue-overhead rate and `m` the
 * target margin:
 *
 *     P = C + o.P + m.P          =>   P(1 - m - o) = C   =>   P = C / (1 - m - o)
 *
 * And for a markup `k` on total cost:
 *
 *     P = (C + o.P)(1 + k)       =>   P = C(1 + k) / (1 - o(1 + k))
 */
export function solvePrice(costBase: Decimal, basis: PricingBasis, revenueRate: Decimal): Decimal {
  if (basis.type === 'margin') {
    const margin = fromPct(basis.targetMarginPct);
    const denominator = ONE.minus(margin).minus(revenueRate);
    if (denominator.lte(0)) {
      throw new PricingError(
        'UNSOLVABLE_PRICE',
        `Target margin (${basis.targetMarginPct}%) plus revenue-based overhead (${revenueRate
          .mul(100)
          .toFixed(4)}%) reaches or exceeds 100% of revenue, so no finite price exists`,
        { targetMarginPct: basis.targetMarginPct, revenueRate: revenueRate.toString() },
      );
    }
    return costBase.div(denominator);
  }

  const markup = ONE.plus(fromPct(basis.markupPct));
  const denominator = ONE.minus(revenueRate.mul(markup));
  if (denominator.lte(0)) {
    throw new PricingError(
      'UNSOLVABLE_PRICE',
      `Markup (${basis.markupPct}%) combined with revenue-based overhead (${revenueRate
        .mul(100)
        .toFixed(4)}%) has no finite solution`,
      { markupPct: basis.markupPct, revenueRate: revenueRate.toString() },
    );
  }
  return costBase.mul(markup).div(denominator);
}

/** Lowest price whose gross margin still meets `minMarginPct`, given revenue overhead. */
export function priceForMinimumMargin(
  costBase: Decimal,
  minMarginPct: string,
  revenueRate: Decimal,
): Decimal {
  return solvePrice(costBase, { type: 'margin', targetMarginPct: minMarginPct }, revenueRate);
}
