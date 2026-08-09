# ADR 0002 — Row-level security as an independent second layer

- Date: 2026-08-09
- Status: Accepted
- Deciders: Development team (scope section 10)

## Context

Every record belongs to a tenant. The scope requires that a user reach only
authorised tenant, site and role data "even if the client is modified or an
identifier is guessed", and sets a 100% pass rate for cross-tenant negative
tests as a release gate.

Application-layer checks alone fail open in the ways that matter: a new endpoint
that forgets the check, a query built from a filter object with a missing
`tenant_id`, a background job reusing a request helper.

## Decision

Two independent layers, both mandatory:

1. `packages/auth` decides capability, tenant and site scope before any query
   runs. Deny by default; anything outside the capability matrix is refused.
2. PostgreSQL row-level security repeats the boundary. Policies read
   `brandwoop.current_user_id()` and the membership table — never a value the
   client can set. Tenant-exposed tables use `force row level security`.

The request role `brandwoop_app` holds only the grants each table needs;
attendance events and evidence get `select, insert` and no update or delete.
Background workers use a separate service identity that bypasses RLS, and that
identity is never available to a request handler.

## Consequences

- A forgotten application check leaks nothing; the database still refuses.
- Policies are evaluated per row, so hot paths need indexes on `tenant_id` and
  the site allocation lookup. This is why `idx_site_assignment_user_id_site_id`
  exists.
- Tests must run against real PostgreSQL. `packages/database/tests/rls-negative.sql`
  runs in CI against an ephemeral database on every pull request.
- Adding a tenant table without RLS fails the migration lint rather than
  reaching production.
