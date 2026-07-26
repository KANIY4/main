export { calculateQuote } from './engine.js';
export { computeLabour, effectiveHourlyCost } from './labour.js';
export { computeCosts, computeOverheads, resolveRevenueOverheads } from './costs.js';
export { computeContingency, riskExposureRatio } from './contingency.js';
export { applyGuardrails } from './guardrails.js';
export type { GuardrailInputs, GuardrailOutput } from './guardrails.js';
export { solvePrice, priceForMinimumMargin } from './solver.js';
export { occurrencesPerYear, isOneOffSchedule } from './schedule.js';
export { computeConfidence } from './confidence.js';
export { recommendScenario } from './recommend.js';
export type { Recommendation } from './recommend.js';
export { stableHash } from './hash.js';
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
} from './decimal.js';
export type { Numeric, PricingErrorCode } from './decimal.js';
export {
  STARTER_SCENARIOS,
  STARTER_ON_COSTS,
  STARTER_OVERHEADS,
  STARTER_GUARDRAILS,
  STARTER_ABSENCE_ALLOWANCE_PCT,
} from './defaults.js';
