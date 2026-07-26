# CleanQuote AI

A quotation intelligence platform for commercial cleaning contractors: capture a site,
price it against a defensible cost model, compare pricing strategies, and issue a
proposal — without the spreadsheet, the memory and the guesswork.

The product name, branding, plan names and scenario labels are all configuration. Nothing
in the source hard-codes the working brand.

## What is built

| Area                                                          | Status                                              |
| ------------------------------------------------------------- | --------------------------------------------------- |
| Deterministic pricing engine                                  | Complete, 130+ unit tests                           |
| Domain types and boundary validation                          | Complete                                            |
| Multi-tenant schema with row level security                   | Complete, 41 executable security assertions         |
| Five demonstration cases                                      | Complete, used as seed data and a regression corpus |
| Web app: scenario comparison and cost transparency            | Working, runs without a database                    |
| Authentication, capture UI, AI copilot, proposals, mobile app | Not built — see [docs/ROADMAP.md](docs/ROADMAP.md)  |

[docs/ROADMAP.md](docs/ROADMAP.md) is an honest account of what exists and what does not.

## Quick start

```bash
pnpm install
pnpm run verify      # format, lint, typecheck, tests
pnpm --filter @cleanquote/web run dev
```

Open <http://localhost:3000>. With no environment configuration the app runs in
**demonstration mode**: quotes come from the seed cases and are priced live by the real
engine. The UI says so rather than pretending to be connected.

To run the database security suite (requires PostgreSQL 16 locally):

```bash
./supabase/test/run-db-tests.sh
```

It applies every migration to a throwaway database and asserts cross-tenant isolation.

## Configuration

Copy `.env.example` to `.env.local`. Every variable is optional; each absent one degrades
to a documented local mode rather than a crash. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
for activating Supabase, Anthropic and Stripe.

## How it fits together

```
apps/web                  Next.js app — scenario comparison, cost transparency
packages/pricing-engine   The commercial core. Pure, decimal-safe, versioned.
packages/types            Domain types shared by every surface
packages/validation       Zod schemas for every boundary, including AI output
packages/seed-cases       Five realistic quotes: seed data and regression corpus
packages/config           Typed environment configuration
supabase/migrations       Schema, RLS policies, immutability triggers
supabase/test             Executable security tests against real Postgres
```

The pricing engine is a separate package on purpose. A quotation is a commercial record
that has to be defensible months later, so the arithmetic lives in one pure, tested,
versioned place rather than scattered through UI components.

## The two rules that shape the product

**A language model never produces a price.** The AI extracts, classifies, questions and
drafts. Every number a client sees comes from the deterministic engine, and every model
output passes schema validation before it can influence anything.

**Nothing the AI infers is presented as fact.** An asset count from a photo is a _visible_
count, not a site total. A compliance finding is flagged for human review, not certified.
The schemas in `packages/validation` enforce both, so a model that tries to overstate
fails to parse.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system shape and the decisions behind it
- [docs/PRICING_ENGINE.md](docs/PRICING_ENGINE.md) — every formula, with worked examples
- [docs/SECURITY.md](docs/SECURITY.md) — the tenancy model and how it is tested
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md) — schema and the constraints that carry meaning
- [docs/AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md) — where the model is allowed to act
- [docs/TESTING.md](docs/TESTING.md) — what is covered and what is not
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — environments and activation steps
- [docs/ROADMAP.md](docs/ROADMAP.md) — what remains, in build order
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — dependencies and why each was chosen

## Licence

Proprietary. Third-party dependencies retain their own licences.
