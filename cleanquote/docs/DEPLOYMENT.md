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
