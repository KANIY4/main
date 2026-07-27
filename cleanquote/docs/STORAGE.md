# Storage architecture

Where captured media lives, how it is isolated between tenants, and what the offline story
actually is.

## The two invariants

**The path carries the tenant.** Every key is `<organisation>/<quote>/<file>.<ext>`. Three
independent things enforce it:

1. `storageKey()` builds keys and never accepts a raw path. Each identifier is checked
   against `^[a-zA-Z0-9_-]{1,64}$`, so a traversal sequence is refused rather than
   normalised into something valid.
2. `files.storage_path` carries a check constraint requiring the organisation prefix.
3. The local adapter resolves and then confirms containment within its root. An
   object-storage policy can enforce the same thing on the prefix alone.

**Links expire.** There is no permanent or guessable URL for captured media on either
adapter. The local adapter signs `key:expiresAt` with HMAC-SHA256 and the serving route
verifies the signature, the expiry _and_ that the key's organisation prefix matches the
caller's active organisation — so a forwarded link cannot be replayed by a member of
another tenant even inside its window.

## Adapters

| Provider          | When                              | Notes                                                                                                                             |
| ----------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `local` (default) | No storage credentials configured | Writes under `STORAGE_LOCAL_ROOT`. Uploads, thumbnails, expiring links and deletion all behave identically to the hosted adapter. |
| `s3`              | `STORAGE_PROVIDER=s3`             | Any S3-compatible endpoint, Supabase Storage included. SigV4 signed by hand — four operations do not justify the AWS SDK.         |

The local adapter is a working mode, not a stub. That is deliberate: the product has to run
before anyone has a storage account, and the behaviour under test has to be the behaviour
in production.

### Activating hosted storage

```bash
STORAGE_PROVIDER=s3
STORAGE_ENDPOINT=https://<project>.supabase.co/storage/v1/s3
STORAGE_REGION=ap-southeast-2
STORAGE_BUCKET=capture
STORAGE_ACCESS_KEY_ID=…
STORAGE_SECRET_ACCESS_KEY=…
STORAGE_SIGNED_URL_TTL_SECONDS=600
```

Missing any of the three credential variables while `STORAGE_PROVIDER=s3` fails at startup
with a message naming them, rather than on the first upload.

Create the bucket as **private**, and add a storage policy restricting objects to the
prefix of the caller's organisation. The application never relies on that policy alone —
it is the third line of defence behind the key builder and the check constraint — but a
misconfigured bucket should not be the only thing standing between two tenants.

### The local signing secret

`STORAGE_URL_SIGNING_SECRET` signs local media links. Unset, a secret is generated per
process: adequate for one node, wrong across replicas, which is one of several reasons
production runs on the hosted adapter. Set it explicitly if you run more than one local
instance.

## Compression and thumbnails

Both happen **in the browser**, before the bytes are sent.

A phone that has just taken a twelve-megapixel photo is the right place to downscale it: a
walkthrough on a site's mobile signal is the difference between a capture session that
finishes and one that does not. It is also the only place available without adding a native
image dependency to the server, and that trade is worth naming rather than hiding.

The consequence is that the server cannot trust what arrives. It checks:

- the declared MIME type against a three-entry allowlist (JPEG, PNG, WebP);
- the leading bytes against that type's magic number, so a renamed file is refused;
- the size (8 MB for an image, 512 KB for a thumbnail) — after browser-side compression,
  anything larger is not a site photo.

## Retries and duplicates

The browser mints a `clientUploadId` per capture and resends it on every retry. The server
returns the existing record instead of creating a second one, and a partial unique index on
`(organisation_id, client_upload_id)` guarantees it even if two retries race.

Retries stop after two attempts. A 4xx is an answer, not a network failure — re-sending a
415 just offers the same unacceptable file again — so only 5xx and transport errors are
retried at all.

## Consent, deletion and evidence

Showing a photo to a client and keeping it as evidence are separate decisions:

- `allow_in_proposal` defaults to **false**. A photo is never client-facing by accident.
- Removing an image from a proposal leaves the evidence intact.
- Deleting removes the bytes from storage, keeps the row with `deleted_at`, and writes an
  audit entry naming who did it and why.

That last point is the one that matters six months later, when somebody asks where the
photo of the loading dock went.

## What the offline support actually is

The application is installable and registers a service worker. **The worker caches the
shell and nothing else.**

- It never caches `/api/*` — a cached quote query is a stale price.
- It never replays a POST — a replayed submission is a duplicate quote.
- It does not queue uploads for later.

Navigating with no signal shows `/offline`, which says plainly that nothing in flight was
saved. This is deliberate: background sync of captured work involves real conflict-
resolution questions that nobody has designed answers to yet, and an estimator who believes
a walkthrough was saved offline and finds it gone has lost an afternoon. The product will
claim offline-first when conflict handling and upload recovery are built and tested, and
not before.

## Retention

`files.retention_expires_at` exists in the schema and is not yet enforced by any job. When
a retention policy is implemented it should soft-delete through the same path as a manual
deletion, so the audit trail reads the same either way.
