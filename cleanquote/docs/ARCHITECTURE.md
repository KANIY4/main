# Architecture

## Shape

```mermaid
graph TB
  subgraph Clients
    Mobile["Mobile app (not built)<br/>Expo · capture · offline · AR"]
    Web["apps/web<br/>Next.js · scenario comparison"]
    Portal["Client portal (not built)<br/>public proposal link"]
  end

  subgraph Shared["packages/ — shared, testable, portable"]
    Types["@cleanquote/types<br/>domain contracts"]
    Validation["@cleanquote/validation<br/>Zod schemas, every boundary"]
    Engine["@cleanquote/pricing-engine<br/>deterministic · decimal-safe · versioned"]
    Seeds["@cleanquote/seed-cases<br/>fixtures + regression corpus"]
    Config["@cleanquote/config<br/>typed environment"]
  end

  subgraph Backend["Supabase"]
    PG[("PostgreSQL<br/>RLS forced on every tenant table")]
    Auth["Auth"]
    Storage["Storage<br/>org-prefixed paths"]
    Fn["Edge functions<br/>AI · billing · audit"]
  end

  AI["Anthropic API<br/>server-side only"]
  Stripe["Stripe Billing"]

  Mobile --> Engine
  Web --> Engine
  Engine --> Types
  Validation --> Types
  Seeds --> Engine
  Web --> PG
  Mobile --> PG
  Portal -.->|"get_public_proposal(token)"| PG
  Fn --> AI
  Fn --> PG
  Fn --> Stripe
  PG --- Auth
  PG --- Storage
```

## The decisions that matter

### The pricing engine is a package, not application code

A quotation is a commercial record that must be defensible months after it is issued.
Keeping the arithmetic in one pure, versioned, heavily tested package means a price can be
reproduced exactly, and that the mobile app, the web app and any future server function
cannot drift from each other. It also means the engine is portable: nothing in it knows
about Supabase, React or HTTP.

### The AI never produces a price

The model extracts, classifies, questions, identifies risk and drafts prose. The
deterministic engine produces every number a client sees. This is not caution for its own
sake — an unexplainable price is a commercial liability, and a model that is asked to do
arithmetic will occasionally be confidently wrong in a way no test can catch.

See [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md).

### Provenance travels with every fact

Nothing captured is stored as a bare value. `evidence_source`, `verification_status` and
`ai_confidence` accompany spaces, assets, observations and measurements, so the review
screen can distinguish what the AI proposed from what a human confirmed. An observation
also records `observation_window_complete` — `NOT NULL` with no default, so the capture UI
has to ask whether the estimator saw the whole shift or part of it. A partial window can
support a price; it cannot define one.

### Configuration is data

Product name, scenario labels, plan limits, entitlements, calendar assumptions, on-cost
rules, overhead recovery methods and commercial floors are all rows or environment values.
Adding a plan, renaming a strategy or changing a jurisdiction's payroll tax is not a
deploy.

### Sent versions are sealed

Once a quote version is sent it is immutable; a revision is a new version. This is what
makes "what exactly did we quote in March?" answerable, and it is enforced by a trigger
rather than by convention.

### The monorepo lives under `cleanquote/`

This repository already hosts an unrelated static site at the root. Placing the monorepo
in a subdirectory keeps that deployment working untouched. If CleanQuote becomes the
repository's primary concern, promoting it to the root is a mechanical move.

## Runtime modes

The application runs with nothing configured. Every integration degrades to a documented
local mode, and the UI states which mode it is in rather than pretending.

| Integration | Absent                                                   | Present                                |
| ----------- | -------------------------------------------------------- | -------------------------------------- |
| Supabase    | Demonstration mode: seed cases priced by the real engine | Quotes read from Postgres under RLS    |
| Anthropic   | Mock provider returns fixture extractions                | Live extraction, logged and budgeted   |
| Stripe      | Entitlements come from plan defaults                     | Subscription state drives entitlements |
| Sentry      | Errors to stdout                                         | Errors reported                        |

This is deliberate: the whole product should be developable, testable and demonstrable
before any external account exists.

## Quote lifecycle

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> capturing: start walkthrough
  capturing --> in_review: capture complete
  in_review --> in_review: confirm or correct AI findings
  in_review --> awaiting_approval: submit (above threshold)
  in_review --> approved: no approval required
  awaiting_approval --> approved: approver accepts
  awaiting_approval --> rejected: approver declines
  awaiting_approval --> in_review: changes requested
  rejected --> in_review: revise
  approved --> sent: issue proposal (version sealed)
  sent --> accepted
  sent --> declined
  sent --> expired
  accepted --> [*]
  declined --> [*]
  expired --> [*]
```

## Calculation flow

```mermaid
flowchart TD
  A["Capture: spaces, assets, measurements, observations"] --> B["Rate card + benchmarks"]
  B --> C["Labour: productivity / staffing / percent-of-labour"]
  C --> D["Productive hours x absence allowance = paid hours"]
  D --> E["On-cost cascade, ordered"]
  E --> F["+ direct costs"]
  F --> G["+ fixed overhead"]
  G --> H["+ contingency: risk expected value + discretionary"]
  H --> I["Closed-form price solve<br/>P = C / (1 - m - o)"]
  I --> J["Rounding policy"]
  J --> K{"Guardrails"}
  K -->|satisfied| L["Scenario result"]
  K -->|breached, no override| M["Raise price"] --> L
  K -->|breached, override| N["Keep price, keep warning"] --> L
  L --> O["Recommendation: deterministic, explained"]
  O --> P["Human confirms · version sealed · proposal issued"]
```

The human confirmation step is not decorative. No price is issued without a person
accepting the scope, the assumptions and the number.

## What is not built

The mobile capture app, AR measurement, the AI copilot, tender document intelligence,
proposal generation, the client portal, billing and the admin platform are designed for
but not implemented. [ROADMAP.md](ROADMAP.md) states the order and the reasoning.
