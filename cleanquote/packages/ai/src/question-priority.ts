import type { SuggestedQuestion } from '@cleanquote/types';

/**
 * Commercial question prioritisation.
 *
 * The product's whole claim is that an estimator answers few questions. That
 * only holds if the questions are ranked by what they actually move. A question
 * about labour hours changes the price directly; a question about the client's
 * preferred invoice format does not, and must never displace it.
 *
 * Deterministic and rule-based, not model-scored, so the ordering is stable
 * between runs and explainable when someone asks why they were asked something.
 */

export type ImpactArea =
  | 'labour_hours'
  | 'frequency'
  | 'equipment'
  | 'travel'
  | 'access'
  | 'compliance'
  | 'risk'
  | 'contingency'
  | 'minimum_charge'
  | 'margin'
  | 'scope';

/**
 * How much each area moves a quote, on the engine's own terms.
 *
 * Labour hours and frequency lead because they multiply through the entire cost
 * stack: hours feed on-costs, overhead recovery per hour, and every derived
 * recurring value. Margin sits lower because it is a decision, not an unknown.
 */
const AREA_WEIGHT: Record<ImpactArea, number> = {
  labour_hours: 10,
  frequency: 9.5,
  scope: 8.5,
  compliance: 8,
  access: 7,
  risk: 6.5,
  equipment: 5.5,
  minimum_charge: 5,
  contingency: 4.5,
  travel: 4,
  margin: 3.5,
};

const MATERIALITY_MULTIPLIER: Record<'low' | 'medium' | 'high', number> = {
  high: 1.6,
  medium: 1,
  low: 0.5,
};

/** The engine's coarse impact vocabulary mapped onto the finer scoring areas. */
const IMPACT_TO_AREA: Record<SuggestedQuestion['impact'], ImpactArea> = {
  price: 'labour_hours',
  scope: 'scope',
  risk: 'risk',
  compliance: 'compliance',
  schedule: 'frequency',
};

export interface ScoredQuestion {
  readonly question: string;
  readonly impactArea: ImpactArea;
  readonly materiality: 'low' | 'medium' | 'high';
  readonly priorityScore: number;
  readonly answerOptions?: readonly string[];
  /** Why this was asked, shown next to the question. */
  readonly rationale: string;
}

export interface ScoringContext {
  /** Nothing priced yet: scope questions matter more than margin questions. */
  readonly hasTasks: boolean;
  /** Areas came from capture rather than measurement. */
  readonly hasUnverifiedAreas: boolean;
  readonly quoteType: string;
}

export function scoreQuestion(
  question: SuggestedQuestion,
  context: ScoringContext,
): ScoredQuestion {
  const area = IMPACT_TO_AREA[question.impact];
  let score = AREA_WEIGHT[area] * MATERIALITY_MULTIPLIER[question.materiality];

  // Before anything is priced, a scope gap is worth more than a refinement.
  if (!context.hasTasks && (area === 'scope' || area === 'labour_hours')) {
    score *= 1.25;
  }
  // Unverified areas make anything touching hours more urgent.
  if (context.hasUnverifiedAreas && area === 'labour_hours') {
    score *= 1.2;
  }
  // High-access and controlled-environment work carries the risk that actually
  // bites on those job types.
  if (
    (context.quoteType === 'window_cleaning' || context.quoteType === 'industrial') &&
    (area === 'access' || area === 'risk')
  ) {
    score *= 1.3;
  }

  return {
    question: question.question,
    impactArea: area,
    materiality: question.materiality,
    priorityScore: Number(score.toFixed(2)),
    ...(question.answerOptions ? { answerOptions: question.answerOptions } : {}),
    rationale: rationaleFor(area, question.materiality),
  };
}

function rationaleFor(area: ImpactArea, materiality: 'low' | 'medium' | 'high'): string {
  const effect: Record<ImpactArea, string> = {
    labour_hours: 'changes the labour hours this quote is built on',
    frequency: 'changes how many times a year the work is performed',
    scope: 'changes what is included in the price',
    compliance: 'changes the procedures and training this site requires',
    access: 'changes how long the work takes and who can do it',
    risk: 'changes the contingency carried in the price',
    equipment: 'changes the machinery this site needs',
    minimum_charge: 'may put the job below a minimum charge',
    contingency: 'changes the buffer held for uncertainty',
    travel: 'changes travel and vehicle recovery',
    margin: 'changes the commercial position rather than the cost',
  };
  const weight = materiality === 'high' ? 'materially' : materiality === 'medium' ? '' : 'slightly';
  return `The answer ${weight} ${effect[area]}.`.replace('  ', ' ');
}

/**
 * Ranks questions and returns only the top few.
 *
 * Three is the default because the capture screen has to stay usable one-handed
 * on a phone while walking a building.
 */
export function prioritise(
  questions: readonly SuggestedQuestion[],
  context: ScoringContext,
  limit = 3,
): ScoredQuestion[] {
  return questions
    .map((question) => scoreQuestion(question, context))
    .sort((a, b) => b.priorityScore - a.priorityScore || a.question.localeCompare(b.question))
    .slice(0, limit);
}
