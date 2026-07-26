/**
 * Pricing engine contract.
 *
 * Conventions used consistently across this file:
 *  - Any field ending `Pct` is a PERCENT expressed as a decimal string: "12.5" means 12.5%.
 *  - Any monetary field is a decimal string in the calculation currency.
 *  - Quantities, hours and dimensionless factors are plain numbers (they originate from
 *    measurements, which are inherently floating point).
 *  - A `Factor` of 1 means "no adjustment".
 */
import type { Money, RoundingPolicy } from './money';
import type { CalendarAssumptions, ServiceSchedule } from './schedule';

/** Bumped whenever the arithmetic changes. Stored on every calculation snapshot. */
export const CALCULATION_SCHEMA_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Rate card
// ---------------------------------------------------------------------------

export interface LabourProfile {
  readonly code: string;
  readonly label: string;
  /** Base cost to the business per productive hour, before on-costs. */
  readonly baseHourlyRate: string;
  /** Employment model changes which on-cost rules legitimately apply. */
  readonly engagement: 'employee' | 'subcontractor' | 'agency';
}

/**
 * On-costs are ordered and can cascade. Payroll tax that applies to wages *including*
 * superannuation is `appliesTo: 'running_total'` with a higher `order` than the
 * superannuation rule. Countries differ; nothing here is hard-coded to one jurisdiction.
 */
export interface OnCostRule {
  readonly code: string;
  readonly label: string;
  readonly method: 'percent' | 'per_paid_hour' | 'fixed_per_year';
  readonly value: string;
  readonly appliesTo: 'base' | 'running_total';
  readonly order: number;
  /** Restrict the rule to certain engagement types. Empty/undefined means all. */
  readonly appliesToEngagements?: readonly LabourProfile['engagement'][];
}

export type CostCategory =
  | 'chemicals'
  | 'consumables'
  | 'client_consumables'
  | 'equipment'
  | 'equipment_rental'
  | 'depreciation'
  | 'repairs'
  | 'vehicle'
  | 'fuel'
  | 'parking'
  | 'tolls'
  | 'waste'
  | 'laundry'
  | 'ppe'
  | 'testing'
  | 'certification'
  | 'induction'
  | 'security_checks'
  | 'high_access_equipment'
  | 'subcontractor'
  | 'software'
  | 'training'
  | 'other';

// ---------------------------------------------------------------------------
// Labour lines
// ---------------------------------------------------------------------------

export type LabourCategory =
  | 'routine'
  | 'periodical'
  | 'supervision'
  | 'day_porter'
  | 'management'
  | 'mobilisation'
  | 'initial_clean'
  | 'reactive';

/** Multipliers applied to raw production hours. 1 = no adjustment. */
export interface LabourAdjustmentFactors {
  readonly difficulty?: number;
  readonly soil?: number;
  readonly traffic?: number;
  readonly furnitureDensity?: number;
  readonly access?: number;
  readonly compliance?: number;
}

interface LabourLineBase {
  readonly id: string;
  readonly label: string;
  readonly category: LabourCategory;
  readonly labourProfileCode: string;
  readonly schedule: ServiceSchedule;
  /** Percent uplift for weekend / public holiday / overtime rates on this line. */
  readonly rateLoadingPct?: string;
  /** Links the line back to the space or asset it was derived from. */
  readonly sourceSpaceId?: string;
  readonly notes?: string;
}

/** Hours derived from a quantity and a productivity benchmark. */
export interface ProductivityLabourLine extends LabourLineBase {
  readonly kind: 'productivity';
  readonly quantity: number;
  readonly quantityUnit: 'm2' | 'each' | 'linear_m' | 'fixture';
  readonly productivity:
    | { readonly method: 'units_per_hour'; readonly value: number }
    | { readonly method: 'minutes_per_unit'; readonly value: number };
  readonly factors?: LabourAdjustmentFactors;
  readonly benchmarkId?: string;
}

/** Hours derived from a staffing model: cleaners x hours x occurrences. */
export interface StaffingLabourLine extends LabourLineBase {
  readonly kind: 'staffing';
  readonly cleanersPerShift: number;
  readonly hoursPerShift: number;
}

