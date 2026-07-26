import type {
  CalendarAssumptions,
  CostBreakdown,
  CostLine,
  CostLineResult,
  OverheadResult,
  OverheadRule,
} from '@cleanquote/types';

import type { Decimal} from './decimal.js';
import { dec, fromPct, money, PricingError, sum, ZERO } from './decimal.js';
import { occurrencesPerYear } from './schedule.js';

function annualiseCostLine(
  line: CostLine,
  calendar: CalendarAssumptions,
  recurringPaidHours: Decimal,
): Decimal {
  const amount = dec(line.amount);
  switch (line.method) {
    case 'per_year':
      return amount;
    case 'per_month':
      return amount.mul(calendar.monthsPerYear);
    case 'per_occurrence': {
      if (!line.schedule) {
        throw new PricingError(
          'INVALID_SCHEDULE',
          `Cost line "${line.id}" uses per_occurrence but has no schedule`,
          { lineId: line.id },
        );
      }
      return amount.mul(occurrencesPerYear(line.schedule, calendar));
    }
    case 'per_labour_hour':
      return amount.mul(recurringPaidHours);
    case 'one_off':
      return amount;
    default: {
      const exhaustive: never = line.method;
      throw new PricingError('INVALID_SCHEDULE', `Unsupported cost method: ${exhaustive}`);
    }
  }
}

export function computeCosts(
  costLines: readonly CostLine[],
  calendar: CalendarAssumptions,
  recurringPaidHours: Decimal,
): CostBreakdown {
  const results: { result: CostLineResult; amount: Decimal }[] = costLines.map((line) => {
    const amount = annualiseCostLine(line, calendar, recurringPaidHours);
    const oneOff = line.oneOff ?? line.method === 'one_off';
    return {
      amount,
      result: {
        lineId: line.id,
        label: line.label,
        category: line.category,
        annualAmount: money(amount),
        oneOff,
      },
    };
  });

  const byCategory: Record<string, string> = {};
  for (const { result, amount } of results) {
    const previous = byCategory[result.category];
    byCategory[result.category] = money(dec(previous ?? '0').plus(amount));
  }

  const recurring = sum(results.filter((r) => !r.result.oneOff).map((r) => r.amount));
  const oneOff = sum(results.filter((r) => r.result.oneOff).map((r) => r.amount));

  return {
    lines: results.map((r) => r.result),
    byCategory,
    recurring: money(recurring),
    oneOff: money(oneOff),
    total: money(recurring.plus(oneOff)),
  };
}

export interface OverheadComputation {
  readonly results: readonly OverheadResult[];
  /** Overhead that does not depend on the selling price. */
  readonly fixedTotal: Decimal;
  /** Combined `percent_of_revenue` rate as a fraction, solved algebraically later. */
  readonly revenueRate: Decimal;
}

/**
 * Overhead recovery.
 *
 * `percent_of_revenue` rules are deliberately NOT resolved here: they make the cost base
 * a function of the selling price, which the price solver handles in closed form rather
 * than by iterating to convergence. See docs/PRICING_ENGINE.md.
 */
export function computeOverheads(
  rules: readonly OverheadRule[],
  calendar: CalendarAssumptions,
  directRecurringCost: Decimal,
  recurringPaidHours: Decimal,
  primaryOccurrences: Decimal,
): OverheadComputation {
  const results: OverheadResult[] = [];
  let fixedTotal = ZERO;
  let revenueRate = ZERO;

  for (const rule of rules) {
    let amount = ZERO;
    switch (rule.method) {
      case 'fixed_per_year':
        amount = dec(rule.value);
        break;
      case 'per_month':
        amount = dec(rule.value).mul(calendar.monthsPerYear);
        break;
      case 'per_occurrence':
        amount = dec(rule.value).mul(
          rule.schedule ? occurrencesPerYear(rule.schedule, calendar) : primaryOccurrences,
        );
        break;
      case 'per_labour_hour':
        amount = dec(rule.value).mul(recurringPaidHours);
        break;
      case 'percent_of_direct_cost':
        amount = directRecurringCost.mul(fromPct(rule.value));
        break;
      case 'percent_of_revenue':
        revenueRate = revenueRate.plus(fromPct(rule.value));
        results.push({
          code: rule.code,
          label: rule.label,
          method: rule.method,
          // Filled in by the solver once the price is known.
          annualAmount: money(ZERO),
        });
        continue;
      default: {
        const exhaustive: never = rule.method;
        throw new PricingError('INVALID_SCHEDULE', `Unsupported overhead method: ${exhaustive}`);
      }
    }
    fixedTotal = fixedTotal.plus(amount);
    results.push({
      code: rule.code,
      label: rule.label,
      method: rule.method,
      annualAmount: money(amount),
    });
  }

  return { results, fixedTotal, revenueRate };
}

/** Rewrites the placeholder amounts for revenue-based overhead once the price is known. */
export function resolveRevenueOverheads(
  results: readonly OverheadResult[],
  rules: readonly OverheadRule[],
  annualRevenue: Decimal,
): OverheadResult[] {
  const rateByCode = new Map(
    rules
      .filter((r) => r.method === 'percent_of_revenue')
      .map((r) => [r.code, fromPct(r.value)] as const),
  );
  return results.map((result) =>
    result.method === 'percent_of_revenue'
      ? {
          ...result,
          annualAmount: money(annualRevenue.mul(rateByCode.get(result.code) ?? ZERO)),
        }
      : result,
  );
}
