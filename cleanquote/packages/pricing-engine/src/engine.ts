import type {
  LabourBreakdown,
  QuoteCalculationInput,
  QuoteCalculationResult,
  ScenarioConfig,
  ScenarioResult,
} from '@cleanquote/types';
import { CALCULATION_SCHEMA_VERSION } from '@cleanquote/types';

import { computeConfidence } from './confidence.js';
import { computeContingency, riskExposureRatio } from './contingency.js';
import { computeCosts, computeOverheads, resolveRevenueOverheads } from './costs.js';
import {
  dec,
  Decimal,
  fromPct,
  hours,
  money,
  ONE,
  PricingError,
  roundToPolicy,
  safeDivide,
  sum,
  toPct,
  ZERO,
} from './decimal.js';
import { applyGuardrails } from './guardrails.js';
import { stableHash } from './hash.js';
import { computeLabour } from './labour.js';
import { recommendScenario } from './recommend.js';
import { solvePrice } from './solver.js';

/**
 * The billing cadence a client actually sees. Taken from the routine labour with the
 * highest annual occurrence count, because that is what "per visit" means to a buyer.
 */
function primaryOccurrences(labour: LabourBreakdown): Decimal {
  const recurring = labour.lines.filter((line) => !line.oneOff);
  const routine = recurring.filter((line) => line.category === 'routine');
  const pool = routine.length > 0 ? routine : recurring;
  return pool.reduce<Decimal>((max, line) => Decimal.max(max, dec(line.occurrencesPerYear)), ZERO);
}

function computeScenario(input: QuoteCalculationInput, scenario: ScenarioConfig): ScenarioResult {
  const warnings: string[] = [];

  const labour = computeLabour(input, scenario);
  const recurringPaidHours = dec(labour.recurringPaidHoursPerYear);
  const occurrences = primaryOccurrences(labour);

  const costs = computeCosts(input.costLines, input.calendar, recurringPaidHours);
  const directRecurring = dec(labour.recurringCost).plus(dec(costs.recurring));

  const overheads = computeOverheads(
    input.overheadRules,
    input.calendar,
    directRecurring,
    recurringPaidHours,
    occurrences,
  );

  const contingency = computeContingency(
    input.risks,
    scenario,
    directRecurring.plus(overheads.fixedTotal),
  );

  const recurringCostBase = directRecurring.plus(overheads.fixedTotal).plus(dec(contingency.total));

  // ---- recurring price -----------------------------------------------------
  const undiscounted = solvePrice(recurringCostBase, scenario.pricingBasis, overheads.revenueRate);
  const discountRate = fromPct(scenario.discountPct);
  if (discountRate.gte(ONE)) {
    throw new PricingError(
      'INVALID_SCENARIO',
      `Scenario "${scenario.key}" applies a discount of ${scenario.discountPct}%, which cannot be 100% or more`,
    );
  }
  const discounted = undiscounted.mul(ONE.minus(discountRate));
  const roundedAnnual = roundToPolicy(discounted, input.rounding);

  // ---- one-off (mobilisation, initial clean) -------------------------------
  const oneOffCostBase = dec(labour.oneOffCost)
    .plus(dec(costs.oneOff))
    .mul(ONE.plus(fromPct(scenario.contingencyPct)));
  const roundedOneOff = oneOffCostBase.isZero()
    ? ZERO
    : roundToPolicy(solvePrice(oneOffCostBase, scenario.pricingBasis, ZERO), input.rounding);

  // ---- guardrails ----------------------------------------------------------
  const guarded = applyGuardrails({
    guardrails: input.guardrails,
    overrides: input.guardrailOverrides ?? [],
    recurringCostBase,
    directRecurringCost: directRecurring,
    revenueOverheadRate: overheads.revenueRate,
    recurringPaidHours,
    occurrencesPerYear: occurrences,
    quotedAnnualExTax: roundedAnnual,
    quotedOneOffExTax: roundedOneOff,
  });

  const annualExTax = roundToPolicy(guarded.annualExTax, input.rounding);
  const oneOffExTax = roundToPolicy(guarded.oneOffExTax, input.rounding);

  // ---- final cost and margin, now that revenue is known ---------------------
  const revenueOverhead = annualExTax.mul(overheads.revenueRate);
  const overheadResults = resolveRevenueOverheads(
    overheads.results,
    input.overheadRules,
    annualExTax,
  );
  const overheadTotal = overheads.fixedTotal.plus(revenueOverhead);
  const totalRecurringCost = recurringCostBase.plus(revenueOverhead);
  const totalOneOffCost = dec(labour.oneOffCost).plus(dec(costs.oneOff));
  const totalCost = totalRecurringCost.plus(totalOneOffCost);

  const grossProfit = annualExTax.minus(totalRecurringCost);
  const contributionMargin = annualExTax.minus(directRecurring);

  // ---- derived recurring values -------------------------------------------
  const taxRate = fromPct(input.tax.ratePct);
  const annualTax = annualExTax.mul(taxRate);
  const contractYears = dec(input.contract.termMonths).div(12);
  const optionalAnnual = sum((input.optionalServices ?? []).map((s) => dec(s.annualPrice)));

  // ---- warnings ------------------------------------------------------------
  if (discountRate.gt(0)) {
    warnings.push(
      `A strategic discount of ${scenario.discountPct}% has been applied; the achieved margin is below the scenario target as a result.`,
    );
  }
  if (occurrences.isZero()) {
    warnings.push(
      'No recurring service occurrences were derived, so per-visit and per-week values are not meaningful.',
    );
  }
  if (recurringPaidHours.isZero() && !directRecurring.isZero()) {
    warnings.push('This quote carries recurring cost but no recurring labour hours.');
  }
  for (const application of guarded.applications) {
    if (application.outcome !== 'satisfied') warnings.push(application.message);
  }
  const onDemandLines = input.labourLines.filter((l) => l.schedule.pattern === 'on_demand');
  if (onDemandLines.length > 0) {
    warnings.push(
      `${onDemandLines.length} labour line(s) use a budgeted on-demand frequency; the true call-out count is an assumption, not a contracted quantity.`,
    );
  }

  const riskRatio = riskExposureRatio(contingency, totalRecurringCost);
  const confidence = computeConfidence(input.dataCompleteness, riskRatio);

  const lowestAuthorised = Decimal.min(guarded.lowestAuthorisedAnnual, annualExTax);
  const recommendedFloor = lowestAuthorised.plus(annualExTax.minus(lowestAuthorised).div(2));

  return {
    key: scenario.key,
    label: scenario.label,
    labour,
    costs,
    overheads: overheadResults,
    overheadTotal: money(overheadTotal),
    contingency,
    totalRecurringCost: money(totalRecurringCost),
    totalOneOffCost: money(totalOneOffCost),
    totalCost: money(totalCost),
    price: {
      annualExTax: money(annualExTax),
      annualTax: money(annualTax),
      annualIncTax: money(annualExTax.plus(annualTax)),
      perOccurrenceExTax: money(safeDivide(annualExTax, occurrences)),
      perWeekExTax: money(safeDivide(annualExTax, dec(input.calendar.weeksPerYear))),
      perMonthExTax: money(safeDivide(annualExTax, dec(input.calendar.monthsPerYear))),
      oneOffExTax: money(oneOffExTax),
      contractTotalExTax: money(annualExTax.mul(contractYears).plus(oneOffExTax)),
      optionalServicesAnnualExTax: money(optionalAnnual),
    },
    margin: {
      grossProfit: money(grossProfit),
      grossMarginPct: toPct(safeDivide(grossProfit, annualExTax), 4),
      markupPct: toPct(safeDivide(grossProfit, totalRecurringCost), 4),
      contributionMargin: money(contributionMargin),
      contributionMarginPct: toPct(safeDivide(contributionMargin, annualExTax), 4),
    },
    hourlyRecovery: money(safeDivide(annualExTax, recurringPaidHours), 4),
    occurrencesPerYear: hours(occurrences),
    guardrails: guarded.applications,
    confidence,
    confidenceBasis: input.dataCompleteness ? 'measured' : 'unknown',
    negotiation: {
      lowestAuthorisedAnnualPrice: money(lowestAuthorised),
      recommendedFloorAnnualPrice: money(recommendedFloor),
      headroomFromQuoted: money(annualExTax.minus(lowestAuthorised)),
      headroomPct: toPct(safeDivide(annualExTax.minus(lowestAuthorised), annualExTax), 2),
    },
    warnings,
  };
}

