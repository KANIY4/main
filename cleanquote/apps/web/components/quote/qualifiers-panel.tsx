import { ActionForm, TextArea } from '@/components/form';
import { addQualifierAction } from '@/lib/actions/workflow';

import { Empty, PanelHeading } from './shared';

type Qualifier = { id: string; statement: string; requires_human_review: boolean };

const COPY = {
  assumption: {
    title: 'Assumptions',
    description:
      'What the price depends on being true. These appear in the proposal, so the client can correct them before signing rather than after.',
    empty: 'No assumptions recorded.',
    emptyHint:
      'Anything you took as given — power and water available, bins collected by the landlord, out-of-hours access — belongs here.',
    prompt: 'Add an assumption',
    placeholder: 'Bins are collected by building management; we take waste to the dock only.',
  },
  exclusion: {
    title: 'Exclusions',
    description:
      'What this price does not cover. An exclusion stated up front is a conversation; the same exclusion raised after signing is a dispute.',
    empty: 'No exclusions recorded.',
    emptyHint: 'External windows, carpet steam cleaning and consumables supply are common ones.',
    prompt: 'Add an exclusion',
    placeholder: 'External glazing above ground level is not included.',
  },
} as const;

export function QualifiersPanel({
  kind,
  quoteId,
  items,
  canEdit,
}: {
  readonly kind: 'assumption' | 'exclusion';
  readonly quoteId: string;
  readonly items: readonly Qualifier[];
  readonly canEdit: boolean;
}) {
  const copy = COPY[kind];

  return (
    <div className="stack">
      <PanelHeading title={copy.title} description={copy.description} />

      {items.length === 0 ? (
        <Empty title={copy.empty}>
          <p className="faint">{copy.emptyHint}</p>
        </Empty>
      ) : (
        <ul className="plain-list card">
          {items.map((item) => (
            <li key={item.id}>
              {item.statement}
              {item.requires_human_review && (
                <span className="pill pill-review">Needs review before sending</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <section className="card">
          <p className="eyebrow">{copy.prompt}</p>
          <ActionForm action={addQualifierAction} submitLabel="Save" pendingLabel="Saving…">
            <input type="hidden" name="quoteId" value={quoteId} />
            <input type="hidden" name="kind" value={kind} />
            <TextArea
              label="Write it as the client will read it"
              name="statement"
              required
              hint={copy.placeholder}
            />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
