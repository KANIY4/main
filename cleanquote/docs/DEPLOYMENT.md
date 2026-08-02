# Deployment

## Environments

| Environment | Purpose            | Database                                      |
| ----------- | ------------------ | --------------------------------------------- |
| Local       | Development        | None (demonstration mode) or a local Supabase |
| Preview     | Per-pull-request   | Shared development project                    |
| Staging     | Release validation | Staging project, production-shaped            |
| Production  | Live               | Production project, restricted access         |

Each has its own Supabase project. Migrations are forward-only and applied in filename
order.

## Activating each integration

Everything is optional. An absent integration degrades to a documented local mode and the
UI says so; nothing silently pretends to work.

### Supabase

1. Create a project.
2. Apply `supabase/migrations/*.sql` in filename order.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Set `SUPABASE_SERVICE_ROLE_KEY` server-side only — it bypasses row level security.

The anon key is publishable by design; it is useless without the policies behind it. The
service role key is not, and `serverEnv()` throws if it is reached from a browser bundle.

Verify the deployment with `DATABASE_URL=<url> ./supabase/test/run-db-tests.sh` against a
scratch database — never against one holding real data, since the suite writes and seals
rows.

### Anthropic

Set `ANTHROPIC_API_KEY` and `AI_PROVIDER=anthropic`. Leave `AI_PROVIDER=mock` to develop
the copilot flow with fixture extractions and no spend. Set
`AI_MONTHLY_BUDGET_PER_ORG` — it is a hard ceiling, not a warning threshold.

The key is only ever read server-side. Rate limiting must be in place before any model
endpoint is exposed; see [ROADMAP.md](ROADMAP.md).

### Stripe

Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Webhooks are the only source of
subscription state — an entitlement claim from a client is never trusted. Entitlements are
enforced server-side from `plan_limits` and `organisation_entitlements`.

Keep in-app purchase behind a feature flag. App store policy on external purchase links
varies by store and by jurisdiction, so the mobile entitlement layer is deliberately
separate from web checkout: the purchasing method can change without touching the product
architecture.

## Web

Any Node host or edge platform that runs Next.js 16. Required:

- `NEXT_PUBLIC_APP_URL` set to the deployed origin
- Environment variables scoped per environment; nothing shared between staging and
  production
- Security headers, which ship in `next.config.mjs` (CSP, HSTS, frame-deny,
  `Permissions-Policy` denying camera, microphone and geolocation)

```bash
pnpm install --frozen-lockfile
pnpm --filter @cleanquote/web run build
pnpm --filter @cleanquote/web run start
```

## Migration workflow

1. Write the migration; never edit one that has been deployed.
2. Run `./supabase/test/run-db-tests.sh` locally — it applies every migration from scratch,
   which catches ordering mistakes a single-migration test would not.
3. Apply to development, then staging, then production.
4. **Grant on any new table explicitly.** The grant in the final RLS migration is a
   snapshot; a table added later with no grant is invisible to the application no matter
   what its policies say.

For large tables use the non-locking pattern: add the column, backfill in batches, then add
the constraint.

## Rollback

- **Web**: redeploy the previous build. It is stateless.
- **Database**: forward-only. A mistake is corrected by a new migration, not by reversing
  one. This is why staging must be production-shaped.
- **Sealed quote versions and audit records are immutable by design** and cannot be
  rolled back. Any correction is a new version.

## CI

`.github/workflows/cleanquote-ci.yml` runs on every push and pull request touching
`cleanquote/`:

- Format check, lint, typecheck
- Unit tests with coverage thresholds
- Web build
- **Migrations applied to a real PostgreSQL 16 with the security suite** — the job that
  matters most, because tenant isolation is the property with the worst failure mode
- Dependency audit, failing on high or critical advisories

`pnpm install --frozen-lockfile` means CI fails on a stale lockfile rather than quietly
resolving a different dependency tree than the author tested.

## Not yet configured

- Production hosting and custom domains
- Error monitoring (`SENTRY_DSN` is read but nothing reports to it yet)
- Mobile builds — the app does not exist
- Backup verification and restore drills

## Before this holds real money

The application runs correctly on a single node. These are the things that change when it
does not:

**Rate limiting is per-process.** `apps/web/lib/rate-limit.ts` holds a fixed window per key
in memory. Behind two nodes a caller gets twice the allowance. Replace the map with a
shared counter — Redis, or a Postgres table if the traffic is modest enough that a row per
window is cheaper than another service.

**The local media signing secret is per-process when unset.** A link signed by one node
will not verify on another. Set `STORAGE_URL_SIGNING_SECRET`, or move to hosted storage,
which signs at the storage service instead.

**Local storage is node-local.** `STORAGE_PROVIDER=local` writes to the filesystem. Two
nodes do not share it. Hosted storage is not optional beyond one machine — see
[STORAGE.md](STORAGE.md).

**Email needs a provider.** The local provider records messages in `email_deliveries` and
`/dev/inbox` renders them. That is deliberate for development and wrong in production: set
`EMAIL_PROVIDER`, `EMAIL_API_URL` and `EMAIL_API_KEY`. `/dev/inbox` refuses to render once
a real provider is configured or `NODE_ENV=production`, because the bodies contain
single-use tokens.

**`withSystem()` needs a role that bypasses RLS.** On Supabase that is `service_role`;
elsewhere it is a role with `BYPASSRLS`. It is used for registration, organisation
creation, invitation redemption and public proposal reads — all cases where the caller is
by definition not yet a member of the thing they are touching.

