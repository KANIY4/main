# Third-party software

Every dependency, its licence, and why it was chosen over the alternatives. All licences
below are permissive and compatible with commercial SaaS use. Nothing here is GPL, AGPL or
SSPL.

## Runtime

| Package                                                | Version | Licence | Why                                                                                                                                                                                                                                                         |
| ------------------------------------------------------ | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [decimal.js](https://github.com/MikeMcl/decimal.js)    | 10.6.0  | MIT     | Arbitrary-precision decimals for the pricing engine. Chosen over `big.js` (no configurable precision context) and `bignumber.js` (same author, but decimal.js has the better rounding-mode surface for currency). Zero dependencies, maintained since 2013. |
| [zod](https://github.com/colinhacks/zod)               | 4.4.3   | MIT     | Boundary validation with types inferred from the schema, so the schema cannot drift from the type. Chosen over Joi (no TypeScript inference) and Yup (weaker discriminated-union support, which the labour-line schema needs).                              |
| [next](https://github.com/vercel/next.js)              | 16.2.12 | MIT     | React framework. Server Components let the pricing breakdown render server-side with no client JavaScript, which suits a data-dense read-heavy screen.                                                                                                      |
| [react](https://github.com/facebook/react) / react-dom | 19.2.8  | MIT     | Required by Next.js.                                                                                                                                                                                                                                        |

## Development

| Package                                                                                                                                                                                                       | Version | Licence    | Why                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------- | ----------------------------------------------------------------------------------- |
| [typescript](https://github.com/microsoft/TypeScript)                                                                                                                                                         | 5.9.3   | Apache-2.0 | Strict mode with `noUncheckedIndexedAccess`.                                        |
| [vitest](https://github.com/vitest-dev/vitest)                                                                                                                                                                | 3.2.4   | MIT        | Runs TypeScript sources directly, so workspace packages need no build step in test. |
| [@vitest/coverage-v8](https://github.com/vitest-dev/vitest)                                                                                                                                                   | 3.2.4   | MIT        | Coverage thresholds in CI.                                                          |
| [eslint](https://github.com/eslint/eslint)                                                                                                                                                                    | 9.39.0  | MIT        | Flat config.                                                                        |
| [typescript-eslint](https://github.com/typescript-eslint/typescript-eslint)                                                                                                                                   | 8.46.2  | MIT        | TypeScript rules, notably `consistent-type-imports`.                                |
| [prettier](https://github.com/prettier/prettier)                                                                                                                                                              | 3.6.2   | MIT        | Formatting is not a code-review topic.                                              |
| [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped), [@types/react](https://github.com/DefinitelyTyped/DefinitelyTyped), [@types/react-dom](https://github.com/DefinitelyTyped/DefinitelyTyped) | —       | MIT        | Type definitions.                                                                   |

## Infrastructure

| Service                                   | Licence / terms                           | Why                                                                                                                                                   |
| ----------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PostgreSQL](https://www.postgresql.org/) | PostgreSQL Licence                        | Row level security is the mechanism the entire tenancy model rests on. Exact `numeric` arithmetic matters for a commercial record.                    |
| [Supabase](https://supabase.com/)         | Apache-2.0 (platform), commercial hosting | Postgres with auth, storage and RLS integrated. Self-hostable, so the platform choice is reversible.                                                  |
| Anthropic API                             | Commercial terms                          | Extraction, classification and drafting. Behind a provider abstraction so another approved model provider can be added without touching product code. |
| Stripe Billing                            | Commercial terms                          | Subscriptions and entitlement source of truth.                                                                                                        |

## Version policy

Production dependencies are pinned to exact versions; the lockfile is committed and CI
installs with `--frozen-lockfile`. Ranges would be appropriate if these were libraries;
they are an application, where a surprise transitive upgrade is a risk with no upside.

`pnpm audit --audit-level high` runs in CI and fails the build on high or critical
advisories. Lower severities are reported for weekly review rather than blocking a merge.

## Evaluated and not adopted

Recorded so the reasoning is not re-litigated:

- **Tailwind CSS** — the web app has a small, bespoke surface. Plain CSS with custom
  properties gives the same result without a build-tool dependency, and dark mode is four
  lines rather than a configuration file.
- **TanStack Query** — the current pages are server components with no client-side cache.
  It becomes the right answer when interactive editing lands, not before.
- **Prisma / Drizzle** — the tenancy model lives in RLS policies and database constraints,
  which are the source of truth. An ORM layered over that would duplicate the rules in a
  place they can silently disagree.
- **A dedicated money library (dinero.js)** — decimal.js already covers the arithmetic, and
  a second numeric abstraction over the same values invites conversion bugs at the seam.
- **pg-mem for database tests** — it does not implement row level security, which is the
  entire point of the suite. A real PostgreSQL in CI costs a few seconds and tests what
  actually ships.
