# Decisions required before build (Appendix C)

Status legend: **Open** — blocks the work named in "Blocks"; **Confirmed** — recorded
with date and owner; **Superseded** — replaced by a later decision.

| ID   | Decision                                                        | Owner                   | Due                      | Status | Blocks                                                                                      |
| ---- | --------------------------------------------------------------- | ----------------------- | ------------------------ | ------ | ------------------------------------------------------------------------------------------- |
| D-01 | GitHub organisation and repository ownership                    | BrandWoop               | Before week 1            | Open   | Branch protection, CODEOWNERS teams, CI secrets, this directory becoming its own repository |
| D-02 | Database / Auth / Storage provider and exact Australian region  | BrandWoop + Development | Before week 1            | Open   | Provider clients, storage policies, backup plan                                             |
| D-03 | Cleaner phone OTP provider; administrator MFA method            | BrandWoop               | Before auth build        | Open   | Session handling, rate limits, account recovery                                             |
| D-04 | Android application ID, app name and signing credential owner   | BrandWoop               | Before first EAS build   | Open   | `apps/mobile/app.config.ts` refuses a production build until set                            |
| D-05 | Exact third-party repositories and packages to evaluate         | BrandWoop               | Before installation      | Open   | Repository approval register rows                                                           |
| D-06 | GPS radius defaults, accuracy threshold and exception policy    | Operations + Legal      | Before phase 2           | Open   | Site defaults; current code requires a per-site value with no silent default                |
| D-07 | Privacy notice, GPS consent/consultation and retention schedule | BrandWoop + Legal       | Before field UAT         | Open   | `consent_version` content, `retention_policy` rows                                          |
| D-08 | Report sender domain/address and recipient rules                | BrandWoop               | Before email integration | Open   | SPF/DKIM/DMARC, delivery logging                                                            |
| D-09 | Supported devices and Android versions; pilot cohort            | BrandWoop               | Before UAT               | Open   | Device test matrix                                                                          |
| D-10 | Production support, warranty and incident contacts              | Commercial owners       | Before go-live           | Open   | Incident runbook, on-call list                                                              |

## How a decision is closed

1. Record the decision, the date and the person who made it in the row above.
2. If it changes architecture, add an ADR under `docs/adr/`.
3. If it changes behaviour, update the affected contract, migration or config in
   the same pull request.

## Current effect on the build

The foundation in this repository is deliberately provider-agnostic where a
decision is open: the database schema is standard PostgreSQL with RLS, the
storage contract is a signed-URL handshake, and application identifiers are read
from environment variables that fail the build when unset. Nothing here presumes
a provider that D-02 has not confirmed.
