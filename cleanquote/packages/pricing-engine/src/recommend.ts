import type { ScenarioKey, ScenarioResult, StrategicContext } from '@cleanquote/types';

/**
 * Scenario recommendation.
 *
 * This is deliberately deterministic and rule-based rather than model-generated: the
 * recommendation influences a commercial decision, so it has to be reproducible and
 * explainable. The AI layer may *narrate* the reasons produced here, but it does not
 * pick the scenario and it never touches the arithmetic.
 *
 * Every signal is organisation-owned or estimator-supplied. Nothing derives from another
 * organisation's pricing.
 */

interface Signal {
  readonly scenario: ScenarioKey;
  readonly weight: number;
  readonly reason: string;
}

const LOW_CONFIDENCE_THRESHOLD = 0.55;
const HIGH_CONFIDENCE_THRESHOLD = 0.78;

export interface Recommendation {
  readonly key: ScenarioKey;
  readonly reasons: readonly string[];
}

export function recommendScenario(
  scenarios: readonly ScenarioResult[],
  context: StrategicContext | undefined,
): Recommendation {
  const available = new Set(scenarios.map((s) => s.key));
  const signals: Signal[] = [
    {
      scenario: 'balanced',
      weight: 1,
      reason: 'Balanced is the default position unless the evidence points elsewhere.',
    },
  ];

  const balanced = scenarios.find((s) => s.key === 'balanced') ?? scenarios[0];
  if (balanced) {
    // A missing completeness signal means "not yet assessable", not "poor data". Reading
    // it as low confidence would push every quote to the premium strategy purely because
    // the capture layer had not reported yet.
    if (balanced.confidenceBasis === 'unknown') {
      signals.push({
        scenario: 'balanced',
        weight: 0.5,
        reason:
          'No capture-completeness signal was supplied, so the recommendation rests on the commercial context alone.',
      });
    } else if (balanced.confidence < LOW_CONFIDENCE_THRESHOLD) {
      signals.push({
        scenario: 'premium',
        weight: 2.5,
        reason: `Input confidence is ${(balanced.confidence * 100).toFixed(0)}%, so the quote carries meaningful estimation risk that a buffer should absorb.`,
      });
    } else if (balanced.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
      signals.push({
        scenario: 'aggressive',
        weight: 1,
        reason: `Input confidence is ${(balanced.confidence * 100).toFixed(0)}%, so lean assumptions are defensible.`,
      });
    }

    const enforced = balanced.guardrails.filter((g) => g.outcome === 'enforced');
    if (enforced.length > 0) {
      signals.push({
        scenario: 'premium',
        weight: 1.5,
        reason: `The balanced scenario already had to be lifted to meet ${enforced.length} commercial floor(s), so there is no room to bid lower.`,
      });
    }
  }

  const c = context ?? {};

  if (c.priceSensitivity === 'high') {
    signals.push({
      scenario: 'aggressive',
      weight: 2,
      reason: 'The buyer is understood to be highly price-driven.',
    });
  } else if (c.priceSensitivity === 'low') {
    signals.push({
      scenario: 'premium',
      weight: 1.5,
      reason:
        'The buyer is not primarily price-driven, so service depth is worth more than a lower number.',
    });
  }

  if (c.salesStage === 'final_negotiation' && c.priceSensitivity !== 'low') {
    signals.push({
      scenario: 'aggressive',
      weight: 1.5,
      reason: 'The opportunity is at final negotiation, where price movement decides the outcome.',
    });
  }

  if (c.incumbentDissatisfaction === 'high') {
    signals.push({
      scenario: 'balanced',
      weight: 1.5,
      reason:
        'The client is dissatisfied with the incumbent, so the decision is unlikely to hinge on price alone.',
    });
  }

  if (c.relationshipStrength === 'strong') {
    signals.push({
      scenario: 'balanced',
      weight: 1,
      reason: 'An established relationship reduces the need to buy the work.',
    });
  }

  if (c.routeDensity === 'clustered') {
    signals.push({
      scenario: 'aggressive',
      weight: 1.5,
      reason:
        'The site sits inside an existing cleaning round, so marginal delivery cost is genuinely lower.',
    });
  } else if (c.routeDensity === 'isolated') {
    signals.push({
      scenario: 'premium',
      weight: 1.5,
      reason:
        'The site is geographically isolated, which raises travel, relief and supervision exposure.',
    });
  }

  if (c.labourAvailability === 'scarce') {
    signals.push({
      scenario: 'premium',
      weight: 2,
      reason:
        'Labour is scarce in this area, so staffing the contract reliably will cost more than the benchmark.',
    });
  } else if (c.labourAvailability === 'plentiful') {
    signals.push({
      scenario: 'aggressive',
      weight: 0.75,
      reason: 'Labour is readily available in this area.',
    });
  }

  if (c.capacityAvailable === 'spare') {
    signals.push({
      scenario: 'aggressive',
      weight: 1,
      reason: 'There is spare operational capacity to absorb the contract.',
    });
  } else if (c.capacityAvailable === 'stretched') {
    signals.push({
      scenario: 'premium',
      weight: 1.5,
      reason:
        'Operations are already stretched, so this work should only be taken on at a healthy margin.',
    });
  }

  if (c.contractAttractiveness === 'high') {
    signals.push({
      scenario: 'aggressive',
      weight: 1.25,
      reason: 'The contract is strategically attractive and worth competing hard for.',
    });
  } else if (c.contractAttractiveness === 'low') {
    signals.push({
      scenario: 'premium',
      weight: 1.25,
      reason:
        'The contract is not strategically attractive, so it is only worth winning at a strong margin.',
    });
  }

  if (c.crossSellPotential === 'high') {
    signals.push({
      scenario: 'aggressive',
      weight: 1,
      reason: 'There is strong potential to expand into additional services once established.',
    });
  }

  if (c.historicalWinRatePct !== undefined) {
    const winRate = Number(c.historicalWinRatePct);
    if (Number.isFinite(winRate)) {
      if (winRate < 20) {
        signals.push({
          scenario: 'aggressive',
          weight: 1.5,
          reason: `The organisation's win rate on comparable work is ${winRate}%, which suggests current pricing is landing high.`,
        });
      } else if (winRate > 55) {
        signals.push({
          scenario: 'premium',
          weight: 1.25,
          reason: `The organisation's win rate on comparable work is ${winRate}%, which suggests there is room to price higher.`,
        });
      }
    }
  }

  const totals = new Map<ScenarioKey, number>();
  for (const signal of signals) {
    if (!available.has(signal.scenario)) continue;
    totals.set(signal.scenario, (totals.get(signal.scenario) ?? 0) + signal.weight);
  }

  let winner: ScenarioKey = balanced?.key ?? 'balanced';
  let best = -Infinity;
  // Iterate in a fixed order so ties resolve deterministically.
  for (const key of ['balanced', 'premium', 'aggressive'] as const) {
    const score = totals.get(key) ?? -Infinity;
    if (score > best) {
      best = score;
      winner = key;
    }
  }

  const reasons = signals.filter((s) => s.scenario === winner).map((s) => s.reason);
  const counterPoints = signals
    .filter((s) => s.scenario !== winner && s.weight >= 1.5)
    .map((s) => `Considered but outweighed: ${s.reason}`);

  return { key: winner, reasons: [...reasons, ...counterPoints] };
}