/** Hours derived as a percentage of other lines' hours (e.g. supervision at 8%). */
export interface PercentOfLabourLine extends LabourLineBase {
  readonly kind: 'percent_of_labour';
  readonly percentOfHours: string;
  /** Which categories form the basis. Defaults to `['routine']`. */
  readonly basisCategories?: readonly LabourCategory[];
}

export type LabourLine = ProductivityLabourLine | StaffingLabourLine | PercentOfLabourLine;

// ---------------------------------------------------------------------------
// Non-labour cost lines
// ---------------------------------------------------------------------------

export interface CostLine {
  readonly id: string;
  readonly label: string;
  readonly category: CostCategory;
  readonly method: 'per_year' | 'per_month' | 'per_occurrence' | 'per_labour_hour' | 'one_off';
  readonly amount: string;
  /** Required when `method` is `per_occurrence`. */
  readonly schedule?: ServiceSchedule;
  /** `true` for mobilisation, initial deep clean, equipment purchase at start of term. */
  readonly oneOff?: boolean;
}

// ---------------------------------------------------------------------------
// Overhead
// ---------------------------------------------------------------------------

/**
 * `percent_of_revenue` is solved algebraically rather than iteratively — see
 * docs/PRICING_ENGINE.md for the closed form. It is the only rule type that makes the
 * cost base depend on the selling price.
 */
export interface OverheadRule {
  readonly code: string;
  readonly label: string;
  readonly method:
    | 'fixed_per_year'
    | 'per_month'
    | 'per_occurrence'
    | 'per_labour_hour'
    | 'percent_of_revenue'
    | 'percent_of_direct_cost';
  readonly value: string;
  /** Required for `per_occurrence`. */
  readonly schedule?: ServiceSchedule;
}

// ---------------------------------------------------------------------------
// Risk
// ---------------------------------------------------------------------------

export type RiskStatus = 'open' | 'mitigated' | 'accepted' | 'transferred';

export interface RiskItem {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  /** 0-1. */
  readonly probability: number;
  /** Annualised cost impact if the risk materialises. */
  readonly impactAmount: string;
  readonly mitigation?: string;
  readonly ownerUserId?: string;
  readonly status: RiskStatus;
}

// ---------------------------------------------------------------------------
// Scenarios and guardrails
// ---------------------------------------------------------------------------

export type ScenarioKey = 'aggressive' | 'balanced' | 'premium';

export type PricingBasis =
  | { readonly type: 'margin'; readonly targetMarginPct: string }
  | { readonly type: 'markup'; readonly markupPct: string };

export interface ScenarioConfig {
  readonly key: ScenarioKey;
  /** Organisation-renameable. Internal only — never shown to a client. */
  readonly label: string;
  readonly pricingBasis: PricingBasis;
  /** Percent applied to (direct cost + overhead) as discretionary contingency. */
  readonly contingencyPct: string;
  /** Scales the risk register's expected value. Aggressive may carry less. */
  readonly riskContingencyMultiplier: string;
  /** <1 = leaner hours, >1 = more conservative hours. Applied to all labour lines. */
  readonly productivityMultiplier: number;
  /** Scales supervision and management labour only. */
  readonly supervisionMultiplier: number;
  /** Applied to the computed price as a strategic discount. */
  readonly discountPct?: string;
  readonly rationale?: string;
}

export type GuardrailCode =
  | 'min_gross_margin'
  | 'min_contribution_margin'
  | 'min_hourly_recovery'
  | 'min_charge_per_visit'
  | 'min_annual_contract_value'
  | 'min_mobilisation_charge';

export interface Guardrails {
  readonly minGrossMarginPct?: string;
  readonly minContributionMarginPct?: string;
  /** Minimum selling price recovered per paid labour hour. */
  readonly minHourlyRecovery?: string;
  readonly minChargePerVisit?: string;
  readonly minAnnualContractValue?: string;
  readonly minMobilisationCharge?: string;
}

/**
 * An override never silently lowers a price. It must carry a reason and an identity,
 * and the engine still reports the guardrail as breached so the UI can warn.
 */
export interface GuardrailOverride {
  readonly guardrail: GuardrailCode;
  readonly reason: string;
  readonly userId: string;
  readonly at: string;
  readonly approvedByUserId?: string;
}

export type GuardrailOutcome = 'satisfied' | 'enforced' | 'overridden';

