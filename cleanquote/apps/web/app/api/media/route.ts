import { getStorage, verifyLocalSignature } from '@cleanquote/storage';
import { NextResponse } from 'next/server';

import { currentActor } from '@/lib/session';

/**
 * Serves locally stored media behind a signed, expiring link.
 *
 * Two independent checks, because either alone would be wrong: the signature
 * proves the link was issued by this application and has not expired, and the
 * organisation prefix on the key is compared against the caller's active
 * organisation, so a forwarded link cannot be replayed by a member of another
 * tenant inside its expiry window.
 *
 * The hosted adapter issues links signed by the storage service instead, and
 * this route is never used.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const expires = Number(url.searchParams.get('expires'));
  const signature = url.searchParams.get('signature');

  if (!key || !signature || !Number.isFinite(expires)) {
    return new NextResponse('Not found', { status: 404 });
  }
  if (!verifyLocalSignature(key, expires, signature)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const actor = await currentActor();
  if (!actor || !key.startsWith(`${actor.organisationId}/`)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const bytes = await getStorage().get(key);
  if (!bytes) return new NextResponse('Not found', { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'content-type': contentTypeFor(key),
      // Private and short-lived: this is site evidence, not a public asset.
      'cache-control': 'private, max-age=60',
      'content-security-policy': "default-src 'none'; sandbox",
      'x-content-type-options': 'nosniff',
    },
  });
}

function contentTypeFor(key: string): string {
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}
