# Testing

**313 unit and integration tests, 41 database security assertions.** `pnpm run verify`
runs format, lint, types and tests; `./supabase/test/run-db-tests.sh` runs the security
suite against a real PostgreSQL.

```bash
pnpm run verify                  # format, lint, typecheck, unit tests
pnpm run test:coverage           # with thresholds
./supabase/test/run-db-tests.sh  # migrations + row level security
```

## What is covered

| Suite                       |   Count | What it establishes                                                         |
| --------------------------- | ------: | --------------------------------------------------------------------------- |
| `pricing-engine/schedule`   |      21 | Annualisation, public holidays, invalid schedules                           |
| `pricing-engine/labour`     |      20 | Production rates, on-cost cascade, absence allowance, fixed-cost allocation |
| `pricing-engine/costs`      |      18 | Cost annualisation, overhead methods, decimal safety                        |
| `pricing-engine/solver`     |      11 | Closed-form price, margin vs markup, revenue-overhead by substitution       |
| `pricing-engine/guardrails` |      13 | Each floor, strictest-wins, override behaviour                              |
| `pricing-engine/engine`     |      39 | End-to-end pricing, contingency allocation, whole-of-deal margin            |
| `pricing-engine/recommend`  |      16 | Scenario recommendation, determinism, confidence scoring                    |
| `validation/pricing`        |      19 | Input rejection at the boundary                                             |
| `validation/ai`             |      13 | AI-output rejection, including overstatement attempts                       |
| `seed-cases`                |      54 | Five realistic quotes end to end                                            |
| **Unit total**              | **222** |                                                                             |
| `supabase/test`             |      41 | Cross-tenant isolation against real PostgreSQL                              |

Coverage thresholds are enforced in CI: 80% lines/functions/statements, 75% branches.
Current engine coverage sits above 90% statements.

## How tests are written here

**Behaviour, not implementation.** Assertions target the output of a public function. The
engine's internals were restructured twice during development — contingency allocation and
one-off cost reporting both changed — and the behavioural tests caught the regressions
without needing to be rewritten.

**One behaviour per test, with a name that states it.** `derives monthly value from the
annual value, never from weekly x 4` says what breaks if it fails.

**Hand-checked arithmetic.** The core fixture is deliberately boring — 52 whole weeks, a
$30 rate, no on-costs — so expectations can be computed by hand and stated exactly:
`expect(s.price.annualExTax).toBe('20800.00')`. A test that only asserts "is a number"
proves nothing.

**Assertions on the values that would actually go wrong.** The monthly-value test asserts
both the correct figure _and_ that it is not the naive weekly × 4 answer.

## The database security suite

`run-db-tests.sh` applies every migration unmodified to a throwaway PostgreSQL 16 database
and runs assertions as the real `authenticated` and `anon` roles with real JWT claims. A
small shim (`00_supabase_shim.sql`) stands up `auth.users`, `auth.uid()` and `storage.*` —
the parts Supabase provides — so the policies under test are the ones that ship. The shim
is never applied to a Supabase project.

Two tenants are seeded with deliberately overlapping data shapes, so a leak in either
direction is detectable rather than hidden by asymmetry.

One thing this suite taught us, worth repeating: **an UPDATE with no matching policy
affects zero rows rather than raising an error.** An early version asserted that a tenant
user's UPDATE on a snapshot _errored_, and it did not. "No error" was not evidence of
anything. The tests now assert the RLS layer by checking the data did not move, and assert
the trigger layer separately with a role that bypasses RLS.

## What is not tested

Stated rather than implied:

- **No end-to-end browser tests.** The web app is verified by build, typecheck and manual
  inspection of rendered output. Playwright coverage of the critical flows belongs with
  the authentication phase, when there are flows worth driving.
- **No component tests.** The UI is server-rendered with no client state; the logic worth
  testing lives in the engine and is tested there. This stops being true the moment
  interactive editing lands.
- **No load or performance testing.**
- **No adversarial security review.** The RLS suite proves the properties it asserts. It
  is not a penetration test.
- **Mobile, AR, AI and billing are untested because they are unbuilt.** Their contracts and
  schemas are tested; their implementations do not exist.

## Adding a test

Mirror the source layout: `packages/<pkg>/test/<module>.test.ts`, shared fixtures in
`test/helpers/`. Prefer `it.each` over copy-paste. If a bug is found, add the regression
test at the layer where the defect lived — both engine fixes in this codebase carry direct
unit tests, not only the seed-case assertions that surfaced them.

## The integration suite

`packages/workflow/test/mvp-workflow.test.ts` boots a throwaway PostgreSQL cluster, applies
every migration in order, and walks the whole commercial workflow through the same
functions the web application calls. A passing run is evidence about shipped code rather
than about a harness. It skips itself, loudly, when no PostgreSQL binary is present.

What it proves, beyond the happy path:

| Property                                                               | Why it is tested here rather than in a unit test          |
| ---------------------------------------------------------------------- | --------------------------------------------------------- |
| An unauthenticated caller sees no tenant data                          | Only a real policy can demonstrate this                   |
| A member of one organisation cannot see another's, in both directions  | Isolation has to hold symmetrically                       |
| A read-only user cannot edit a quote                                   | The refusal comes from the database, not the UI           |
| An estimator cannot override a protected margin                        | Permission separation, at the layer that enforces it      |
| An owner can invite; the invitation is refused for a different account | Token binding                                             |
| A suspended member loses access immediately                            | Membership is re-checked per request                      |
| AI extraction touches nothing until confirmed                          | The central product claim                                 |
| A confirmed AI area still reads `estimated`                            | The distinction survives confirmation                     |
| Recalculating invalidates an approval                                  | Trigger behaviour, not application behaviour              |
| A proposal document contains no internal figure                        | Asserted by absence of each term in the serialised output |
| A proposal token is stored hashed, and guesses resolve to nothing      | The link is the whole authorisation                       |
| Acceptance moves quote and opportunity together                        | One transaction, or the pipeline misreports               |
| A photo is isolated by organisation and its deletion is audited        | Media carries the same tenancy rules as everything else   |

## Coverage

Thresholds: 80% lines, 75% branches, 80% functions, 80% statements. Current: **91.0%
lines, 86.9% branches**.

`packages/database`, `packages/workflow`, `packages/email` and `auth/src/service.ts` are
excluded from the coverage report and covered by the integration suite instead. Counting
them twice would report a number that flatters the unit tests; excluding them without
saying so would hide what covers them. They are covered — by a suite that runs real SQL
against real policies, which is the only way those files can be meaningfully tested.

## What is not tested

- **No browser test exists.** Every screen has been type-checked and built; none has been
  driven by a headless browser. The forms, the tab navigation and the upload retry path are
  unproven in a real browser.
- **The S3 storage adapter is untested against a live endpoint.** Its SigV4 signing is
  hand-written and exercised only by the local adapter's shared interface.
- **The Anthropic provider is untested against the live API.** The mock provider is held to
  the same schema, which proves the contract but not the prompt.
- **No load or soak testing.** The rate limiter's behaviour under real concurrency is
  unmeasured.
