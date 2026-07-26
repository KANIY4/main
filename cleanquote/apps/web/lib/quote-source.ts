import { calculateQuote } from '@cleanquote/pricing-engine';
import { SEED_CASES, seedCaseById, type SeedCase } from '@cleanquote/seed-cases';
import type { QuoteCalculationResult } from '@cleanquote/types';

/**
 * Where quotes come from.
 *
 * The demonstration cases at /demo are priced by the same engine as a real
 * quote — the only difference is that they are never persisted. They exist so
 * the commercial model can be inspected and regression-tested without an
 * account, and they are labelled as examples wherever they appear.
 */

export interface QuoteSummary {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly currency: string;
  readonly exercises: readonly string[];
}

export interface PricedQuote {
  readonly summary: QuoteSummary;
  readonly seedCase: SeedCase;
  readonly result: QuoteCalculationResult;
}

function toSummary(seedCase: SeedCase): QuoteSummary {
  return {
    id: seedCase.id,
    title: seedCase.title,
    summary: seedCase.summary,
    currency: seedCase.input.currency,
    exercises: seedCase.exercises,
  };
}

export async function listDemonstrationQuotes(): Promise<readonly QuoteSummary[]> {
  return SEED_CASES.map(toSummary);
}

export async function getPricedQuote(id: string): Promise<PricedQuote | undefined> {
  const seedCase = seedCaseById(id);
  if (!seedCase) return undefined;

  // The same pure function that runs server-side in production. No branch here
  // produces a different price.
  const result = calculateQuote(seedCase.input);
  return { summary: toSummary(seedCase), seedCase, result };
}
