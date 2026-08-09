# Runbook — web and API deployment

Applies to `apps/admin` on Vercel, Sydney (`syd1`) functions.

## Environments

| Environment | Trigger                     | Data                                   | Approval                                              |
| ----------- | --------------------------- | -------------------------------------- | ----------------------------------------------------- |
| Local       | Developer machine           | Seed data only                         | —                                                     |
| Preview     | Every eligible pull request | Isolated test services                 | Preview protection on sensitive branches              |
| Staging     | Release candidate branch    | Production-like schema, synthetic data | Named testers                                         |
| Production  | Merge to `main`             | Live                                   | Named approver on the `production` GitHub Environment |

## Deploy

1. Merge to `main` after required checks pass and CODEOWNERS have approved.
2. `release-web.yml` waits for the production environment approver.
3. The migration job applies forward migrations with the **migration identity**
   — a credential distinct from the runtime identity — and records the applied
   file in the run summary.
4. Vercel builds and promotes; `/api/v1/ready` is polled five times at ten
   second intervals.
5. A failed readiness check triggers `vercel rollback` in the same job.

Migrations never run during a web build. Traffic is promoted only after the
migration job reports success.

## Rollback

| Symptom                               | Action                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Bad web/API release, schema unchanged | `vercel rollback` to the previous production deployment                                                                   |
| Bad release with a schema change      | Roll back the deployment, then ship a **forward repair** migration. Never reverse an applied migration on production data |
| Feature misbehaving in one tenant     | Disable the feature flag; keep the deployment                                                                             |
| Data corruption                       | Stop writes to the affected path, restore per `backup-restore.md`, then repair forward                                    |

## Post-deploy checks

- `/api/v1/health` returns 200.
- `/api/v1/ready` reports `ok` for configuration, database, storage and email.
- Error rate and p99 latency stable for 15 minutes.
- Outbox has no growing backlog of unprocessed events.
- Scheduled jobs ran once, not twice (check `outbox_event.claimed_by`).

## Cron jobs

`apps/admin/vercel.json` schedules the missed-shift detector (every 15 minutes)
and the outbox processor (every 5 minutes). Both authenticate with
`CRON_SHARED_SECRET` and rely on database uniqueness for idempotency, so an
overlapping run cannot double-send.
