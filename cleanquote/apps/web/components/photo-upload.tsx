'use client';

import { useRef, useState } from 'react';

/**
 * Photo capture with browser-side compression.
 *
 * The phone that took the picture is the right place to shrink it: a twelve
 * megapixel photo is thirty times larger than anything a quotation needs, and
 * uploading the original over a site's mobile signal is the difference between
 * a walkthrough that finishes and one that does not.
 *
 * Each file gets a client-minted id that is resent on every retry, so a dropped
 * connection produces one photo rather than four. What this does *not* claim is
 * offline support: an upload that fails while the app is closed is not resumed,
 * and the UI says "will retry" only while the page is open.
 */

const MAX_EDGE = 1600;
const THUMBNAIL_EDGE = 320;
const QUALITY = 0.82;

type Status = 'queued' | 'compressing' | 'uploading' | 'stored' | 'duplicate' | 'failed';

interface Item {
  readonly id: string;
  readonly name: string;
  readonly status: Status;
  readonly message?: string;
  readonly previewUrl?: string;
}

const STATUS_LABEL: Record<Status, string> = {
  queued: 'Waiting',
  compressing: 'Preparing',
  uploading: 'Uploading',
  stored: 'Uploaded',
  duplicate: 'Already uploaded',
  failed: 'Not uploaded',
};

export function PhotoUpload({
  quoteId,
  spaceId,
}: {
  readonly quoteId: string;
  readonly spaceId?: string;
}) {
  const [items, setItems] = useState<readonly Item[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function update(id: string, patch: Partial<Item>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch, id, name: item.name } : item)),
    );
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return;

    // The id is minted before the row exists so that the upload, the retry and
    // the progress row all refer to the same thing. It is also what the server
    // deduplicates on.
    const queued = [...fileList].map((file) => ({
      file,
      id: crypto.randomUUID(),
    }));

    setItems((current) => [
      ...current,
      ...queued.map(({ file, id }) => ({
        id,
        name: file.name || 'Photo',
        status: 'queued' as Status,
      })),
    ]);

    // One at a time: a walkthrough on a weak signal finishes sooner in series
    // than it does with six uploads competing for the same connection.
    for (const { file, id } of queued) {
      await uploadOne(file, id);
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  async function uploadOne(file: File, id: string) {
    try {
      update(id, { status: 'compressing' });
      const [full, thumb] = await Promise.all([
        resize(file, MAX_EDGE, QUALITY),
        resize(file, THUMBNAIL_EDGE, 0.7),
      ]);

      const body = new FormData();
      body.set('quoteId', quoteId);
      if (spaceId) body.set('spaceId', spaceId);
      body.set('clientUploadId', id);
      body.set('file', full.blob, renameToJpeg(file.name));
      body.set('thumbnail', thumb.blob, `thumb-${renameToJpeg(file.name)}`);
      body.set('width', String(full.width));
      body.set('height', String(full.height));

      update(id, { status: 'uploading', previewUrl: URL.createObjectURL(thumb.blob) });

      // Two attempts, then stop and say so. Retrying forever hides a real
      // failure behind a spinner.
      const response = await postWithRetry(body, 2);
      if (response.ok) {
        update(id, { status: response.status === 200 ? 'duplicate' : 'stored' });
        return;
      }

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      update(id, {
        status: 'failed',
        message: payload.error ?? 'The server refused this upload.',
      });
    } catch (error) {
      update(id, {
        status: 'failed',
        message: error instanceof Error ? error.message : 'Something went wrong.',
      });
    }
  }

  return (
    <div className="photo-upload">
      <label className="button button-quiet" htmlFor="photo-input">
        Add photos
      </label>
      <input
        id="photo-input"
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        capture="environment"
        className="visually-hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      {items.length > 0 && (
        <ul className="upload-list" aria-live="polite">
          {items.map((item) => (
            <li key={item.id} className={`upload upload-${item.status}`}>
              {item.previewUrl && (
                <img src={item.previewUrl} alt="" width={48} height={48} loading="lazy" />
              )}
              <span className="upload-name">{item.name}</span>
              <span className="upload-status">{STATUS_LABEL[item.status]}</span>
              {item.message && <span className="faint">{item.message}</span>}
            </li>
          ))}
        </ul>
      )}

      <p className="faint">
        Photos are compressed on this device before they are sent. They are stored against this
        quote only, and are not shown to a client unless you choose to include one.
      </p>
    </div>
  );
}

async function postWithRetry(body: FormData, attempts: number): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch('/api/uploads', { method: 'POST', body });
      // A refusal is an answer, not a network failure. Retrying a 415 just
      // sends the same unacceptable file again.
      if (response.status < 500) return response;
      lastError = new Error(`Server error ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error('Upload failed.');
}

interface Resized {
  blob: Blob;
  width: number;
  height: number;
}

async function resize(file: File, maxEdge: number, quality: number): Promise<Resized> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot prepare images for upload.');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob) throw new Error('This browser could not compress the photo.');
  return { blob, width, height };
}

/** Re-encoding to JPEG means the extension has to follow, or the type is a lie. */
function renameToJpeg(name: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'photo';
  return `${base}.jpg`;
}
