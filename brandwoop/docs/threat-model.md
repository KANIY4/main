# Threat model

Scope: the boundaries named in scope section 10 — tenant isolation, identity,
file upload, GPS, reporting, notifications and support access. Reviewed before
feature build; revisited when a boundary changes.

Method: STRIDE per trust boundary, with the mitigation and the test that proves
it. A mitigation with no test is a plan, not a control.

## Trust boundaries

| #   | Boundary                          | Crosses                    |
| --- | --------------------------------- | -------------------------- |
| B1  | Mobile app → API                  | Untrusted device to server |
| B2  | Browser → portal/API              | Untrusted client to server |
| B3  | API → PostgreSQL                  | Server to data, under RLS  |
| B4  | API/worker → object storage       | Server to private evidence |
| B5  | Worker → email/SMS/push providers | Server to third party      |
| B6  | CI → production                   | Automation to live systems |
| B7  | Platform support → tenant data    | Operator to customer data  |

## Findings and mitigations

| ID   | Boundary | Threat                                                            | Mitigation                                                                                                                           | Verified by                                                 |
| ---- | -------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| T-01 | B1, B2   | Tampering: caller supplies another tenant's ID                    | Session-derived tenant only; `authorize()` compares against the resource; RLS repeats the check                                      | `packages/auth` cross-tenant suite; `rls-negative.sql`      |
| T-02 | B3       | Information disclosure: guessed UUID returns a record             | UUIDs are identifiers, not authorisation; every read is policy-filtered                                                              | `rls-negative.sql`                                          |
| T-03 | B1       | Spoofing: worker records attendance for someone else              | Insert policy requires `worker_id = current_user_id()`                                                                               | RLS insert policy test                                      |
| T-04 | B1       | Repudiation: worker edits a sign-in time after the fact           | Attendance events immutable by trigger; corrections are new rows with an approval trail                                              | Migration trigger tests                                     |
| T-05 | B1       | Spoofing location: mock GPS provider                              | `isMocked` captured and surfaced as `mock_location_suspected`; accuracy threshold per site; outcome recorded, never silently trusted | `geofence.test.ts`                                          |
| T-06 | B4       | Information disclosure: evidence photo readable by another tenant | Private buckets, tenant-prefixed random object paths, short-lived signed URLs, DB check constraint on the prefix                     | `upload_record_tenant_prefixed`; storage policy review      |
| T-07 | B4       | Malicious upload (polyglot, archive, active content)              | Allowlisted MIME types, declared size ceiling, checksum confirm step, malware scan before the file becomes evidence                  | `validation.test.ts`; scan status gate                      |
| T-08 | B1, B2   | Elevation: cleaner reaches an administrator capability            | Capability matrix denies by default; sensitive capabilities require MFA                                                              | `permissions.test.ts`                                       |
| T-09 | B2       | Bulk extraction through pagination or export                      | Page size capped at 100; exports are capability-gated and date-bounded                                                               | `validation.test.ts`                                        |
| T-10 | B5       | Duplicate reports or emails on retry                              | Outbox with unique idempotency key; unique report per source event; unique notification per channel                                  | `migrations.test.ts`                                        |
| T-11 | B5       | Denial of service via notification storm                          | Delivery attempts capped at 10; alerts fire on queue failure rather than retrying forever                                            | Worker configuration review                                 |
| T-12 | B6       | Supply chain: a moved tag on a third-party Action                 | Actions pinned to full commit SHAs; `action-pinning` job fails the build otherwise                                                   | `security.yml`                                              |
| T-13 | B6       | Secret exposure in CI logs or forks                               | Environment-scoped secrets, named approver on production, no secrets for fork workflows                                              | Workflow review                                             |
| T-14 | B7       | Operator browses customer data without cause                      | Support grant is time-bound, reason-coded, read-only, visible to the tenant administrator                                            | `permissions.test.ts`; `support_access_grant_select` policy |
| T-15 | B1, B2   | Session theft after suspension                                    | Suspension revokes sessions; membership status checked on every request                                                              | `tenant-isolation.test.ts`                                  |
| T-16 | All      | Sensitive data in logs                                            | Structured logger redacts credentials, contact details, coordinates and object paths                                                 | `api-handler.test.ts`                                       |
| T-17 | B2       | XSS or clickjacking in the portal                                 | CSP without `unsafe-eval`, `frame-ancestors 'none'`, HSTS, nosniff                                                                   | `next.config.mjs`; header check at UAT                      |

## Residual risk

- **Independent penetration testing has not been performed.** Recommended
  before external multi-company launch; mandatory before enterprise claims
  (scope section 10). Nothing here substitutes for it.
- **Provider-side controls are unverified** until D-02 selects the database,
  auth and storage provider and its Australian region.
- **Style-based CSP** allows `'unsafe-inline'` for styles. Removing it needs
  nonce plumbing through the portal's styling approach; tracked for the
  hardening milestone (weeks 9-10).
- **Device compromise** (rooted phone, hostile MDM) is out of scope for
  phases 1-2: no biometrics or managed-device enforcement is contracted.