/**
 * Calculates every pricing scenario for a quote.
 *
 * This function is the only place a selling price is produced. It is pure: the same
 * input always yields the same output, which is what makes a quote defensible six months
 * later when a client disputes it.
 */
export function calculateQuote(input: QuoteCalculationInput): QuoteCalculationResult {
  if (input.calculationSchemaVersion !== CALCULATION_SCHEMA_VERSION) {
    throw new PricingError(
      'SCHEMA_VERSION_MISMATCH',
      `Input targets calculation schema ${input.calculationSchemaVersion} but this engine implements ${CALCULATION_SCHEMA_VERSION}. Recalculate from the stored quote inputs rather than reusing an old snapshot.`,
      { expected: CALCULATION_SCHEMA_VERSION, received: input.calculationSchemaVersion },
    );
  }
  if (input.scenarios.length === 0) {
    throw new PricingError('INVALID_SCENARIO', 'At least one pricing scenario is required');
  }

  const scenarios = input.scenarios.map((scenario) => computeScenario(input, scenario));
  const recommendation = recommendScenario(scenarios, input.strategicContext);

  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const scenario of scenarios) {
    for (const warning of scenario.warnings) {
      if (!seen.has(warning)) {
        seen.add(warning);
        warnings.push(warning);
      }
    }
  }

  return {
    calculationSchemaVersion: CALCULATION_SCHEMA_VERSION,
    currency: input.currency,
    calculatedAt: new Date().toISOString(),
    inputHash: stableHash(input),
    scenarios,
    recommendedScenarioKey: recommendation.key,
    recommendationReasons: recommendation.reasons,
    warnings,
  };
}
