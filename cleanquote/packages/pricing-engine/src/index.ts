export { calculateQuote } from './engine';
export { computeLabour, effectiveHourlyCost } from './labour';
export { computeCosts, computeOverheads, resolveRevenueOverheads } from './costs';
export { computeContingency, riskExposureRatio } from './contingency';
export { applyGuardrails } from './guardrails';
export type { GuardrailInputs, GuardrailOutput } from './guardrails';
export { solvePrice, priceForMinimumMargin } from './solver';
export { occurrencesPerYear, isOneOffSchedule } from './schedule';
export { computeConfidence } from './confidence';
export { recommendScenario } from './recommend';
export type { Recommendation } from './recommend';
export { stableHash } from './hash';
export {
  Decimal,
  PricingError,
  dec,
  fromPct,
  toPct,
  money,
  hours,
  roundToPolicy,
  safeDivide,
  sum,
} from './decimal';
export type { Numeric, PricingErrorCode } from './decimal';
export {
  STARTER_SCENARIOS,
  STARTER_ON_COSTS,
  STARTER_OVERHEADS,
  STARTER_GUARDRAILS,
  STARTER_ABSENCE_ALLOWANCE_PCT,
  STARTER_ADJUSTMENT_FACTORS,
  starterFactorFor,
} from './defaults';
export type { AdjustmentFactorDimension } from './defaults';
