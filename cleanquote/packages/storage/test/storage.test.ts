import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  LocalStorageAdapter,
  StorageKeyError,
  checksumOf,
  signLocalKey,
  storageKey,
  verifyLocalSignature,
  type Bytes,
} from '../src/index';

function bytes(text: string): Bytes {
  const encoded = new TextEncoder().encode(text);
  const copy = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  copy.set(encoded);
  return copy;
}

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const QUOTE = '33333333-3333-4333-8333-333333333333';
const FILE = '44444444-4444-4444-8444-444444444444';

describe('storage keys', () => {
  it('prefixes every key with the organisation that owns it', () => {
    const key = storageKey({ organisationId: ORG, quoteId: QUOTE, fileId: FILE, extension: 'jpg' });
    expect(key).toBe(`${ORG}/${QUOTE}/${FILE}.jpg`);
  });

  it('gives a thumbnail its own key rather than overwriting the original', () => {
    const original = storageKey({ organisationId: ORG, fileId: FILE, extension: 'jpg' });
    const thumbnail = storageKey({
      organisationId: ORG,
      fileId: FILE,
      variant: 'thumbnail',
      extension: 'jpg',
    });
    expect(thumbnail).not.toBe(original);
    expect(thumbnail).toContain('-thumb');
  });

  it('files a quoteless upload under the organisation rather than at the root', () => {
    const key = storageKey({ organisationId: ORG, quoteId: null, fileId: FILE, extension: 'png' });
    expect(key.startsWith(`${ORG}/`)).toBe(true);
  });

  it('refuses an identifier containing a path separator', () => {
    expect(() =>
      storageKey({ organisationId: `${ORG}/../${OTHER_ORG}`, fileId: FILE, extension: 'jpg' }),
    ).toThrow(StorageKeyError);
  });

  it('refuses a traversal sequence in the quote identifier', () => {
    expect(() =>
      storageKey({ organisationId: ORG, quoteId: '../..', fileId: FILE, extension: 'jpg' }),
    ).toThrow(StorageKeyError);
  });

  it('reduces a hostile extension to something short and inert', () => {
    const key = storageKey({
      organisationId: ORG,
      fileId: FILE,
      extension: '../../etc/passwd',
    });
    // Separators gone, length capped: whatever survives cannot address a
    // second path segment.
    expect(key).toBe(`${ORG}/unfiled/${FILE}.etcpassw`);
  });

  it('falls back to a neutral extension when nothing usable survives', () => {
    const key = storageKey({ organisationId: ORG, fileId: FILE, extension: '../' });
    expect(key.endsWith('.bin')).toBe(true);
  });
});

describe('local storage adapter', () => {
  let root: string;
  let adapter: LocalStorageAdapter;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cq-storage-'));
    adapter = new LocalStorageAdapter(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stores the bytes it was given, unchanged', async () => {
    const key = storageKey({ organisationId: ORG, quoteId: QUOTE, fileId: FILE, extension: 'jpg' });
    const body = bytes('photograph');

    const stored = await adapter.put(key, body, 'image/jpeg');

    expect(stored.byteSize).toBe(body.byteLength);
    expect(await readFile(join(root, key), 'utf8')).toBe('photograph');
  });

  it('reports a checksum that changes when a single byte does', async () => {
    expect(checksumOf(bytes('photograph'))).not.toBe(checksumOf(bytes('photograpi')));
  });

  it('returns undefined for a key that was never written', async () => {
    expect(await adapter.get(`${ORG}/${QUOTE}/missing.jpg`)).toBeUndefined();
  });

  it('refuses to read outside its root', async () => {
    await expect(adapter.get('../../../etc/passwd')).resolves.toBeUndefined();
    await expect(adapter.put('../escape.jpg', bytes('x'), 'image/jpeg')).rejects.toThrow(
      StorageKeyError,
    );
  });

  it('removes the bytes when a file is deleted', async () => {
    const key = storageKey({ organisationId: ORG, quoteId: QUOTE, fileId: FILE, extension: 'jpg' });
    await adapter.put(key, bytes('photograph'), 'image/jpeg');

    await adapter.remove(key);

    expect(await adapter.get(key)).toBeUndefined();
  });
});

describe('signed media links', () => {
  it('accepts a signature it issued for a link that has not expired', () => {
    const key = `${ORG}/${QUOTE}/${FILE}.jpg`;
    const expiresAt = Math.floor(Date.now() / 1000) + 600;

    expect(verifyLocalSignature(key, expiresAt, signLocalKey(key, expiresAt))).toBe(true);
  });

  it('rejects a signature for a different key', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 600;
    const signature = signLocalKey(`${ORG}/${QUOTE}/${FILE}.jpg`, expiresAt);

    expect(verifyLocalSignature(`${OTHER_ORG}/${QUOTE}/${FILE}.jpg`, expiresAt, signature)).toBe(
      false,
    );
  });

  it('rejects a link whose expiry has passed', () => {
    const key = `${ORG}/${QUOTE}/${FILE}.jpg`;
    const expiresAt = Math.floor(Date.now() / 1000) - 1;

    expect(verifyLocalSignature(key, expiresAt, signLocalKey(key, expiresAt))).toBe(false);
  });

  it('rejects an expiry extended without re-signing', () => {
    const key = `${ORG}/${QUOTE}/${FILE}.jpg`;
    const issuedFor = Math.floor(Date.now() / 1000) + 60;
    const signature = signLocalKey(key, issuedFor);

    expect(verifyLocalSignature(key, issuedFor + 86_400, signature)).toBe(false);
  });

  it('rejects a signature of the wrong length without throwing', () => {
    const key = `${ORG}/${QUOTE}/${FILE}.jpg`;
    const expiresAt = Math.floor(Date.now() / 1000) + 600;

    expect(verifyLocalSignature(key, expiresAt, 'short')).toBe(false);
  });

  it('issues a link that carries the key, the expiry and the signature', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cq-storage-'));
    try {
      const key = `${ORG}/${QUOTE}/${FILE}.jpg`;
      const url = await new LocalStorageAdapter(root).signedUrl(key, 600);
      const params = new URLSearchParams(url.split('?')[1] ?? '');

      expect(params.get('key')).toBe(key);
      expect(
        verifyLocalSignature(key, Number(params.get('expires')), params.get('signature') ?? ''),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