export interface GuardrailApplication {
  readonly guardrail: GuardrailCode;
  readonly outcome: GuardrailOutcome;
  readonly requiredValue: string;
  readonly actualValueBefore: string;
  /** Present when `outcome` is `enforced`: the price the engine lifted the quote to. */
  readonly enforcedAnnualPrice?: string;
  readonly override?: GuardrailOverride;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Tax and contract
// ---------------------------------------------------------------------------

export interface TaxConfig {
  readonly code: string;
  readonly label: string;
  readonly ratePct: string;
  /** When true the organisation quotes tax-inclusive figures to clients. */
  readonly displayInclusive: boolean;
}

export interface ContractTerms {
  readonly termMonths: number;
  readonly quoteValidityDays: number;
}

export interface OptionalService {
  readonly id: string;
  readonly label: string;
  /** Priced independently and presented as an add-on; excluded from the core price. */
  readonly annualPrice: string;
  readonly annualCost: string;
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// Engine input
// ---------------------------------------------------------------------------

export interface QuoteCalculationInput {
  readonly calculationSchemaVersion: string;
  readonly currency: string;
  readonly rounding: RoundingPolicy;
  readonly calendar: CalendarAssumptions;
  readonly labourProfiles: readonly LabourProfile[];
  readonly onCostRules: readonly OnCostRule[];
  /**
   * Percent uplift converting productive hours into paid hours: annual leave, sick
   * leave, training time and relief coverage that must be paid but does not clean.
   */
  readonly absenceAllowancePct: string;
  readonly labourLines: readonly LabourLine[];
  readonly costLines: readonly CostLine[];
  readonly overheadRules: readonly OverheadRule[];
  readonly risks: readonly RiskItem[];
  readonly scenarios: readonly ScenarioConfig[];
  readonly guardrails: Guardrails;
  readonly guardrailOverrides?: readonly GuardrailOverride[];
  readonly tax: TaxConfig;
  readonly contract: ContractTerms;
  readonly optionalServices?: readonly OptionalService[];
  /** 0-1 completeness signal from the capture layer, used for the confidence score. */
  readonly dataCompleteness?: DataCompleteness;
  readonly strategicContext?: StrategicContext;
}

/**
 * Commercial context used to recommend a scenario. Every field is an organisation-owned
 * or estimator-supplied judgement. Nothing here is scraped from competitors, and no
 * field carries another organisation's pricing.
 */
export interface StrategicContext {
  /** How price-driven the buyer is believed to be. */
  readonly priceSensitivity?: 'low' | 'medium' | 'high';
  readonly incumbentDissatisfaction?: 'unknown' | 'none' | 'some' | 'high';
  readonly relationshipStrength?: 'none' | 'weak' | 'established' | 'strong';
  /** Whether the site sits on an existing cleaning round. */
  readonly routeDensity?: 'isolated' | 'adjacent' | 'clustered';
  readonly labourAvailability?: 'scarce' | 'normal' | 'plentiful';
  readonly capacityAvailable?: 'stretched' | 'normal' | 'spare';
  readonly contractAttractiveness?: 'low' | 'medium' | 'high';
  readonly salesStage?: 'early' | 'shortlisted' | 'final_negotiation';
  /** Organisation's own historical win rate for comparable work, as a percent string. */
  readonly historicalWinRatePct?: string;
  readonly crossSellPotential?: 'none' | 'some' | 'high';
}

export interface DataCompleteness {
  /** Fraction of spaces with a verified floor area. */
  readonly measurementVerifiedRatio: number;
  /** Fraction of AI-extracted facts the user confirmed. */
  readonly aiFactsConfirmedRatio: number;
  readonly missingInformationCount: number;
  readonly walkthroughCompleted: boolean;
}

// ---------------------------------------------------------------------------
// Engine output
// ---------------------------------------------------------------------------

export interface LabourLineResult {
  readonly lineId: string;
  readonly label: string;
  readonly category: LabourCategory;
  readonly occurrencesPerYear: string;
  /** Hours actually spent cleaning, after adjustment factors. */
  readonly productiveHoursPerYear: string;
  /** Productive hours grossed up by the absence allowance. This is what gets paid. */
  readonly paidHoursPerYear: string;
  readonly baseRate: string;
  readonly effectiveHourlyCost: string;
  readonly baseCost: string;
  readonly onCostAmount: string;
  readonly totalCost: string;
  readonly oneOff: boolean;
}

export interface LabourBreakdown {
  readonly lines: readonly LabourLineResult[];
  readonly recurringProductiveHoursPerYear: string;
  readonly recurringPaidHoursPerYear: string;
  readonly oneOffPaidHours: string;
  readonly recurringCost: string;
  readonly oneOffCost: string;
  readonly totalCost: string;
  readonly onCostTotal: string;
  readonly blendedHourlyCost: string;
}

export interface CostLineResult {
  readonly lineId: string;
  readonly label: string;
  readonly category: CostCategory;
  readonly annualAmount: string;
  readonly oneOff: boolean;
}

export interface CostBreakdown {
  readonly lines: readonly CostLineResult[];
  readonly byCategory: Readonly<Record<string, string>>;
  readonly recurring: string;
  readonly oneOff: string;
  readonly total: string;
}

export interface OverheadResult {
  readonly code: string;
  readonly label: string;
  readonly method: OverheadRule['method'];
  readonly annualAmount: string;
}

export interface ContingencyBreakdown {
  readonly riskExpectedValue: string;
  readonly riskContingency: string;
  readonly discretionaryContingency: string;
  readonly total: string;
  readonly topRisks: readonly { readonly code: string; readonly expectedValue: string }[];
}

export interface PriceBreakdown {
  readonly annualExTax: string;
  readonly annualTax: string;
  readonly annualIncTax: string;
  readonly perOccurrenceExTax: string;
  readonly perWeekExTax: string;
  readonly perMonthExTax: string;
  readonly oneOffExTax: string;
  readonly contractTotalExTax: string;
  readonly optionalServicesAnnualExTax: string;
}

export interface MarginBreakdown {
  /** Recurring contract only. */
  readonly grossProfit: string;
  readonly grossMarginPct: string;
  readonly markupPct: string;
  readonly contributionMargin: string;
  readonly contributionMarginPct: string;
  /**
   * Whole-of-deal margin: recurring plus one-off revenue against recurring plus
   * one-off cost. For a purely one-off job — a window clean, a post-construction
   * detail — the recurring figures above are all zero and this is the only margin
   * that means anything.
   */
  readonly overallGrossProfit: string;
  readonly overallGrossMarginPct: string;
}

export interface NegotiationRange {
  /** Lowest price that still satisfies every guardrail without an override. */
  readonly lowestAuthorisedAnnualPrice: string;
  readonly recommendedFloorAnnualPrice: string;
  readonly headroomFromQuoted: string;
  readonly headroomPct: string;
}

export interface ScenarioResult {
  readonly key: ScenarioKey;
  readonly label: string;
  readonly labour: LabourBreakdown;
  readonly costs: CostBreakdown;
  readonly overheads: readonly OverheadResult[];
  readonly overheadTotal: string;
  readonly contingency: ContingencyBreakdown;
  readonly totalRecurringCost: string;
  readonly totalOneOffCost: string;
  readonly totalCost: string;
  readonly price: PriceBreakdown;
  readonly margin: MarginBreakdown;
  /** Selling price recovered per paid labour hour — the fastest sanity check there is. */
  readonly hourlyRecovery: string;
  readonly occurrencesPerYear: string;
  readonly guardrails: readonly GuardrailApplication[];
  /** 0-1. Reflects data completeness and risk exposure, not price attractiveness. */
  readonly confidence: number;
  /**
   * `unknown` when the capture layer supplied no completeness signal. An absent signal
   * is not evidence of poor data, so downstream logic must not treat it as low
   * confidence — it means "not yet assessable".
   */
  readonly confidenceBasis: 'measured' | 'unknown';
  readonly negotiation: NegotiationRange;
  readonly warnings: readonly string[];
}

export interface QuoteCalculationResult {
  readonly calculationSchemaVersion: string;
  readonly currency: string;
  readonly calculatedAt: string;
  readonly inputHash: string;
  readonly scenarios: readonly ScenarioResult[];
  readonly recommendedScenarioKey: ScenarioKey;
  readonly recommendationReasons: readonly string[];
  readonly warnings: readonly string[];
}

export type { Money };
