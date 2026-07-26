import type { DataCompleteness } from '@cleanquote/types';

import type { Decimal } from './decimal';

const BASE_CONFIDENCE = 0.45;
const MEASUREMENT_WEIGHT = 0.2;
const AI_CONFIRMATION_WEIGHT = 0.15;
const WALKTHROUGH_WEIGHT = 0.1;
const MISSING_INFO_PENALTY_PER_ITEM = 0.02;
const MAX_MISSING_INFO_PENALTY = 0.2;
const MAX_RISK_PENALTY = 0.15;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Confidence describes how much the *inputs* can be trusted, not how attractive the
 * price is. A cheap quote built from guesses scores low; an expensive quote built from
 * verified measurements scores high.
 */
export function computeConfidence(
  completeness: DataCompleteness | undefined,
  riskExposureRatio: Decimal,
): number {
  const c = completeness ?? {
    measurementVerifiedRatio: 0,
    aiFactsConfirmedRatio: 0,
    missingInformationCount: 0,
    walkthroughCompleted: false,
  };

  let score = BASE_CONFIDENCE;
  score += MEASUREMENT_WEIGHT * clamp01(c.measurementVerifiedRatio);
  score += AI_CONFIRMATION_WEIGHT * clamp01(c.aiFactsConfirmedRatio);
  if (c.walkthroughCompleted) score += WALKTHROUGH_WEIGHT;

  score -= Math.min(
    MAX_MISSING_INFO_PENALTY,
    Math.max(0, c.missingInformationCount) * MISSING_INFO_PENALTY_PER_ITEM,
  );
  score -= Math.min(MAX_RISK_PENALTY, Math.max(0, riskExposureRatio.toNumber()));

  return Number(clamp01(score).toFixed(4));
}
