import { UploadRejectedError, uploadCaptureMedia } from '@cleanquote/workflow';
import { NextResponse } from 'next/server';

import { consumeRateLimit } from '@/lib/rate-limit';
import { hasPermission, requestContext, currentActor } from '@/lib/session';

export const runtime = 'nodejs';

/**
 * Photo upload.
 *
 * A route handler rather than a server action because the browser compresses
 * and thumbnails the image first and needs to retry individual uploads without
 * resubmitting a form. Everything a server action would check is checked here:
 * the session, the permission, the rate limit, and then the file itself.
 */
export async function POST(request: Request): Promise<Response> {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!hasPermission(actor, 'quote.edit')) {
    return NextResponse.json({ error: 'You cannot edit this quote.' }, { status: 403 });
  }

  const context = await requestContext();
  const limit = await consumeRateLimit(`upload:${actor.userId}:${context.ip ?? 'unknown'}`, {
    limit: 120,
    windowSeconds: 300,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many uploads at once. Wait a moment and try again.' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfterSeconds) } },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'That upload could not be read.' }, { status: 400 });
  }

  const file = form.get('file');
  const quoteId = String(form.get('quoteId') ?? '');
  const clientUploadId = String(form.get('clientUploadId') ?? '');
  if (!(file instanceof File) || !quoteId || !clientUploadId) {
    return NextResponse.json({ error: 'That upload was incomplete.' }, { status: 400 });
  }

  const thumbnail = form.get('thumbnail');

  try {
    const result = await uploadCaptureMedia({
      userId: actor.userId,
      organisationId: actor.organisationId,
      quoteId,
      spaceId: String(form.get('spaceId') ?? '') || null,
      clientUploadId,
      originalFilename: file.name || null,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      thumbnailBytes:
        thumbnail instanceof File ? new Uint8Array(await thumbnail.arrayBuffer()) : null,
      width: form.get('width') ? Number(form.get('width')) : null,
      height: form.get('height') ? Number(form.get('height')) : null,
      caption: String(form.get('caption') ?? '') || null,
      capturedAt: new Date(),
    });
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof UploadRejectedError) {
      return NextResponse.json({ error: error.message }, { status: 415 });
    }
    return NextResponse.json({ error: 'That upload could not be stored.' }, { status: 500 });
  }
}
