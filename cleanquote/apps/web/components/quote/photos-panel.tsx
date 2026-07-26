import type { mediaStore } from '@cleanquote/database';

import { InlineForm } from '@/components/form';
import { PhotoUpload } from '@/components/photo-upload';
import { deletePhotoAction, setPhotoVisibilityAction } from '@/lib/actions/workflow';

import { Empty } from './shared';

/**
 * Captured photos.
 *
 * Showing a photo to a client and keeping it as evidence are separate decisions,
 * and the controls reflect that: hiding an image from the proposal leaves the
 * evidence intact, and deleting it is a distinct, audited act with a confirmation.
 */
export function PhotosPanel({
  quoteId,
  photos,
  links,
  canEdit,
}: {
  readonly quoteId: string;
  readonly photos: readonly mediaStore.FileRow[];
  /** Signed, expiring links resolved server-side; there is no permanent URL. */
  readonly links: Readonly<Record<string, string>>;
  readonly canEdit: boolean;
}) {
  return (
    <section className="card">
      <p className="eyebrow">Photos</p>

      {photos.length === 0 ? (
        <Empty title="No photos yet.">
          <p className="faint">
            A photo of the thing you are pricing settles most arguments about scope later.
          </p>
        </Empty>
      ) : (
        <ul className="photo-grid">
          {photos.map((photo) => (
            <li key={photo.id}>
              {links[photo.id] ? (
                <img
                  src={links[photo.id]}
                  alt={photo.caption ?? photo.original_filename ?? 'Site photo'}
                  loading="lazy"
                  width={photo.width ?? 320}
                  height={photo.height ?? 240}
                />
              ) : (
                <span className="faint">Preview unavailable</span>
              )}
              <p className="faint">
                {photo.caption ?? photo.original_filename ?? 'Photo'} ·{' '}
                {Math.round(Number(photo.byte_size) / 1024)} KB
              </p>
              {canEdit && (
                <div className="button-row">
                  <InlineForm
                    action={setPhotoVisibilityAction}
                    label={photo.allow_in_proposal ? 'Remove from proposal' : 'Show to client'}
                    hidden={{
                      quoteId,
                      fileId: photo.id,
                      allow: photo.allow_in_proposal ? 'no' : 'yes',
                    }}
                  />
                  <InlineForm
                    action={deletePhotoAction}
                    label="Delete"
                    variant="danger"
                    confirmMessage="Delete this photo? The record that it existed and who removed it is kept."
                    hidden={{ quoteId, fileId: photo.id }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && <PhotoUpload quoteId={quoteId} />}
    </section>
  );
}
