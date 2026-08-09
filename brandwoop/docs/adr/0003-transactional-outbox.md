# ADR 0003 — Transactional outbox for reports, email and alerts

- Date: 2026-08-09
- Status: Accepted
- Deciders: Development team (scope section 9)

## Context

Signing off a shift must produce exactly one PDF and one set of recipient
emails. Doing that work inside the request makes sign-off slow on a phone with
poor reception, and a retry after a timeout produces a second report. Firing a
job from the handler after the commit loses the job whenever the process dies
between the two steps.

The scope also states that notifications are consequences of committed business
events, never a substitute for storing the event.

## Decision

Write the business record and an `outbox_event` row in one transaction. A worker
claims unprocessed events, performs the side effect, then marks them processed.

- `outbox_event` is unique on `(tenant_id, type, idempotency_key)`, so a retried
  request cannot enqueue the same consequence twice.
- `report` is unique on `(tenant_id, type, source_entity_id)`; a regeneration
  adds a `report_version`, not a second report.
- `notification` is unique on `(user_id, outbox_event_id, channel)`.
- `delivery_attempt` records every send with its provider status, so a bounce is
  visible rather than inferred from silence.

## Consequences

- Reports and emails are eventually consistent; the sign-off response returns
  before the PDF exists, and the UI must say so.
- The worker needs the service identity, which bypasses RLS. That identity is
  confined to the job runtime and never reaches a request handler.
- Failure is observable: unprocessed events accumulate with `attempt_count` and
  `last_error`, which is what the queue-failure alert watches.
