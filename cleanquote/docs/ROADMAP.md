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
| Registration, email confirmation, sessions, password reset                               | Integration-tested against real policies                  |
| Invitations, seven roles, permission and cost/profit visibility separation               | Six isolation properties asserted end to end              |
| Company onboarding with source and confirmation recorded per starter value               | Provenance wording asserted, including "not benchmarks"   |
| Clients, sites, opportunities with timestamped stage events                              | Integration-tested                                        |
| Quote workspace: fifteen tabs over one server-side read                                  | Builds; every panel reads the stored snapshot             |
| Photo capture: browser compression, dedupe on retry, expiring links, audited deletion    | 18 storage unit tests + 9 integration tests               |
| AI extraction, suggestion review queue, question ranking                                 | Nothing reaches a quote before a human confirms it        |
| Approval bound to a calculation hash, invalidated by a database trigger                  | Asserted at the trigger layer                             |
| Branded proposal: secure link, web view and generated PDF                                | 19 PDF tests; rendered in Chromium, not only asserted on  |
| Client acceptance, decline and revision requests                                         | Acceptance moves quote and opportunity in one transaction |
| Rate limiting on sign-in, reset, AI, uploads and the public proposal                     | Six unit tests; per-process, documented as such           |
| CI: format, lint, types, tests, coverage, web build, database security, dependency audit | `.github/workflows/cleanquote-ci.yml`                     |

**Total: 313 unit and integration tests, and 41 database security assertions, passing.**

## Not built

Stated plainly. None of the following exists beyond types, schema or documented seams.

- **AR measurement** (RoomPlan, ARKit, ARCore) and its manual fallbacks. Deliberately
  deferred; areas are entered manually and marked estimated until measured.
- **Native app** (Expo). The web app is installable and sized for a phone, which covers
  capture; it is not a native app and does not claim to be.
- **True offline capture.** The service worker caches the shell only. Queued uploads and
  conflict resolution are unbuilt, and the offline page says so. This is the single
  largest gap between what the product does and what a walkthrough in a basement needs.
- **Tender document intelligence.** Reading an RFT and pre-filling a quote from it.
- **E-signature.** Acceptance records a typed name, an IP and a timestamp. That is a
  contemporaneous record, not a qualified electronic signature.
- **Stripe billing and entitlement enforcement.**
- **Analytics and actual-versus-quoted learning.**
- **Admin platform.**
- **Voice capture.** The capture screen takes typed notes; dictation is the phone's, not
  the product's.
- **MFA and a real breach-corpus password check.**
- **Distributed rate limiting.** Per-process today; see [DEPLOYMENT.md](DEPLOYMENT.md).

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
