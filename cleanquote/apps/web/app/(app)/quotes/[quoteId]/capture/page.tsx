import { crmStore, quoteStore, withUser } from '@cleanquote/database';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ActionForm, Field, Select, TextArea } from '@/components/form';
import { addObservationAction, addSpaceAction, runExtractionAction } from '@/lib/actions/workflow';
import { assertPermission, requireActor } from '@/lib/session';

export const metadata = { title: 'Capture' };

const ROOM_TYPES = [
  ['office', 'Office'],
  ['amenities', 'Toilet and amenities'],
  ['kitchen', 'Kitchen'],
  ['meeting_room', 'Meeting room'],
  ['reception', 'Reception'],
  ['corridor', 'Corridor and stairs'],
  ['retail', 'Retail floor'],
  ['warehouse', 'Warehouse'],
  ['external', 'External area'],
  ['other', 'Other'],
].map(([value, label]) => ({ value: value as string, label: label as string }));

/**
 * Walkthrough capture, sized for a phone in one hand.
 *
 * Deliberately a small number of large controls with one job each. The full
 * workspace is a desktop tool; this is what you use while walking a site with a
 * torch in the other hand.
 */
export default async function CapturePage({ params }: { params: Promise<{ quoteId: string }> }) {
  const actor = await requireActor();
  assertPermission(actor, 'quote.edit');
  const { quoteId } = await params;

  const data = await withUser(actor.userId, async (db) => {
    const quote = await quoteStore.getQuote(db, quoteId);
    if (!quote) return undefined;
    const [spaces, site] = await Promise.all([
      quoteStore.listSpaces(db, quoteId),
      quote.site_id ? crmStore.getSite(db, quote.site_id) : Promise.resolve(undefined),
    ]);
    return { quote, spaces, site };
  });
  if (!data) notFound();

  return (
    <div className="stack capture">
      <header>
        <p className="eyebrow">
          <Link href={`/quotes/${quoteId}`}>Back to the quote</Link>
        </p>
        <h1>{data.site?.name ?? data.quote.title}</h1>
        <p className="muted">
          {data.spaces.length} area{data.spaces.length === 1 ? '' : 's'} captured
        </p>
      </header>

      <section className="card">
        <h2>Add an area</h2>
        <ActionForm action={addSpaceAction} submitLabel="Add area" pendingLabel="Adding…" block>
          <input type="hidden" name="quoteId" value={quoteId} />
          <Field label="What is this space?" name="name" required placeholder="Level 2 open plan" />
          <Select label="Type" name="roomType" options={ROOM_TYPES} defaultValue="office" />
          <Field
            label="Rough floor area (m²)"
            name="floorAreaSqm"
            inputMode="decimal"
            hint="Skip it if you have not measured. A guess recorded as a guess is useful; a guess recorded as a measurement is not."
          />
          <Select
            label="How do you know the size?"
            name="fieldStatus"
            defaultValue="estimated"
            options={[
              { value: 'estimated', label: 'Paced or eyeballed' },
              { value: 'confirmed', label: 'Measured' },
              { value: 'client_provided', label: 'The client told me' },
              { value: 'pending_clarification', label: 'Need to come back to it' },
            ]}
          />
        </ActionForm>
      </section>

      <section className="card">
        <h2>Note something</h2>
        <ActionForm
          action={addObservationAction}
          submitLabel="Save note"
          pendingLabel="Saving…"
          block
        >
          <input type="hidden" name="quoteId" value={quoteId} />
          <Select
            label="About"
            name="type"
            defaultValue="other"
            options={[
              { value: 'foot_traffic', label: 'Foot traffic' },
              { value: 'soiling', label: 'Soiling' },
              { value: 'access', label: 'Access' },
              { value: 'existing_service', label: 'Existing service quality' },
              { value: 'other', label: 'Other' },
            ]}
          />
          <TextArea label="What you saw" name="summary" required rows={3} />
          <Select
            label="Full pattern or a snapshot?"
            name="windowComplete"
            defaultValue="no"
            options={[
              { value: 'no', label: 'A snapshot' },
              { value: 'yes', label: 'The full pattern' },
            ]}
          />
        </ActionForm>
      </section>

      <section className="card">
        <h2>Hand your notes to the assistant</h2>
        <ActionForm
          action={runExtractionAction}
          submitLabel="Analyse"
          pendingLabel="Analysing…"
          block
        >
          <input type="hidden" name="quoteId" value={quoteId} />
          <TextArea label="Dictate or type what you saw" name="note" rows={5} />
          <p className="faint">
            Anything it finds waits for your review back in the quote. Nothing is added to the price
            from here.
          </p>
        </ActionForm>
      </section>

      {data.spaces.length > 0 && (
        <section className="card">
          <h2>Captured so far</h2>
          <ul className="plain-list">
            {data.spaces.map((space) => (
              <li key={space.id}>
                <strong>{space.name}</strong>
                <span className="faint">
                  {' '}
                  — {space.floor_area_sqm ? `${Number(space.floor_area_sqm)} m²` : 'no area'},{' '}
                  {space.field_status.replace(/_/g, ' ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
