# CleanQuote AI — project context

Commercial cleaning quotation platform. Monorepo under `cleanquote/` (the repository root
hosts an unrelated static site, which must keep deploying untouched).

## Commands

```bash
pnpm run verify                  # format, lint, typecheck, tests — run before committing
pnpm run test:coverage           # coverage thresholds: 80% lines, 75% branches
./supabase/test/run-db-tests.sh  # migrations + 41 RLS assertions against real Postgres
pnpm --filter @cleanquote/web run dev
```

## Rules that are not negotiable

**No language model produces a price.** The AI extracts, classifies, questions and drafts.
Every number a client sees comes from `@cleanquote/pricing-engine`. If a change would put
arithmetic in a prompt, it is the wrong change.

**Money is a decimal string, everywhere.** Never `number`, never `parseFloat` into the data
flow. Formatting for display is the only place a monetary value becomes a number, and it
does not travel back.

**Monthly value is annual ÷ 12.** Never weekly × 4. There is a test.

**Nothing the AI infers is presented as fact.** Asset counts are `visibleQuantity`.
Compliance findings carry `requiresHumanReview: true`. The schemas enforce both.

**RLS is enabled _and_ forced on every tenant table**, and every UPDATE policy carries both
`USING` and `WITH CHECK`. Adding a table means adding its policies _and_ an explicit grant
— the grant in the final RLS migration is a snapshot, not a rule.

**A guardrail override never silences the warning.** It records reason, user and timestamp
and the result still reports the guardrail as breached.

## Where things live

```
packages/pricing-engine   the commercial core — pure, decimal-safe, versioned
packages/types            domain contracts; conventions documented at the top of pricing.ts
packages/validation       Zod schemas for every boundary, including model output
packages/seed-cases       five realistic quotes: seed data and regression corpus
packages/config           typed env; serverEnv() throws in a browser bundle
apps/web                  Next.js; server components, no client state yet
supabase/migrations       forward-only, filename order
supabase/test             executable security suite
```

## Conventions

- Field ending `Pct` is a percent as a decimal string: `"12.5"` means 12.5%.
- Factors default to 1. A factor of 0 would erase the labour and is rejected by validation.
- Quantities, hours and factors are plain numbers (they come from measurements). Money and
  percentages are strings.
- Tests live in `packages/<pkg>/test/`, mirroring source, fixtures in `test/helpers/`.
- Test names state the behaviour: `derives monthly value from the annual value, never from
weekly x 4`.
- Hand-check arithmetic in tests and assert the exact string. `toBeGreaterThan(0)` on a
  price proves nothing.

## Things that have already bitten

- **An UPDATE with no matching RLS policy affects zero rows rather than erroring.** "No
  error" is not evidence of protection. Assert the data did not move, and test the trigger
  layer separately with a role that bypasses RLS.
- **Risk contingency must follow the work it belongs to.** Loading a one-off job's risk
  onto the recurring side invents an annual contract value the client never agreed to.
- **A cost figure that excludes a loading the price includes** overstates margin. Recurring
  and one-off cost reporting must be symmetric.
- **Absent evidence is not negative evidence.** A missing capture-completeness signal
  reports `confidenceBasis: 'unknown'`; scoring it as low confidence pushed every quote to
  the premium strategy.
- **Next's bundler cannot resolve `.js` extensions in TypeScript source imports.** Workspace
  packages use extensionless relative imports.

## Status

222 unit tests, 41 database security assertions. The engine, schema, validation and
scenario-comparison UI are built. Authentication, capture, AI, proposals, mobile and
billing are not — see `docs/ROADMAP.md`, which is kept honest.
