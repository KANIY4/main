# ADR 0001 — TypeScript monorepo with shared contracts

- Date: 2026-08-09
- Status: Accepted
- Deciders: Development team (scope section 5.1)

## Context

The platform ships a Next.js administration portal, a versioned API and an Expo
mobile app that must agree on every request shape, permission rule and state
machine. Separate repositories let the three drift: a field renamed in the API
surfaces as a runtime error on a cleaner's phone, days later, in a basement with
no signal.

## Decision

One pnpm workspace with Turborepo:

- `apps/admin` — Next.js App Router portal plus `/api/v1/*` route handlers.
- `apps/mobile` — Expo React Native application.
- `packages/contracts` — Zod schemas, domain rules and event definitions.
- `packages/auth` — capability matrix and authorisation decisions.
- `packages/database` — migrations, RLS policies and isolation tests.
- `packages/config`, `packages/ui` — environment schemas and brand tokens.

Apps depend on packages; packages never depend on apps. A shape used by both
clients lives in `contracts` or it does not exist.

## Consequences

- A contract change breaks typecheck in every consumer during the same pull
  request, which is where it should surface.
- One lockfile and one CI pipeline; Turborepo skips unaffected work.
- Package boundaries need enforcement in review — a helper dropped into an app
  because it was quicker is how drift restarts.
- Extracting an app later means extracting its packages too; this is accepted
  because there is no plan to split the product.
