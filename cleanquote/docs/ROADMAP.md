# Roadmap

An honest account of what exists, what does not, and the order the rest should be built.

## Built and verified

| Area                                                                                     | Evidence                                                  |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Deterministic pricing engine                                                             | 134 unit tests; 90%+ statement coverage on engine sources |
| Domain types                                                                             | Compiles under `strict` with `noUncheckedIndexedAccess`   |
| Boundary validation (Zod)                                                                | 32 tests, including AI-output rejection cases             |
| Multi-tenant schema + RLS                                                                | 41 assertions against a real PostgreSQL 16                |
| Immutability of snapshots, audit and sent versions                                       | Tested at both the RLS and trigger layers                 |
| Five demonstration cases                                                                 | 54 assertions; found two real engine defects              |
| Web app: scenario comparison, cost transparency, guardrails, negotiation range           | Builds and runs; renders live-calculated figures          |
| CI: format, lint, types, tests, coverage, web build, database security, dependency audit | `.github/workflows/cleanquote-ci.yml`                     |

**Total: 222 unit tests and 41 database security assertions passing.**

## Not built

Stated plainly. None of the following exists beyond types, schema or documented seams.

- Authentication and sign-in
- Organisation onboarding and the configuration wizard
- Mobile capture app (Expo): camera, voice notes, observations, offline queue
- AR measurement (RoomPlan, ARKit, ARCore) and its manual fallbacks
- AI copilot: extraction, questioning, photo analysis
- Tender document intelligence
- Proposal generation and PDF output
- Client portal and e-signature
- Approval workflow UI
- Stripe billing and entitlement enforcement
- Analytics and actual-versus-quoted learning
- Admin platform
- Rate limiting

## Build order

The sequencing is driven by what each phase unblocks, and by the stated priority order:
data integrity, tenant security, pricing accuracy, low-input experience, offline capture,
AI validation, proposal quality, analytics.

### 1 — Authentication and onboarding

Nothing multi-user works without it, and every subsequent phase needs a real session to
exercise the policies that are already written and tested.

- Supabase Auth wiring, session handling, protected routes
- The organisation-creation function (deliberately not an RLS INSERT policy: creating a
  tenant and its first membership must be one atomic act)
- Onboarding wizard over `STARTER_*` defaults, with every assumption visible and editable
- Replace the demonstration data source with the Supabase repository behind the seam that
  already exists in `apps/web/lib/quote-source.ts`

### 2 — Quote editing on the web

Makes the engine usable by a human rather than only by a fixture.

- Rate-card management, benchmark library
- Spaces, assets, labour lines, cost lines, risks
- Live recalculation, scenario selection, guardrail override flow with its audit record
- Approval workflow UI over the tables that already exist

### 3 — Proposal generation

The point at which the product produces something a client receives.

- Template rendering, PDF output, branded documents
- Version sealing on send (the trigger is in place; the flow is not)
- Public proposal page over `get_public_proposal`, which is already written and tested
- View and acceptance tracking

### 4 — Mobile capture

The product's actual differentiator, and the largest single phase.

- Expo development build, camera, voice notes, photo annotation
- Offline-first local persistence and a background upload queue with visible sync state
- Observation capture, including the complete/partial observation window
- Bulk edit across spaces

### 5 — AI copilot

Deliberately after capture: extraction needs something to extract from, and the validation
schemas need real captured data to be judged against.

- Server-side Anthropic integration behind the provider abstraction
- Structured extraction against `walkthroughExtractionSchema`
- Confirm / correct / skip / mark-as-assumption flow
- Run logging, cost control, per-organisation budgets
- Rate limiting — required before this ships, not after

### 6 — AR measurement

- Typed measurement abstraction (already defined in `packages/types`)
- iOS RoomPlan and ARKit modules; Android ARCore
- Manual fallback on every device, device capability matrix
- Verification requirement before a high-value quote is released

### 7 — Tender intelligence

- Document upload and extraction with page-level provenance
- Requirements matrix, scope-gap analysis, clarification drafting

### 8 — Billing and entitlements

- Stripe subscriptions, webhooks, customer portal
- Server-side entitlement enforcement against `plan_limits` and
  `organisation_entitlements`
- Usage metering into `usage_events`

### 9 — Analytics and learning

- Outcome tracking, win-rate analysis, quoted-versus-actual
- Benchmark suggestions requiring explicit approval before they affect pricing

### 10 — Enterprise

- Branch and franchise controls over the `parent_organisation_id` structure
- SSO, public API, webhooks, white labelling

## Known technical risks

- **Seed figures are illustrative.** The demonstration cases use plausible but invented
  rates and production benchmarks. They are not market data and must not be presented as
  such. A real deployment needs the organisation's own numbers.
- **The RLS test suite proves the properties it asserts.** It is not an adversarial review
  and does not replace penetration testing.
- **Workspace packages ship TypeScript source** rather than build output. This keeps one
  build step out of the loop and works for the current consumers (Next.js, Vitest), but a
  future plain-Node consumer would need a real build.
- **`percent_of_revenue` overhead plus a high target margin can exceed 100% of revenue.**
  The engine raises rather than returning a plausible number, and validation rejects a
  revenue overhead of 100% or more, but an organisation can still configure a combination
  with no finite solution. The error message says so.
- **Calendar assumptions materially change annual value.** Defaults use the true mean
  Gregorian year; an organisation billing on a 52-week assumption must configure it.
