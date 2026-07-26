import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';

import { serverEnv } from '@cleanquote/config';

/**
 * Captured media storage.
 *
 * Two things this module is responsible for and nothing else is:
 *
 *  1. **The path carries the tenant.** Every key begins with the organisation id
 *     — `<organisation>/<quote>/<file>` — which the database enforces with a
 *     check constraint and an object-storage policy can enforce on the prefix
 *     alone. A caller cannot construct a key for another tenant through this
 *     interface, because it never accepts a raw path.
 *  2. **Links expire.** Media is never served from a guessable public URL. The
 *     local adapter signs and dates its links the same way the hosted one does,
 *     so the expiry behaviour under test is the behaviour in production.
 *
 * With no storage credentials configured the local adapter writes under
 * `STORAGE_LOCAL_ROOT`. That is a working state, not a stub: uploads, thumbnails,
 * expiring links and deletion all behave identically. Production activation is
 * `STORAGE_PROVIDER=s3` plus the endpoint and key pair — see
 * `docs/STORAGE.md`.
 */

export interface StoredObject {
  readonly key: string;
  readonly byteSize: number;
  readonly checksum: string;
}

/**
 * Bytes backed by a plain ArrayBuffer rather than a possibly-shared one.
 *
 * `fetch` will not take a view over a SharedArrayBuffer, and widening to
 * `Uint8Array` would put that check at the call site of every adapter instead
 * of here once.
 */
export type Bytes = Uint8Array<ArrayBuffer>;

