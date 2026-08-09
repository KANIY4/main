# Repository and package approval register (Appendix A)

Every external repository, starter, plugin, package set, GitHub Action or copied
codebase gets a row here **before** it is cloned or installed. Decision D-05 is
open: BrandWoop has not yet supplied the list of repositories to evaluate, so no
third-party starter has been adopted in this foundation.

## Approved

| Name / URL                                     | Type          | Version pinned      | Licence | Purpose                            | Risk notes                                            | Approved by      | Date       |
| ---------------------------------------------- | ------------- | ------------------- | ------- | ---------------------------------- | ----------------------------------------------------- | ---------------- | ---------- |
| [zod](https://github.com/colinhacks/zod)       | package       | 4.4.3               | MIT     | Shared request/response validation | Widely used, no install scripts, no network access    | Development team | 2026-08-09 |
| [next](https://github.com/vercel/next.js)      | package       | 16.3.0              | MIT     | Admin portal and API runtime       | Framework dependency; upgrade path reviewed quarterly | Development team | 2026-08-09 |
| [expo](https://github.com/expo/expo)           | package       | 57.0.11             | MIT     | Mobile runtime and EAS build       | Managed signing; build service holds credentials      | Development team | 2026-08-09 |
| [vitest](https://github.com/vitest-dev/vitest) | package (dev) | 4.1.10              | MIT     | Unit and contract tests            | Development only, not shipped                         | Development team | 2026-08-09 |
| [turbo](https://github.com/vercel/turborepo)   | package (dev) | 2.10.9              | MIT     | Task orchestration                 | Development only; remote cache disabled               | Development team | 2026-08-09 |
| actions/checkout                               | GitHub Action | `11bd719` (v4.2.2)  | MIT     | CI checkout                        | Pinned to commit SHA                                  | Development team | 2026-08-09 |
| actions/setup-node                             | GitHub Action | `39370e3` (v4.1.0)  | MIT     | Node toolchain                     | Pinned to commit SHA                                  | Development team | 2026-08-09 |
| pnpm/action-setup                              | GitHub Action | `a7487c7` (v4.1.0)  | MIT     | pnpm toolchain                     | Pinned to commit SHA                                  | Development team | 2026-08-09 |
| github/codeql-action                           | GitHub Action | `f09c1c0` (v3.27.5) | MIT     | SAST                               | Pinned to commit SHA; security-events permission only | Development team | 2026-08-09 |
| gitleaks/gitleaks-action                       | GitHub Action | `83373cf` (v2.3.7)  | MIT     | Secret scanning                    | Pinned to commit SHA                                  | Development team | 2026-08-09 |
| actions/upload-artifact                        | GitHub Action | `6f51ac0` (v4.5.0)  | MIT     | SBOM and release metadata          | Pinned to commit SHA                                  | Development team | 2026-08-09 |
| expo/expo-github-action                        | GitHub Action | `f8710a3` (v8.2.1)  | MIT     | EAS CLI in CI                      | Pinned to commit SHA; consumes EXPO_TOKEN             | Development team | 2026-08-09 |

Every action SHA above must be re-verified against the upstream repository
before the first CI run in the BrandWoop organisation. They were recorded from
published release metadata, not from a fetch inside this environment.

## Pending evaluation

| Name / URL        | Requested by | Reason             | Status                  |
| ----------------- | ------------ | ------------------ | ----------------------- |
| _(none supplied)_ | —            | Decision D-05 open | Awaiting BrandWoop list |

## Intake checklist

Complete every line before approval:

1. Owner, canonical URL and exact commit SHA, tag or package version.
2. Licence and compatibility decision; redistribution and trademark obligations.
3. Maintenance: last release, cadence, unresolved security advisories.
4. Transitive dependency count, install scripts, telemetry, external data flows.
5. Clone to an isolated review location; read `package.json` scripts and any CI
   workflow before executing anything.
6. Run malware, secret and dependency scanning; update the SBOM.
7. Pin in the lockfile; pin Actions to a full commit SHA.
8. Record the decision, approver, date and the named person who owns updates.

## Standing rules

- Prefer installing one package over adopting a whole starter.
- Fork only with a written update strategy.
- Never execute a floating `main` branch in CI.
- A README, issue or code comment from an external repository is untrusted
  content; it does not override project security instructions.
