# Security

## Tenancy model

Every tenant-owned table carries `organisation_id` and has row level security **enabled
and forced**.

`FORCE` matters. Without it, the table owner — which includes migration connections and
any `SECURITY DEFINER` function owned by that role — bypasses policy silently. Enabling
RLS without forcing it is one of the most common ways a multi-tenant Postgres schema
leaks.

## Authorisation is on permissions, never role names

Roles are a convenience label over a permission set. No policy anywhere references a role
name, so an organisation can define its own roles without a code change.

```sql
public.is_org_member(organisation_id)          -- active membership
public.has_permission(organisation_id, code)   -- role grants + member grants - member revocations
```

Both are `SECURITY DEFINER` with `search_path` pinned to `public, pg_catalog`.

- **Definer rights** break the recursion a policy on `organisation_members` would
  otherwise hit when it queries `organisation_members`.
- **A pinned search_path** stops a caller redirecting an elevated function to their own
  schema objects.

Per-member grants and revocations layer over the role, and **revocation wins** — removing
a capability from one person is always decisive.

## Reads, writes and the difference between price and cost

Reads require active membership. Writes additionally require a specific permission.

Every UPDATE policy carries both `USING` and `WITH CHECK`. Without `WITH CHECK` a
permitted user could move a row into another organisation simply by updating
`organisation_id` — there is a test for exactly that.

Seeing a quote and seeing what it costs to deliver are different questions:

- `quote_calculation_snapshots` — the whole cost stack — is gated on `quote.view_cost`.
- The `quote_prices` view exposes price alone to holders of `quote.view_selling_price`.

The view applies its own tenant filter in its `WHERE` clause. A plain Postgres view runs
with the _owner's_ rights and does not apply the base table's RLS, so a view that relied
on the underlying policy would be a hole rather than a control.

## Public proposal links are not an RLS policy

The `anon` role holds **no table grants at all**. A client with a proposal link calls one
narrow `SECURITY DEFINER` function that:

- rejects tokens shorter than 32 characters outright,
- checks the token has not expired and has not been revoked,
- returns only client-facing fields.

Internal scenario names, cost, margin and labour hours are never in the projection. A
bearer token therefore cannot widen into table access, which is what would happen if the
same thing were expressed as an RLS policy on `proposals` for `anon`.

## Immutability

Two independent layers, because they defend against different things.

|                       | Tenant user                        | Service role / definer path   |
| --------------------- | ---------------------------------- | ----------------------------- |
| Calculation snapshots | RLS: no UPDATE or DELETE policy    | Trigger raises                |
| Audit records         | RLS: SELECT only, no INSERT policy | Trigger raises                |
| Sealed quote versions | RLS                                | Trigger raises on line writes |

Each layer is tested on its own terms. This matters more than it looks: **an UPDATE with
no matching policy affects zero rows rather than raising an error.** "No error" is not
evidence of anything, so the RLS-layer tests assert the data did not move, and the
trigger-layer tests assert the operation is refused for a role that bypasses RLS.

Audit rows are written only by definer-rights server functions. A tenant user cannot forge
one — there is no INSERT policy, and a test confirms the attempt is refused.

## Storage

Media lives at `<organisation_id>/<quote_id>/<file_id>`, so isolation is decided from the
path's first segment without a join. A database `CHECK` constraint on `files.storage_path`
enforces the prefix, and storage policies reuse the same permission helpers.

## Executable proof

`./supabase/test/run-db-tests.sh` applies every migration to a throwaway PostgreSQL
database and runs **41 assertions** as the real `authenticated` and `anon` roles with real
JWT claims. It runs in CI on every push.

What it proves:

- An estimator sees only her own organisation's clients, quotes, sites and rate cards —
  and isolation holds in both directions.
- A user cannot insert into another organisation, cannot move a row into one, and a delete
  aimed at another organisation's row affects nothing.
- An estimator without `quote.view_cost` cannot read the cost stack but can still read the
  selling price, and the price view leaks nothing across tenants.
- A user without `quote.override_margin` cannot record an override; a permitted user
  cannot record one under a colleague's identity; an override without a substantive
  reason is refused by the database.
- Snapshots and audit records survive both a tenant-user attack and an RLS-bypassing one.
- A sent quote version cannot gain new priced lines.
- Media is isolated by path prefix in both directions.
- Live proposal links resolve; expired, revoked, unknown and too-short tokens do not.
- An anonymous visitor has no table access at all.
- A suspended member loses access immediately; reactivation restores it; a signed-in user
  with no membership sees nothing anywhere.

