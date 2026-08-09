# BrandWoop — cleaning management platform

Multi-tenant cleaning operations platform for Australian commercial cleaning
businesses. Cleaners and supervisors use a mobile app; company administrators
use a web portal; every record is attached to a tenant, site, shift and
responsible user.

This directory is the **week 0-2 foundation** described in the Production-Ready
MVP Technical Scope v2.0 (9 August 2026). It is laid out as a standalone
repository root so it can be moved into the BrandWoop-owned GitHub organisation
once decision **D-01** is confirmed — at which point `.github/workflows` starts
running.

## Quick start

```bash
cd brandwoop
pnpm install
cp .env.example .env.local     # then fill in real values
pnpm typecheck
pnpm test
```

Run the portal:

```bash
pnpm --filter @brandwoop/admin dev     # http://localhost:3000
```

Apply the schema to a local PostgreSQL 17 database:

```bash
for f in packages/database/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/database/tests/rls-negative.sql
```

## Layout

| Path                 | Contents                                                                       |
| -------------------- | ------------------------------------------------------------------------------ |
| `apps/admin`         | Next.js portal and versioned `/api/v1` handlers, Vercel `syd1`                 |
| `apps/mobile`        | Expo React Native app and EAS build profiles                                   |
| `packages/contracts` | Zod schemas, domain rules (geofence, recurrence, audit scoring), outbox events |
| `packages/auth`      | Capability matrix and deny-by-default authorisation                            |
| `packages/database`  | Forward-only migrations, RLS policies, isolation tests, migration lint         |
| `packages/config`    | Environment schemas and deployment constants                                   |
| `packages/ui`        | Shared brand tokens                                                            |
| `docs`               | ADRs, data dictionary, threat model, runbooks, registers                       |
| `.claude`            | Guarded agent settings and the protected-path hook                             |

## What is implemented

- Shared contracts for tenancy, sites, scheduling, attendance, evidence,
  quality, reporting and outbox events, with server-controlled state machines.
- Timezone-correct recurrence expansion with stable occurrence keys, geofence
  evaluation and weighted audit scoring — all unit tested, including the
  Sydney DST boundary.
- Deny-by-default capability matrix covering the scope section 4 role table,
  with cross-tenant negative tests over every capability.
- PostgreSQL schema for all eight domains with row-level security on every
  tenant table, append-only attendance and audit history, and uniqueness
  constraints that make report, email and notification delivery idempotent.
- API request pipeline: correlation IDs, body limits, schema validation,
  authorisation error mapping and redacting structured logs.
- CI: format, typecheck, tests, migration lint, cross-tenant RLS tests against
  ephemeral PostgreSQL, CodeQL, secret scanning, dependency audit, SBOM and an
  action-pinning gate. Release workflows for guarded migrations, Vercel
  promotion with rollback, and EAS signed builds.

## What is not implemented yet

Authentication provider integration, the admin workspace UI, the cleaner and
supervisor mobile workflows, PDF generation, email delivery and the outbox
worker. These are the week 3-8 milestones and depend on decisions D-02, D-03,
D-04 and D-08 in [docs/decisions.md](docs/decisions.md).

No third-party starter or template has been adopted: decision **D-05** has not
supplied the list. See [docs/repository-approval-register.md](docs/repository-approval-register.md).

## Non-negotiables

Read [CLAUDE.md](CLAUDE.md) before changing anything under `packages/auth`,
`packages/database/migrations` or `.github/workflows`. The ten security
invariants there are review blockers, and the migration lint and RLS tests
enforce several of them automatically.
