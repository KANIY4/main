# Runbook — backup, restore and recovery rehearsal

Targets (scope section 16, to be confirmed before production): **RPO ≤ 24 hours,
RTO ≤ 8 hours**. Both improve if commercial need requires and the provider plan
selected under D-02 supports it.

## What is backed up

| Asset                              | Mechanism                                              | Retention                                   |
| ---------------------------------- | ------------------------------------------------------ | ------------------------------------------- |
| PostgreSQL                         | Automated provider backups plus point-in-time recovery | Per provider plan; minimum 7 days PITR      |
| Object storage (evidence, reports) | Bucket versioning and lifecycle rules                  | Per retention policy per record type        |
| Secrets                            | Provider secret store, not in Git                      | Rotated on schedule and on exposure         |
| Signing credentials                | BrandWoop custody, encrypted recovery copy             | Held by BrandWoop, not the development team |

## Restore procedure

1. Declare the incident and record the target recovery point.
2. Freeze writes: disable the cron jobs and put the portal into maintenance.
3. Restore the database to a **new instance** at the target timestamp. Never
   restore over the live instance.
4. Verify: row counts on `tenant`, `shift`, `attendance_event`; the most recent
   `shift_sign_off`; a spot-check that RLS still refuses a cross-tenant read.
5. Reconcile object storage: evidence written after the recovery point may have
   no database row. Quarantine those objects rather than deleting them.
6. Repoint the application, re-enable jobs, and watch the outbox drain.
7. Record the actual RPO and RTO achieved.

## Rehearsal schedule

- Before go-live: one full restore test, recorded, with the achieved RPO/RTO.
- Quarterly after launch: restore test into a scratch environment.
- After any migration that rewrites a large table: an out-of-band rehearsal.

A restore that has not been rehearsed is an assumption, not a control. The
release acceptance checklist blocks on recorded evidence of a completed test.