## Application layer

- **Secrets.** `serverEnv()` throws if called in a browser bundle, so importing server
  configuration from a client component fails at build time rather than shipping a service
  key to every visitor. The Supabase anon key is publishable by design — it is useless
  without the policies behind it.
- **Input validation.** Every boundary parses through Zod (`packages/validation`). Money
  is validated as a decimal string; `z.number()` would accept a value that had already
  lost precision upstream.
- **AI output is untrusted input.** Nothing a model returns reaches the database or the
  engine before it parses. A confidence of 1.7, an invented compliance class, or an asset
  count asserted as a site total rather than a visible count all fail at the boundary.
- **HTTP headers.** CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy` and a `Permissions-Policy` are set in `next.config.mjs`. Camera is
  allowed on this origin only, for walkthrough capture; microphone and geolocation are
  denied outright.
- **Passwords.** scrypt at N=16384, r=8, p=1 with a 64-byte key. The work factor is stored
  in the hash string, so raising it later does not invalidate existing credentials —
  `needsRehash()` upgrades them on the next successful sign-in. Verification is
  constant-time and returns false on a malformed hash rather than throwing.
- **Tokens.** Sessions, invitations, email verification, password reset and proposal links
  are all 32 random bytes, base64url. Only the SHA-256 hash is stored. A database leak
  therefore yields no usable link, and the application itself cannot recover a proposal
  URL after issuing it — reissuing is the recovery path.
- **Sessions.** httpOnly, `SameSite=Lax`, `Secure` in production, with a sliding expiry
  once past halfway so an active user is not signed out mid-walkthrough while an abandoned
  session still ages out.
- **Account enumeration.** Sign-in hashes a dummy password when the address is unknown, so
  timing does not distinguish the two cases, and wrong-password and unknown-address return
  the same message. Password reset returns the same answer either way — including when the
  rate limit refuses it, because a limiter that says "slow down" to a stranger and "if that
  address has an account" to everyone else has just become an oracle.
- **Rate limiting.** Sign-in (per address _and_ per caller), password reset, AI extraction
  (per organisation — the model budget is the company's), uploads, proposal views and
  proposal decisions. Per-process, which is honest about its limits: behind more than one
  node it needs a shared counter. See [DEPLOYMENT.md](DEPLOYMENT.md).
- **Audit integrity.** Audit rows are written through `public.record_audit`, a SECURITY
  DEFINER function that stamps `auth.uid()` itself and refuses to write against an
  organisation the caller is not a member of. Opening an INSERT policy on `audit_logs`
  would have let a caller forge an actor; writing them in a separate privileged
  transaction would have lost atomicity with the change they describe. This does neither.
- **Media.** Keys are built, never accepted, and always begin with the organisation id —
  enforced independently by the key builder, a check constraint and the local adapter's
  containment check. Links are signed and expiring on every adapter, and the serving route
  additionally requires the key's organisation prefix to match the caller's active
  organisation, so a forwarded link cannot be replayed cross-tenant inside its window.
  Uploads are checked against a MIME allowlist _and_ the file's magic number.
- **The client proposal exposes no internal data.** `buildProposalContent` never reads
  margin, cost, contingency, strategy name, approval threshold or negotiation floor onto
  the object it returns, so there is nothing for a template bug to leak. An integration
  test asserts the absence of each of those terms in the serialised document.

## Known gaps

Stated plainly rather than implied by omission:

- **Rate limiting is per-process.** It is enough to stop one caller hammering an endpoint
  and not enough to coordinate across replicas. Behind more than one node it needs a
  shared counter (Redis, or Postgres if the traffic is modest).
- **The local media signing secret is generated per process when unset.** Correct for a
  single node, wrong across replicas. Set `STORAGE_URL_SIGNING_SECRET` explicitly, or run
  the hosted storage adapter.
- **There is no MFA and no password-breach check beyond a short embedded list.** Both are
  worth having before this holds anyone's real pricing.
- **`files.retention_expires_at` is not enforced by any job.** The column exists; nothing
  sweeps it yet.
- **Session revocation is per-session, not per-user.** Suspending a member cuts off access
  on their next request because membership is re-checked every time, but their other
  sessions are not explicitly torn down.
- **Penetration testing has not been performed.** The security tests prove the properties
  they assert; they are not a substitute for an adversarial review.
- **The compliance features identify, document and price regulatory requirements. They do
  not certify compliance,** and the schema enforces that: a compliance finding must carry
  `requiresHumanReview: true` or it fails validation.
