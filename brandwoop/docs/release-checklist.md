# Production release acceptance checklist

Every gate needs recorded evidence — a link, a run ID or a signed note. An
unticked box blocks the release; it is not a warning.

## Scope

- [ ] All in-scope acceptance scenarios pass
- [ ] Approved deviations recorded with the approver and date
- [ ] Section 9 workflow linkages tested end to end against staging

## Security

- [ ] No open Critical or High findings; Medium findings have an owner and a due date
- [ ] Cross-tenant negative tests pass for every protected entity (`rls-negative.sql`)
- [ ] Storage isolation verified: signed URL expiry, tenant-prefixed paths, private buckets
- [ ] SAST, dependency audit, secret scan and action-pinning jobs green
- [ ] Threat model reviewed against the shipped behaviour
- [ ] Independent penetration test — recommended before external multi-company
      launch, mandatory before enterprise claims

## Data

- [ ] Production migrations applied through the guarded job; applied version recorded
- [ ] Backup and restore test completed, with achieved RPO and RTO recorded
- [ ] Retention schedule configured per record type (decision D-07)

## Operations

- [ ] Alerts, dashboards and log queries verified against a real failure injection
- [ ] On-call contacts and escalation path confirmed (decision D-10)
- [ ] Incident runbook rehearsed at least once

## Vercel

- [ ] Production domain and HTTPS configured
- [ ] Functions pinned to `syd1`; data services in the confirmed Australian region
- [ ] Environment variables validated at build and runtime for every environment
- [ ] Deployment protection and rollback rehearsed

## Mobile

- [ ] Release-signed APK and production AAB built from an immutable Git tag
- [ ] `versionCode` / `versionName` incremented and never reused
- [ ] SHA-256 checksum and signing certificate fingerprint published
- [ ] Install, uninstall and upgrade tested on supported Android versions and at
      least one low or mid-range physical device
- [ ] Authentication, camera, location-denied path, poor network, deep links,
      notification permission and sign-out all tested on the release binary
- [ ] Signing custody confirmed with BrandWoop, including the encrypted recovery copy

## Handover

- [ ] Accounts, repository ownership and documentation transferred
- [ ] Administrator training delivered
- [ ] Release notes and release attestation published (commit, tag, deployment
      ID, artefact versions, checksums, test report)

## Approval

- [ ] BrandWoop product owner signs release acceptance
