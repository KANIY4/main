import { many, one, type Queryable } from './client';

/**
 * Captured media records.
 *
 * The bytes live in object storage; this is the index over them. Deletion is
 * soft by default because a photo is evidence for a price that may be argued
 * about a year later — the row survives, and removing an image from a proposal
 * is a separate act from destroying it.
 */

export interface FileRow {
  id: string;
  quote_id: string | null;
  space_id: string | null;
  storage_path: string;
  thumbnail_path: string | null;
  kind: string;
  mime_type: string;
  byte_size: string;
  original_filename: string | null;
  caption: string | null;
  checksum: string | null;
  width: number | null;
  height: number | null;
  allow_in_proposal: boolean;
  exclude_from_ai: boolean;
  ai_processing_status: string;
  client_upload_id: string | null;
  captured_at: Date | null;
  created_at: Date;
}

const COLUMNS = `id, quote_id, space_id, storage_path, thumbnail_path, kind, mime_type,
                 byte_size::text as byte_size, original_filename, caption, checksum,
                 width, height, allow_in_proposal, exclude_from_ai, ai_processing_status,
                 client_upload_id, captured_at, created_at`;

export async function listQuoteFiles(db: Queryable, quoteId: string): Promise<FileRow[]> {
  return many<FileRow>(
    db,
    `select ${COLUMNS} from public.files
     where quote_id = $1 and deleted_at is null
     order by created_at desc`,
    [quoteId],
  );
}

export async function getFile(db: Queryable, fileId: string): Promise<FileRow | undefined> {
  return one<FileRow>(
    db,
    `select ${COLUMNS} from public.files where id = $1 and deleted_at is null`,
    [fileId],
  );
}

/**
 * Finds an existing record for a retried upload.
 *
 * The client mints an id per capture and resends it on every retry, so a flaky
 * connection produces one photo rather than four. The partial unique index on
 * `(organisation_id, client_upload_id)` is what actually guarantees it; this
 * lookup just lets the caller return the original instead of hitting the
 * constraint.
 */
export async function findByClientUploadId(
  db: Queryable,
  organisationId: string,
  clientUploadId: string,
): Promise<FileRow | undefined> {
  return one<FileRow>(
    db,
    `select ${COLUMNS} from public.files
     where organisation_id = $1 and client_upload_id = $2 and deleted_at is null`,
    [organisationId, clientUploadId],
  );
}

export async function createFile(
  db: Queryable,
  input: {
    id: string;
    organisationId: string;
    quoteId: string | null;
    spaceId: string | null;
    storagePath: string;
    thumbnailPath: string | null;
    kind: string;
    mimeType: string;
    byteSize: number;
    originalFilename: string | null;
    checksum: string;
    width: number | null;
    height: number | null;
    caption: string | null;
    clientUploadId: string | null;
    capturedAt: Date | null;
    uploadedByUserId: string;
  },
): Promise<string> {
  const row = await one<{ id: string }>(
    db,
    `insert into public.files
       (id, organisation_id, quote_id, space_id, storage_path, thumbnail_path, kind, mime_type,
        byte_size, original_filename, checksum, width, height, caption, client_upload_id,
        captured_at, uploaded_by_user_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     returning id`,
    [
      input.id,
      input.organisationId,
      input.quoteId,
      input.spaceId,
      input.storagePath,
      input.thumbnailPath,
      input.kind,
      input.mimeType,
      input.byteSize,
      input.originalFilename,
      input.checksum,
      input.width,
      input.height,
      input.caption,
      input.clientUploadId,
      input.capturedAt,
      input.uploadedByUserId,
    ],
  );
  if (!row) throw new Error('Failed to record the uploaded file.');
  return row.id;
}

/** Consent for the client proposal, separate from whether the evidence is kept. */
export async function setProposalVisibility(
  db: Queryable,
  fileId: string,
  allow: boolean,
): Promise<void> {
  await db.query(`update public.files set allow_in_proposal = $2 where id = $1`, [fileId, allow]);
}

export async function softDeleteFile(db: Queryable, fileId: string): Promise<void> {
  await db.query(`update public.files set deleted_at = now() where id = $1`, [fileId]);
}

export async function listProposalFiles(db: Queryable, quoteId: string): Promise<FileRow[]> {
  return many<FileRow>(
    db,
    `select ${COLUMNS} from public.files
     where quote_id = $1 and deleted_at is null and allow_in_proposal
     order by created_at`,
    [quoteId],
  );
}
