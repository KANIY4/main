import { auditStore, mediaStore, withUser } from '@cleanquote/database';
import {
  checksumOf,
  getStorage,
  signedUrlTtlSeconds,
  storageKey,
  type Bytes,
} from '@cleanquote/storage';
import { randomUUID } from 'node:crypto';

/**
 * Photo capture.
 *
 * Compression and thumbnailing happen in the browser before the bytes are sent:
 * a phone that has just taken a twelve-megapixel photo is the right place to
 * downscale it, and it means a walkthrough on a weak connection uploads what it
 * needs to rather than what the camera produced. The server's job is to check
 * what arrived, store it under a tenant-prefixed key, and index it.
 */

/** Deliberately narrow. Anything not on this list is refused, not sanitised. */
const ACCEPTED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** After browser-side compression, a site photo has no business being larger. */
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 512 * 1024;

export class UploadRejectedError extends Error {}

export interface UploadInput {
  readonly userId: string;
  readonly organisationId: string;
  readonly quoteId: string;
  readonly spaceId?: string | null;
  readonly clientUploadId: string;
  readonly originalFilename: string | null;
  readonly mimeType: string;
  readonly bytes: Bytes;
  readonly thumbnailBytes?: Bytes | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly caption?: string | null;
  readonly capturedAt?: Date | null;
}

export interface UploadResult {
  readonly fileId: string;
  /** True when this upload matched one already stored, rather than creating a second copy. */
  readonly duplicate: boolean;
}

export async function uploadCaptureMedia(input: UploadInput): Promise<UploadResult> {
  const extension = ACCEPTED_TYPES[input.mimeType];
  if (!extension) {
    throw new UploadRejectedError(
      `${input.mimeType} is not an image type we accept. Use JPEG, PNG or WebP.`,
    );
  }
  if (input.bytes.byteLength === 0) {
    throw new UploadRejectedError('That file was empty.');
  }
  if (input.bytes.byteLength > MAX_BYTES) {
    throw new UploadRejectedError(
      'That image is larger than 8 MB even after compression. Try again, or take a new photo.',
    );
  }
  if (input.thumbnailBytes && input.thumbnailBytes.byteLength > MAX_THUMBNAIL_BYTES) {
    throw new UploadRejectedError('That thumbnail is implausibly large; the upload was refused.');
  }
  if (!looksLikeImage(input.bytes, input.mimeType)) {
    // The declared type is a claim by the client. The leading bytes are not.
    throw new UploadRejectedError('That file does not contain the image type it claims to.');
  }

  return withUser(input.userId, async (db) => {
    const existing = await mediaStore.findByClientUploadId(
      db,
      input.organisationId,
      input.clientUploadId,
    );
    if (existing) return { fileId: existing.id, duplicate: true };

    const fileId = randomUUID();
    const storage = getStorage();

    const key = storageKey({
      organisationId: input.organisationId,
      quoteId: input.quoteId,
      fileId,
      extension,
    });
    const stored = await storage.put(key, input.bytes, input.mimeType);

    let thumbnailPath: string | null = null;
    if (input.thumbnailBytes && input.thumbnailBytes.byteLength > 0) {
      thumbnailPath = storageKey({
        organisationId: input.organisationId,
        quoteId: input.quoteId,
        fileId,
        variant: 'thumbnail',
        extension,
      });
      await storage.put(thumbnailPath, input.thumbnailBytes, input.mimeType);
    }

    await mediaStore.createFile(db, {
      id: fileId,
      organisationId: input.organisationId,
      quoteId: input.quoteId,
      spaceId: input.spaceId ?? null,
      storagePath: stored.key,
      thumbnailPath,
      kind: 'photo',
      mimeType: input.mimeType,
      byteSize: stored.byteSize,
      originalFilename: input.originalFilename,
      checksum: stored.checksum,
      width: input.width ?? null,
      height: input.height ?? null,
      caption: input.caption ?? null,
      clientUploadId: input.clientUploadId,
      capturedAt: input.capturedAt ?? null,
      uploadedByUserId: input.userId,
    });

    await auditStore.writeAudit(db, {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: 'quote.photo_uploaded',
      entityType: 'quote',
      entityId: input.quoteId,
      after: { fileId, bytes: stored.byteSize, checksum: stored.checksum },
    });

    return { fileId, duplicate: false };
  });
}

/**
 * Magic-number check.
 *
 * Not a full parse — it is a cheap refusal of the obvious case where a file is
 * renamed to get past a type filter. The storage layer never executes what it
 * holds, so this is defence in depth rather than the only defence.
 */
function looksLikeImage(bytes: Bytes, mimeType: string): boolean {
  const [a, b, c, d] = [bytes[0], bytes[1], bytes[2], bytes[3]];
  if (mimeType === 'image/jpeg') return a === 0xff && b === 0xd8;
  if (mimeType === 'image/png') return a === 0x89 && b === 0x50 && c === 0x4e && d === 0x47;
  if (mimeType === 'image/webp') {
    return a === 0x52 && b === 0x49 && c === 0x46 && d === 0x46;
  }
  return false;
}

export async function listQuoteMedia(userId: string, quoteId: string) {
  return withUser(userId, async (db) => mediaStore.listQuoteFiles(db, quoteId));
}

/** A time-limited link. There is no permanent URL for captured media on any adapter. */
export async function mediaLink(
  userId: string,
  fileId: string,
  variant: 'original' | 'thumbnail' = 'original',
): Promise<string | undefined> {
  const file = await withUser(userId, async (db) => mediaStore.getFile(db, fileId));
  if (!file) return undefined;
  const key =
    variant === 'thumbnail' ? (file.thumbnail_path ?? file.storage_path) : file.storage_path;
  return getStorage().signedUrl(key, signedUrlTtlSeconds());
}

export async function setMediaProposalVisibility(input: {
  userId: string;
  organisationId: string;
  fileId: string;
  allow: boolean;
}): Promise<void> {
  await withUser(input.userId, async (db) => {
    await mediaStore.setProposalVisibility(db, input.fileId, input.allow);
    await auditStore.writeAudit(db, {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: input.allow ? 'quote.photo_shown_to_client' : 'quote.photo_hidden_from_client',
      entityType: 'file',
      entityId: input.fileId,
      after: { allowInProposal: input.allow },
    });
  });
}

/**
 * Removes a photo from the record.
 *
 * The row is retained with a deletion timestamp and the bytes are removed from
 * storage. Keeping the row is what lets someone answer "there used to be a photo
 * of the loading dock — where did it go?" six months later, and the audit entry
 * names who removed it.
 */
export async function deleteMedia(input: {
  userId: string;
  organisationId: string;
  fileId: string;
  reason: string | null;
}): Promise<void> {
  await withUser(input.userId, async (db) => {
    const file = await mediaStore.getFile(db, input.fileId);
    if (!file) return;

    await mediaStore.softDeleteFile(db, input.fileId);
    await auditStore.writeAudit(db, {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: 'quote.photo_deleted',
      entityType: 'file',
      entityId: input.fileId,
      before: { storagePath: file.storage_path, checksum: file.checksum },
      reason: input.reason,
    });

    const storage = getStorage();
    await storage.remove(file.storage_path);
    if (file.thumbnail_path) await storage.remove(file.thumbnail_path);
  });
}

export { checksumOf };
