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