## Environment variables

Every variable is optional and each absent one degrades to a documented local mode. See
`.env.example`, which explains the activation steps for each group inline.

| Group    | Variables                                                                                                                                                                                        | Absent                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Branding | `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`                                                                                                                                                    | Defaults; the product name is never hard-coded in source |
| Database | `DATABASE_URL`, or the Supabase URL and keys                                                                                                                                                     | The app cannot serve the workspace; `/demo` still prices |
| Model    | `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `AI_MODEL_CAPABLE`, `AI_MONTHLY_BUDGET_PER_ORG`                                                                                                              | Deterministic mock provider, held to the same schema     |
| Email    | `EMAIL_PROVIDER`, `EMAIL_API_URL`, `EMAIL_API_KEY`                                                                                                                                               | Local provider; messages readable at `/dev/inbox`        |
| Storage  | `STORAGE_PROVIDER`, `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_SIGNED_URL_TTL_SECONDS`, `STORAGE_URL_SIGNING_SECRET` | Local adapter under `STORAGE_LOCAL_ROOT`                 |
| Billing  | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                                                                                                                                                     | Not built; entitlements come from plan defaults          |
| Errors   | `SENTRY_DSN`                                                                                                                                                                                     | Errors to stdout                                         |

`STORAGE_PROVIDER=s3` with any of its three credentials missing fails at startup naming
them, rather than on the first upload.

## Deploying to Vercel

The repository root hosts an unrelated project, so the CleanQuote app is not at
the root of the repo. Vercel needs to be told that once:

| Project setting          | Value                                     |
| ------------------------ | ----------------------------------------- |
| Root Directory           | `cleanquote`                              |
| Framework preset         | Next.js (detected)                        |
| Install / build / output | taken from `cleanquote/vercel.json`       |
| Node version             | 20 or later (`engines` requires >= 20.11) |

`vercel.json` builds through the workspace (`pnpm --filter @cleanquote/web run
build`) because the app compiles its sibling packages from source via
`transpilePackages`; there is no separate package build step to keep in sync.

```bash
vercel link --cwd cleanquote        # once, to create or attach the project
vercel env pull --cwd cleanquote    # optional, to work against the same config
vercel deploy --prod --cwd cleanquote
```

### Serverless changes four things

A Vercel deployment is many short-lived instances rather than one long-lived
process, and four parts of this application care:

**Local storage cannot be used.** The local adapter writes to the instance
filesystem. An upload would appear to succeed and the photo would be gone, or
missing from the very next request because it was served by a different
instance. `STORAGE_PROVIDER=s3` is required, with its endpoint and credentials.

**The local email provider cannot be used.** It records messages instead of
sending them, and `/dev/inbox` refuses to render in production because the
bodies contain single-use tokens. Nobody could confirm an address, so nobody
could sign in. `EMAIL_PROVIDER`, `EMAIL_API_URL` and `EMAIL_API_KEY` are
required.

**Rate limiting becomes per-instance.** `apps/web/lib/rate-limit.ts` holds a
fixed window in memory. Across N instances a caller gets N times the allowance,
which for the sign-in and public-proposal limits is the difference between a
control and a decoration. This needs a shared counter before the deployment is
exposed to the public internet.

**Connections have to go through a pooler.** Each instance opens its own
`node-postgres` pool. Point `DATABASE_URL` at a pooled endpoint — Supabase's
pgBouncer port, Neon's pooled host — and set `DATABASE_POOL_MAX` low (2 is
usually right for serverless). A direct connection string will exhaust the
server's connection limit under any real traffic.

The first two are checked at boot: a production deployment configured with the
local adapters refuses to serve the signed-in application and names the
variables it is missing, rather than presenting a product that half-works.
`ALLOW_LOCAL_ADAPTERS_IN_PRODUCTION=true` overrides that, and is only sensible
on a single machine you control — the end-to-end smoke run uses it.

The public proposal at `/p/[token]` deliberately keeps working when that check
fails: a client who already holds a link should not be told the supplier has a
configuration problem.

### What a deployment with nothing configured still does

A first deploy is useful before the database, mail and storage exist. These
routes need no configuration at all and are outside the guarded group:

| Route                        | What it does                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/demo` and `/demo/[caseId]` | Five worked pricing cases, priced live by the real engine from fixtures. Labelled as examples, not anybody's data. |
| `/sign-in`, `/register`      | Render. Submitting needs the database.                                                                             |
| `/`                          | Redirects to sign-in, or to the workspace once there is a session.                                                 |

`/dashboard` and everything behind it refuses, naming what is missing. That is
the intended first state of a deployment, not a broken one.

### Before the first deploy

1. Provision PostgreSQL 16 and apply `supabase/migrations` in filename order.
   Nothing applies them automatically.
2. Confirm the role behind `DATABASE_URL` can `set role authenticated`, and that
   a second role exists that bypasses RLS for `withSystem()` — on Supabase that
   is `service_role`.
3. Create a private storage bucket and add a policy restricting objects to the
   caller's organisation prefix. See [STORAGE.md](STORAGE.md).
4. Set `NEXT_PUBLIC_APP_URL` to the deployment's own URL. Proposal and
   verification links are built from it; leaving it at localhost sends clients a
   link to their own machine.

### What is still missing for a public deployment

Stated here rather than discovered later: distributed rate limiting, MFA, and a
sweep for `files.retention_expires_at`. See the known gaps in
[SECURITY.md](SECURITY.md).
