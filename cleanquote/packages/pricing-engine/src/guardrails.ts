import type {
  GuardrailApplication,
  GuardrailCode,
  GuardrailOverride,
  Guardrails,
} from '@cleanquote/types';

import { Decimal, dec, fromPct, money, ONE, safeDivide, toPct, ZERO } from './decimal.js';
import { priceForMinimumMargin } from './solver.js';

export interface GuardrailInputs {
  readonly guardrails: Guardrails;
  readonly overrides: readonly GuardrailOverride[];
  /** Price-independent recurring cost base (direct + fixed overhead + contingency). */
  readonly recurringCostBase: Decimal;
  /** Direct recurring cost only — the basis for contribution margin. */
  readonly directRecurringCost: Decimal;
  readonly revenueOverheadRate: Decimal;
  readonly recurringPaidHours: Decimal;
  readonly occurrencesPerYear: Decimal;
  readonly quotedAnnualExTax: Decimal;
  readonly quotedOneOffExTax: Decimal;
}

export interface GuardrailOutput {
  readonly annualExTax: Decimal;
  readonly oneOffExTax: Decimal;
  readonly applications: readonly GuardrailApplication[];
  /** The floor across every guardrail, ignoring overrides. Drives the negotiation range. */
  readonly lowestAuthorisedAnnual: Decimal;
}

interface Requirement {
  readonly code: GuardrailCode;
  /** Minimum acceptable annual ex-tax price implied by this guardrail. */
  readonly requiredAnnual: Decimal;
  /** Human-readable target, e.g. "38% gross margin" or "$45.00 per labour hour". */
  readonly requiredValue: string;
  readonly actualValue: string;
  readonly appliesTo: 'annual' | 'one_off';
}

function buildRequirements(inputs: GuardrailInputs): Requirement[] {
  const g = inputs.guardrails;
  const requirements: Requirement[] = [];
  const quoted = inputs.quotedAnnualExTax;

  if (g.minGrossMarginPct !== undefined) {
    const required = priceForMinimumMargin(
      inputs.recurringCostBase,
      g.minGrossMarginPct,
      inputs.revenueOverheadRate,
    );
    const actualCost = inputs.recurringCostBase.plus(quoted.mul(inputs.revenueOverheadRate));
    requirements.push({
      code: 'min_gross_margin',
      requiredAnnual: required,
      requiredValue: `${g.minGrossMarginPct}%`,
      actualValue: `${toPct(safeDivide(quoted.minus(actualCost), quoted), 2)}%`,
      appliesTo: 'annual',
    });
  }

  if (g.minContributionMarginPct !== undefined) {
    const denominator = ONE.minus(fromPct(g.minContributionMarginPct));
    const required = denominator.lte(0) ? quoted : inputs.directRecurringCost.div(denominator);
    requirements.push({
      code: 'min_contribution_margin',
      requiredAnnual: required,
      requiredValue: `${g.minContributionMarginPct}%`,
      actualValue: `${toPct(safeDivide(quoted.minus(inputs.directRecurringCost), quoted), 2)}%`,
      appliesTo: 'annual',
    });
  }

  if (g.minHourlyRecovery !== undefined) {
    requirements.push({
      code: 'min_hourly_recovery',
      requiredAnnual: dec(g.minHourlyRecovery).mul(inputs.recurringPaidHours),
      requiredValue: `${g.minHourlyRecovery} per paid labour hour`,
      actualValue: money(safeDivide(quoted, inputs.recurringPaidHours), 4),
      appliesTo: 'annual',
    });
  }

  if (g.minChargePerVisit !== undefined) {
    requirements.push({
      code: 'min_charge_per_visit',
      requiredAnnual: dec(g.minChargePerVisit).mul(inputs.occurrencesPerYear),
      requiredValue: `${g.minChargePerVisit} per visit`,
      actualValue: money(safeDivide(quoted, inputs.occurrencesPerYear)),
      appliesTo: 'annual',
    });
  }

  if (g.minAnnualContractValue !== undefined) {
    requirements.push({
      code: 'min_annual_contract_value',
      requiredAnnual: dec(g.minAnnualContractValue),
      requiredValue: money(dec(g.minAnnualContractValue)),
      actualValue: money(quoted),
      appliesTo: 'annual',
    });
  }

  if (g.minMobilisationCharge !== undefined) {
    requirements.push({
      code: 'min_mobilisation_charge',
      requiredAnnual: ZERO,
      requiredValue: money(dec(g.minMobilisationCharge)),
      actualValue: money(inputs.quotedOneOffExTax),
      appliesTo: 'one_off',
    });
  }

  return requirements;
}

/**
 * Enforces the organisation's commercial floors.
 *
 * A breached guardrail with no override raises the price — the engine never returns a
 * price below the floor by accident. A breached guardrail *with* an override leaves the
 * price alone but is still reported as `overridden`, so the UI keeps showing the warning
 * and the audit trail keeps the reason, the user and the timestamp.
 */
export function applyGuardrails(inputs: GuardrailInputs): GuardrailOutput {
  const overrideByCode = new Map(inputs.overrides.map((o) => [o.guardrail, o]));
  const requirements = buildRequirements(inputs);

  const applications: GuardrailApplication[] = [];
  let annual = inputs.quotedAnnualExTax;
  let oneOff = inputs.quotedOneOffExTax;
  let lowestAuthorised = ZERO;

  for (const requirement of requirements) {
    const isOneOff = requirement.appliesTo === 'one_off';
    const quoted = isOneOff ? inputs.quotedOneOffExTax : inputs.quotedAnnualExTax;
    const required = isOneOff
      ? dec(inputs.guardrails.minMobilisationCharge ?? '0')
      : requirement.requiredAnnual;

    if (!isOneOff) {
      lowestAuthorised = Decimal.max(lowestAuthorised, required);
    }

    if (quoted.gte(required)) {
      applications.push({
        guardrail: requirement.code,
        outcome: 'satisfied',
        requiredValue: requirement.requiredValue,
        actualValueBefore: requirement.actualValue,
        message: `${requirement.code} satisfied (${requirement.actualValue} against a floor of ${requirement.requiredValue}).`,
      });
      continue;
    }

    const override = overrideByCode.get(requirement.code);
    if (override) {
      applications.push({
        guardrail: requirement.code,
        outcome: 'overridden',
        requiredValue: requirement.requiredValue,
        actualValueBefore: requirement.actualValue,
        override,
        message: `${requirement.code} is BELOW the organisation floor of ${requirement.requiredValue} and was overridden by ${override.userId}: ${override.reason}`,
      });
      continue;
    }

    if (isOneOff) {
      oneOff = Decimal.max(oneOff, required);
    } else {
      annual = Decimal.max(annual, required);
    }
    applications.push({
      guardrail: requirement.code,
      outcome: 'enforced',
      requiredValue: requirement.requiredValue,
      actualValueBefore: requirement.actualValue,
      enforcedAnnualPrice: money(isOneOff ? oneOff : annual),
      message: `${requirement.code} was breached (${requirement.actualValue} against a floor of ${requirement.requiredValue}); the price was raised to meet it.`,
    });
  }

  return {
    annualExTax: annual,
    oneOffExTax: oneOff,
    applications,
    lowestAuthorisedAnnual: lowestAuthorised,
  };
}
