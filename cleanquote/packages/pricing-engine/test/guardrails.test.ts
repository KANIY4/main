import type { GuardrailOverride } from '@cleanquote/types';
import { describe, expect, it } from 'vitest';

import { dec, ZERO } from '../src/decimal.js';
import { applyGuardrails, type GuardrailInputs } from '../src/guardrails.js';

function inputs(overrides: Partial<GuardrailInputs> = {}): GuardrailInputs {
  return {
    guardrails: {},
    overrides: [],
    recurringCostBase: dec('15600'),
    directRecurringCost: dec('15600'),
    revenueOverheadRate: ZERO,
    recurringPaidHours: dec('520'),
    occurrencesPerYear: dec('260'),
    quotedAnnualExTax: dec('20800'),
    quotedOneOffExTax: ZERO,
    ...overrides,
  };
}

const OVERRIDE: GuardrailOverride = {
  guardrail: 'min_gross_margin',
  reason: 'Strategic entry into a target logistics precinct, approved by the director.',
  userId: 'user-123',
  at: '2026-07-26T09:00:00.000Z',
  approvedByUserId: 'user-001',
};

describe('applyGuardrails', () => {
  it('reports a guardrail as satisfied without changing the price', () => {
    const result = applyGuardrails(inputs({ guardrails: { minGrossMarginPct: '20' } }));
    expect(result.annualExTax.toString()).toBe('20800');
    expect(result.applications[0]?.outcome).toBe('satisfied');
  });

  it('raises the price when the minimum gross margin is breached', () => {
    // A 40% floor on a 15,600 cost base requires 26,000.
    const result = applyGuardrails(inputs({ guardrails: { minGrossMarginPct: '40' } }));
    expect(result.annualExTax.toString()).toBe('26000');
    expect(result.applications[0]?.outcome).toBe('enforced');
  });

  it('leaves the price alone when the breach carries an override', () => {
    const result = applyGuardrails(
      inputs({ guardrails: { minGrossMarginPct: '40' }, overrides: [OVERRIDE] }),
    );
    expect(result.annualExTax.toString()).toBe('20800');
    expect(result.applications[0]?.outcome).toBe('overridden');
  });

  it('keeps reporting an overridden guardrail as breached so the warning stays visible', () => {
    const result = applyGuardrails(
      inputs({ guardrails: { minGrossMarginPct: '40' }, overrides: [OVERRIDE] }),
    );
    const application = result.applications[0];
    expect(application?.message).toContain('BELOW the organisation floor');
    expect(application?.override?.reason).toBe(OVERRIDE.reason);
    expect(application?.override?.userId).toBe('user-123');
    expect(application?.override?.at).toBe('2026-07-26T09:00:00.000Z');
  });

  it('enforces a minimum recovery per paid labour hour', () => {
    const result = applyGuardrails(inputs({ guardrails: { minHourlyRecovery: '45' } }));
    expect(result.annualExTax.toString()).toBe('23400');
  });

  it('enforces a minimum charge per visit', () => {
    const result = applyGuardrails(inputs({ guardrails: { minChargePerVisit: '90' } }));
    expect(result.annualExTax.toString()).toBe('23400');
  });

  it('enforces a minimum annual contract value', () => {
    const result = applyGuardrails(inputs({ guardrails: { minAnnualContractValue: '30000' } }));
    expect(result.annualExTax.toString()).toBe('30000');
  });

  it('enforces a minimum contribution margin against direct cost only', () => {
    // Direct cost 15,600 at a 40% contribution floor requires 26,000.
    const result = applyGuardrails(
      inputs({
        guardrails: { minContributionMarginPct: '40' },
        recurringCostBase: dec('18000'),
        directRecurringCost: dec('15600'),
      }),
    );
    expect(result.annualExTax.toString()).toBe('26000');
  });

  it('applies the strictest guardrail when several are breached', () => {
    const result = applyGuardrails(
      inputs({
        guardrails: {
          minGrossMarginPct: '40',
          minHourlyRecovery: '60',
          minAnnualContractValue: '25000',
        },
      }),
    );
    // 60/hour x 520 hours = 31,200 is the binding constraint.
    expect(result.annualExTax.toString()).toBe('31200');
  });

  it('enforces the mobilisation floor against the one-off price, not the annual price', () => {
    const result = applyGuardrails(
      inputs({ guardrails: { minMobilisationCharge: '750' }, quotedOneOffExTax: dec('400') }),
    );
    expect(result.oneOffExTax.toString()).toBe('750');
    expect(result.annualExTax.toString()).toBe('20800');
  });

  it('accounts for revenue-based overhead when computing the margin floor', () => {
    const result = applyGuardrails(
      inputs({ guardrails: { minGrossMarginPct: '30' }, revenueOverheadRate: dec('0.1') }),
    );
    // 15,600 / (1 - 0.30 - 0.10) = 26,000.
    expect(result.annualExTax.toString()).toBe('26000');
  });

  it('reports the binding floor as the lowest authorised price for negotiation', () => {
    const result = applyGuardrails(
      inputs({ guardrails: { minGrossMarginPct: '20', minHourlyRecovery: '35' } }),
    );
    // 15,600 / 0.8 = 19,500 beats 35 x 520 = 18,200.
    expect(result.lowestAuthorisedAnnual.toString()).toBe('19500');
    expect(result.annualExTax.toString()).toBe('20800');
  });

  it('records no applications when the organisation has set no guardrails', () => {
    const result = applyGuardrails(inputs());
    expect(result.applications).toHaveLength(0);
    expect(result.lowestAuthorisedAnnual.toString()).toBe('0');
  });
});
