import type { ScenarioResult, StrategicContext } from '@cleanquote/types';
import { describe, expect, it } from 'vitest';

import { computeConfidence } from '../src/confidence';
import { dec, ZERO } from '../src/decimal';
import { recommendScenario } from '../src/recommend';

/** Only the fields the recommender reads; the rest of ScenarioResult is irrelevant here. */
function stub(
  key: ScenarioResult['key'],
  confidence = 0.7,
  basis: ScenarioResult['confidenceBasis'] = 'measured',
  guardrails: ScenarioResult['guardrails'] = [],
): ScenarioResult {
  return { key, label: key, confidence, confidenceBasis: basis, guardrails } as ScenarioResult;
}

const THREE = [stub('aggressive'), stub('balanced'), stub('premium')];

describe('recommendScenario', () => {
  it('defaults to the balanced scenario with no strategic context', () => {
    expect(recommendScenario(THREE, undefined).key).toBe('balanced');
  });

  it('does not treat an absent completeness signal as low confidence', () => {
    const unknown = [
      stub('aggressive', 0.45, 'unknown'),
      stub('balanced', 0.45, 'unknown'),
      stub('premium', 0.45, 'unknown'),
    ];
    expect(recommendScenario(unknown, undefined).key).toBe('balanced');
  });

  it('moves to the premium scenario when measured confidence is low', () => {
    const low = [stub('aggressive', 0.4), stub('balanced', 0.4), stub('premium', 0.4)];
    expect(recommendScenario(low, undefined).key).toBe('premium');
  });

  it('moves to the aggressive scenario for a highly price-driven buyer at final negotiation', () => {
    const context: StrategicContext = {
      priceSensitivity: 'high',
      salesStage: 'final_negotiation',
      routeDensity: 'clustered',
    };
    expect(recommendScenario(THREE, context).key).toBe('aggressive');
  });

  it('protects margin when labour is scarce and the site is isolated', () => {
    const context: StrategicContext = {
      labourAvailability: 'scarce',
      routeDensity: 'isolated',
      capacityAvailable: 'stretched',
    };
    expect(recommendScenario(THREE, context).key).toBe('premium');
  });

  it('explains the recommendation it made', () => {
    const result = recommendScenario(THREE, {
      labourAvailability: 'scarce',
      routeDensity: 'isolated',
    });
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.join(' ')).toContain('Labour is scarce');
  });

  it('surfaces the significant signals it decided against', () => {
    const result = recommendScenario(THREE, {
      priceSensitivity: 'high',
      labourAvailability: 'scarce',
      routeDensity: 'isolated',
      capacityAvailable: 'stretched',
    });
    expect(result.reasons.some((r) => r.startsWith('Considered but outweighed'))).toBe(true);
  });

  it('reads a low historical win rate as a signal that pricing is landing high', () => {
    const result = recommendScenario(THREE, { historicalWinRatePct: '12' });
    expect(result.reasons.join(' ')).toContain('win rate');
  });

  it('never recommends a scenario the organisation has not configured', () => {
    const twoOnly = [stub('balanced'), stub('premium')];
    const result = recommendScenario(twoOnly, {
      priceSensitivity: 'high',
      salesStage: 'final_negotiation',
      routeDensity: 'clustered',
    });
    expect(result.key).not.toBe('aggressive');
  });

  it('resolves ties deterministically across repeated calls', () => {
    const keys = Array.from({ length: 10 }, () => recommendScenario(THREE, {}).key);
    expect(new Set(keys).size).toBe(1);
  });

  it('pushes towards premium when the balanced price already had to be lifted to a floor', () => {
    const lifted = [
      stub('aggressive'),
      stub('balanced', 0.7, 'measured', [
        {
          guardrail: 'min_gross_margin',
          outcome: 'enforced',
          requiredValue: '35%',
          actualValueBefore: '28%',
          message: 'enforced',
        },
      ]),
      stub('premium'),
    ];
    expect(recommendScenario(lifted, undefined).key).toBe('premium');
  });
});

describe('computeConfidence', () => {
  it('scores a fully verified, completed walkthrough highly', () => {
    const score = computeConfidence(
      {
        measurementVerifiedRatio: 1,
        aiFactsConfirmedRatio: 1,
        missingInformationCount: 0,
        walkthroughCompleted: true,
      },
      ZERO,
    );
    expect(score).toBe(0.9);
  });

  it('penalises unconfirmed AI facts and missing information', () => {
    const score = computeConfidence(
      {
        measurementVerifiedRatio: 0,
        aiFactsConfirmedRatio: 0,
        missingInformationCount: 5,
        walkthroughCompleted: false,
      },
      ZERO,
    );
    expect(score).toBe(0.35);
  });

  it('caps the missing-information penalty so one bad field cannot zero the score', () => {
    const score = computeConfidence(
      {
        measurementVerifiedRatio: 1,
        aiFactsConfirmedRatio: 1,
        missingInformationCount: 500,
        walkthroughCompleted: true,
      },
      ZERO,
    );
    expect(score).toBe(0.7);
  });

  it('reduces confidence as risk contingency grows relative to cost', () => {
    const low = computeConfidence(undefined, dec('0.01'));
    const high = computeConfidence(undefined, dec('0.5'));
    expect(high).toBeLessThan(low);
  });

  it('never returns a value outside 0 to 1', () => {
    const score = computeConfidence(
      {
        measurementVerifiedRatio: 99,
        aiFactsConfirmedRatio: 99,
        missingInformationCount: -5,
        walkthroughCompleted: true,
      },
      dec('-3'),
    );
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
