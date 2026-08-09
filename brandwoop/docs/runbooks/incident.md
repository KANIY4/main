# Runbook — incident response

Contacts are decision D-10 and must be filled in before go-live.

## Severity

| Level | Definition                                                                   | Response                                    |
| ----- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| P1    | Service down, data loss risk, or a suspected cross-tenant exposure           | Page on-call immediately; 15-minute updates |
| P2    | Degraded: reports not delivering, sign-off failing for some sites, auth slow | Alert in the team channel; hourly updates   |
| P3    | Cosmetic or single-user issue with a workaround                              | Ticket, next business day                   |

A suspected tenant-isolation failure is **always P1**, regardless of how few
records are involved.

## First 15 minutes

1. Acknowledge and assign an incident lead.
2. Capture the request IDs, release version and affected tenants — from logs,
   not from screenshots.
3. Decide: stop the bleeding (rollback, feature flag, disable a job) before
   diagnosing.
4. Open the incident record. Note the time of each action as you take it.

## Suspected data exposure

1. Preserve evidence: do not delete logs or rows.
2. Revoke the credential or session involved; expire any live support grant.
3. Establish the blast radius with the audit log: which actor, which entities,
   what window.
4. Notify BrandWoop's nominated security contact. BrandWoop assesses the
   Notifiable Data Breaches obligation with legal advice — the development team
   supplies facts, not a legal conclusion.
5. Only then begin remediation.

## Common failures

| Symptom                    | First checks                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Reports not arriving       | Outbox backlog; `delivery_attempt` statuses; provider bounce log; sender domain DNS |
| Sign-off failing           | `/api/v1/ready`; storage scan queue; database connection saturation                 |
| Duplicate notifications    | A worker running twice; check `outbox_event.claimed_by` and the unique constraints  |
| Missed-shift alerts absent | Cron ran? `CRON_SHARED_SECRET` rotated without updating the job?                    |
| Auth failures spike        | Rate limiter thresholds; OTP provider status; clock skew                            |

## After the incident

- Write the postmortem within five business days: timeline, contributing
  factors, what detected it, what delayed recovery.
- Every action item gets an owner and a date. "Be more careful" is not an
  action item.
- If an alert did not fire, fix the alert before closing the incident.
