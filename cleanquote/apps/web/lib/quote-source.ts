import { calculateQuote } from '@cleanquote/pricing-engine';
import { SEED_CASES, seedCaseById, type SeedCase } from '@cleanquote/seed-cases';
import type { QuoteCalculationResult } from '@cleanquote/types';
import { publicEnv } from '@cleanquote/config';

/**
 * Where quotes come from.
 *
 * Two modes, and the application says out loud which one it is in:
 *
 *  - **Demonstration mode** (no Supabase configured): quotes come from the seed
 *    cases and are priced live by the real engine. Everything on screen is
 *    genuinely calculated; only the persistence is missing.
 *  - **Connected mode**: quotes are read from Postgres under RLS. The engine
 *    call is identical — that is the point of keeping it in a separate package.
 *
 * The seam lives here so no page component needs to know which mode it is in.
 */

export type SourceMode = 'demonstration' | 'connected';

export function sourceMode(): SourceMode {
  const env = publicEnv();
  return env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? 'connected'
    : 'demonstration';
}

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

export async function listQuotes(): Promise<readonly QuoteSummary[]> {
  if (sourceMode() === 'connected') {
    // Connected mode reads through the Supabase client with the caller's session,
    // so RLS decides what comes back. Implemented alongside authentication; see
    // docs/ROADMAP.md for the current status.
    throw new Error(
      'Connected mode is configured but the Supabase quote repository is not implemented yet. Unset NEXT_PUBLIC_SUPABASE_URL to use demonstration mode.',
    );
  }
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
