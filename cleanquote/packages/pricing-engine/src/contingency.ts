import type { ContingencyBreakdown, RiskItem, ScenarioConfig } from '@cleanquote/types';

import { dec, Decimal, fromPct, money, sum, ZERO } from './decimal';

/** Risks that have been transferred or fully mitigated no longer carry a cost loading. */
const PRICED_STATUSES = new Set(['open', 'accepted']);

/**
 * Risk-based contingency uses expected value: sum of (probability x annualised impact).
 *
 * The scenario then scales it — an aggressive bid may carry less of the register, a
 * premium bid more — and adds a flat discretionary percentage on top of the cost base.
 *
 * `riskAllocationShare` splits the register between the recurring contract and the
 * one-off work. Without it, a purely one-off job (a window clean, a post-construction
 * detail) would carry its risk loading on the recurring side and be reported as having
 * an annual contract value it does not have. Risk follows the work it belongs to.
 */
export function computeContingency(
  risks: readonly RiskItem[],
  scenario: ScenarioConfig,
  costBaseForDiscretionary: Decimal,
  riskAllocationShare: Decimal,
): ContingencyBreakdown {
  const priced = risks
    .filter((risk) => PRICED_STATUSES.has(risk.status))
    .map((risk) => {
      const probability = Decimal.min(Decimal.max(dec(risk.probability), 0), 1);
      return { risk, expectedValue: probability.mul(dec(risk.impactAmount)) };
    });

  // The full register value, before the recurring/one-off split. Reported as-is so
  // the UI can show the whole exposure alongside the portion this side carries.
  const riskExpectedValue = sum(priced.map((p) => p.expectedValue));
  const riskContingency = riskExpectedValue
    .mul(dec(scenario.riskContingencyMultiplier))
    .mul(riskAllocationShare);
  const discretionary = costBaseForDiscretionary.mul(fromPct(scenario.contingencyPct));

  const topRisks = priced
    .slice()
    .sort((a, b) => b.expectedValue.comparedTo(a.expectedValue))
    .slice(0, 5)
    .map((p) => ({ code: p.risk.code, expectedValue: money(p.expectedValue) }));

  return {
    riskExpectedValue: money(riskExpectedValue),
    riskContingency: money(riskContingency),
    discretionaryContingency: money(discretionary),
    total: money(riskContingency.plus(discretionary)),
    topRisks,
  };
}

/** Share of the cost base that exists only to absorb uncertainty. Feeds confidence. */
export function riskExposureRatio(contingency: ContingencyBreakdown, totalCost: Decimal): Decimal {
  if (totalCost.lte(0)) return ZERO;
  return dec(contingency.total).div(totalCost);
}
