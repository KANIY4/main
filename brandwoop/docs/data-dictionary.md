# Data dictionary

Schema `brandwoop`. Every business table carries `tenant_id` directly, and every
one of them has row-level security enabled (enforced by the migration lint).

## Identity and tenancy — `0001`

| Table                  | Purpose                                         | Key rules                                                                             |
| ---------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| `tenant`               | Company record                                  | `company_code` unique, uppercase, 4-16 chars; discovery aid only, never authorisation |
| `user_profile`         | Person                                          | Phone stored E.164; `id` matches the auth provider subject                            |
| `tenant_membership`    | Person in a company with a role                 | Unique per `(tenant_id, user_id)`; status drives access immediately                   |
| `device_session`       | Active sessions                                 | Revoked on suspension; partial index on live sessions                                 |
| `support_access_grant` | Time-bound platform support access              | Reason-coded, expires, readable by the tenant administrator                           |
| `audit_log`            | Append-only administrative and security history | Update and delete rejected by trigger                                                 |

## Sites and scheduling — `0002`

| Table                | Purpose                                | Key rules                                                                  |
| -------------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| `site`               | Serviced location                      | Geofence radius 20-2000 m; accuracy threshold 10-500 m; no silent defaults |
| `site_area`          | Zones within a site                    | Ordered; referenced by tasks and audit items                               |
| `site_contact`       | Client contacts                        | `receives_reports` drives report distribution                              |
| `site_assignment`    | Worker allocation with effective dates | Drives the "allocated" grant in `packages/auth` and in RLS                 |
| `service_plan`       | Versioned task set                     | Unique `(site_id, version)`; a shift stores the version it ran             |
| `task_template_item` | Individual task                        | `requires_photo` enforced at sign-off                                      |
| `pay_rate_history`   | Effective-dated rates                  | Administrator-only policy; excluded from support access                    |
| `shift_template`     | Recurring pattern                      | Recurrence stored as JSON, expanded server-side                            |
| `shift`              | One occurrence                         | Unique `(tenant_id, occurrence_key)` prevents duplicate expansion          |
| `shift_assignment`   | Worker on a shift                      | Unique per `(shift_id, worker_id)`; cover records the replaced row         |

## Attendance and evidence — `0003`

| Table                   | Purpose                              | Key rules                                                                                        |
| ----------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `attendance_event`      | Sign in/out and breaks               | Immutable; server time authoritative; device time kept for drift; location only at these actions |
| `attendance_correction` | Requested change with approval trail | Never mutates the original event                                                                 |
| `attendance_exception`  | Late, missed, outside geofence       | Unique per `(shift_id, category)` so the detector is idempotent                                  |
| `checklist_run`         | Task execution for a shift           | One per shift                                                                                    |
| `task_result`           | Outcome per task                     | `not_applicable` requires a reason                                                               |
| `upload_record`         | Signed upload slot                   | Object path must start with `tenant_id/`; pending slots expire                                   |
| `photo_evidence`        | Confirmed evidence                   | Linked to an upload record; usable only once `scan_status = 'clean'`                             |
| `shift_sign_off`        | Immutable completion event           | One per shift; unique idempotency key; append-only                                               |

## Quality, reporting and platform — `0004`

| Table                                      | Purpose                                         | Key rules                                                   |
| ------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------- |
| `audit_template` / `audit_item_definition` | Versioned audit questions                       | Weighted; critical items fail the audit outright            |
| `audit` / `audit_item_result`              | Executed audit                                  | A finalised audit must carry score, pass flag and timestamp |
| `issue`                                    | Defect or hazard                                | Closure requires a reason                                   |
| `rectification`                            | Fix and verification                            | Verifier cannot be the person who completed the work        |
| `daily_log`                                | Supervisor site log                             | One per site, supervisor and date                           |
| `supply_shortage`                          | Consumable shortfall                            | Full inventory is out of scope                              |
| `report` / `report_version`                | Generated PDF and its history                   | One report per source event; regeneration adds a version    |
| `delivery_attempt`                         | Email delivery outcome                          | Bounces and failures recorded, not inferred                 |
| `outbox_event`                             | Committed business events awaiting side effects | Unique per `(tenant_id, type, idempotency_key)`             |
| `notification` / `notification_preference` | User-facing alerts                              | Unique per user, event and channel                          |
| `retention_policy`                         | Per-record retention and legal hold             | Retention values come from decision D-07                    |

## Conventions

- Primary keys are UUIDs; `audit_log` uses a bigserial because it is
  append-only and never referenced by a client.
- Timestamps are `timestamptz`. Local wall time is derived from the site
  timezone, never stored as naive text.
- Money is integer cents. No floating point for rates.
- Soft delete (`deleted_at`) applies to `tenant` and `site`; operational history
  is never hard-deleted while retention or legal hold applies.
- Foreign keys use `on delete restrict` wherever the child is evidence of work
  performed.