export interface StorageAdapter {
  readonly name: string;
  put(key: string, body: Bytes, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Bytes | undefined>;
  remove(key: string): Promise<void>;
  /** A time-limited link. Never a permanent one, on any adapter. */
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
}

export class StorageKeyError extends Error {}

/**
 * Builds a key that cannot escape its organisation.
 *
 * Identifiers are checked against a strict pattern rather than escaped: every
 * component here is a UUID or a generated suffix, so anything that is not one is
 * a bug or an attack, and neither should be quietly normalised into a valid
 * path.
 */
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export function storageKey(parts: {
  organisationId: string;
  quoteId?: string | null;
  fileId: string;
  variant?: 'original' | 'thumbnail';
  extension: string;
}): string {
  for (const value of [parts.organisationId, parts.quoteId ?? 'unfiled', parts.fileId]) {
    if (!ID_PATTERN.test(value))
      throw new StorageKeyError(`Refusing to build a key from ${value}.`);
  }
  const extension =
    parts.extension
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase()
      .slice(0, 8) || 'bin';
  const suffix = parts.variant === 'thumbnail' ? '-thumb' : '';
  return `${parts.organisationId}/${parts.quoteId ?? 'unfiled'}/${parts.fileId}${suffix}.${extension}`;
}

export function checksumOf(body: Bytes): string {
  return createHash('sha256').update(body).digest('hex');
}

// ---------------------------------------------------------------------------
// Local adapter
// ---------------------------------------------------------------------------

let localSigningSecret: string | undefined;

function signingSecret(): string {
  const configured = serverEnv().STORAGE_URL_SIGNING_SECRET;
  if (configured) return configured;
  // A per-process secret is adequate for a single local node and means one less
  // thing to configure before the product runs. It is not adequate across
  // replicas, which is why production runs on the hosted adapter.
  localSigningSecret ??= randomUUID();
  return localSigningSecret;
}

export function signLocalKey(key: string, expiresAt: number): string {
  return createHmac('sha256', signingSecret()).update(`${key}:${expiresAt}`).digest('hex');
}

/** Verifies a local media link. Returns the key only when the signature and expiry both hold. */
export function verifyLocalSignature(key: string, expiresAt: number, signature: string): boolean {
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return false;
  const expected = Buffer.from(signLocalKey(key, expiresAt));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export class LocalStorageAdapter implements StorageAdapter {
  readonly name = 'local';

  constructor(private readonly root: string) {}

  private pathFor(key: string): string {
    // Resolve then confirm containment: a key that normalises outside the root
    // must fail loudly rather than write somewhere surprising.
    const target = resolve(join(this.root, normalize(key)));
    const base = resolve(this.root);
    if (target !== base && !target.startsWith(base + sep)) {
      throw new StorageKeyError('That storage key resolves outside the storage root.');
    }
    return target;
  }

  async put(key: string, body: Bytes, _contentType: string): Promise<StoredObject> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return { key, byteSize: body.byteLength, checksum: checksumOf(body) };
  }

  async get(key: string): Promise<Bytes | undefined> {
    try {
      return new Uint8Array(await readFile(this.pathFor(key)));
    } catch {
      return undefined;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const signature = signLocalKey(key, expiresAt);
    const query = new URLSearchParams({ key, expires: String(expiresAt), signature });
    return `/api/media?${query.toString()}`;
  }
}

// ---------------------------------------------------------------------------
// S3-compatible adapter
// ---------------------------------------------------------------------------

/**
 * Any S3-compatible endpoint, Supabase Storage included.
 *
 * Requests are signed with SigV4 by hand rather than by pulling in the AWS SDK:
 * this needs four operations, and the SDK is thirty megabytes of dependency for
 * them.
 */
const EMPTY: Bytes = new Uint8Array(new ArrayBuffer(0));

export class S3StorageAdapter implements StorageAdapter {
  readonly name = 's3';

  constructor(
    private readonly config: {
      endpoint: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
    },
  ) {}

  private url(key: string): string {
    return `${this.config.endpoint.replace(/\/$/, '')}/${this.config.bucket}/${key}`;
  }

  async put(key: string, body: Bytes, contentType: string): Promise<StoredObject> {
    const response = await fetch(this.url(key), {
      method: 'PUT',
      headers: {
        'content-type': contentType,
        ...this.authHeaders('PUT', key, body),
      },
      body,
    });
    if (!response.ok) {
      throw new Error(`Storage rejected the upload: ${response.status} ${response.statusText}`);
    }
    return { key, byteSize: body.byteLength, checksum: checksumOf(body) };
  }

  async get(key: string): Promise<Bytes | undefined> {
    const response = await fetch(this.url(key), {
      headers: this.authHeaders('GET', key, EMPTY),
    });
    if (!response.ok) return undefined;
    return new Uint8Array(await response.arrayBuffer());
  }

  async remove(key: string): Promise<void> {
    await fetch(this.url(key), {
      method: 'DELETE',
      headers: this.authHeaders('DELETE', key, EMPTY),
    });
  }

  async signedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const signature = createHmac('sha256', this.config.secretAccessKey)
      .update(`GET\n${this.config.bucket}/${key}\n${expiresAt}`)
      .digest('hex');
    const query = new URLSearchParams({
      'X-Signature': signature,
      'X-Expires': String(expiresAt),
      'X-Key-Id': this.config.accessKeyId,
    });
    return `${this.url(key)}?${query.toString()}`;
  }

  private authHeaders(method: string, key: string, body: Bytes): Record<string, string> {
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const payloadHash = checksumOf(body);
    const scope = `${timestamp.slice(0, 8)}/${this.config.region}/s3/aws4_request`;
    const canonical = [
      method,
      `/${this.config.bucket}/${key}`,
      '',
      `host:${new URL(this.config.endpoint).host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${timestamp}`,
      '',
      'host;x-amz-content-sha256;x-amz-date',
      payloadHash,
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      timestamp,
      scope,
      createHash('sha256').update(canonical).digest('hex'),
    ].join('\n');

    let signingKey = createHmac('sha256', `AWS4${this.config.secretAccessKey}`)
      .update(timestamp.slice(0, 8))
      .digest();
    for (const part of [this.config.region, 's3', 'aws4_request']) {
      signingKey = createHmac('sha256', signingKey).update(part).digest();
    }
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    return {
      'x-amz-date': timestamp,
      'x-amz-content-sha256': payloadHash,
      authorization:
        `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, ` +
        `SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

let adapter: StorageAdapter | undefined;

export function configureStorage(next: StorageAdapter): void {
  adapter = next;
}

export function getStorage(): StorageAdapter {
  if (adapter) return adapter;
  const env = serverEnv();

  if (env.STORAGE_PROVIDER === 's3') {
    if (!env.STORAGE_ENDPOINT || !env.STORAGE_ACCESS_KEY_ID || !env.STORAGE_SECRET_ACCESS_KEY) {
      throw new Error(
        'STORAGE_PROVIDER is s3 but STORAGE_ENDPOINT, STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY are not all set.',
      );
    }
    adapter = new S3StorageAdapter({
      endpoint: env.STORAGE_ENDPOINT,
      region: env.STORAGE_REGION,
      bucket: env.STORAGE_BUCKET,
      accessKeyId: env.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
    });
    return adapter;
  }

  adapter = new LocalStorageAdapter(env.STORAGE_LOCAL_ROOT);
  return adapter;
}

export function signedUrlTtlSeconds(): number {
  return serverEnv().STORAGE_SIGNED_URL_TTL_SECONDS;
}
