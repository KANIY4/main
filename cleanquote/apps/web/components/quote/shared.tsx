import { InlineForm } from '@/components/form';
import { setFieldStatusAction } from '@/lib/actions/workflow';

/**
 * Labels for how a captured value was arrived at.
 *
 * "Estimated" is deliberately never softened into "measured". A visual estimate
 * that reads as a measurement is the single most expensive mistake this product
 * could make, so the wording stays blunt everywhere it appears.
 */
const FIELD_STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  estimated: 'Estimated',
  client_provided: 'Client provided',
  pending_clarification: 'Needs clarification',
};

export function FieldStatus({ status }: { readonly status: string }) {
  return (
    <span className={`pill pill-field-${status}`}>{FIELD_STATUS_LABELS[status] ?? status}</span>
  );
}

/** One-tap confirmation for a value the AI or a template estimated. */
export function ConfirmFieldButton({
  quoteId,
  entity,
  entityId,
  status,
}: {
  readonly quoteId: string;
  readonly entity: 'space' | 'task' | 'asset';
  readonly entityId: string;
  readonly status: string;
}) {
  if (status === 'confirmed') return null;
  return (
    <InlineForm
      action={setFieldStatusAction}
      label="Confirm"
      hidden={{ quoteId, entity, entityId, status: 'confirmed' }}
    />
  );
}

export function Empty({
  title,
  children,
}: {
  readonly title: string;
  readonly children?: React.ReactNode;
}) {
  return (
    <div className="card empty">
      <p style={{ marginBottom: children ? '0.6rem' : 0 }}>{title}</p>
      {children}
    </div>
  );
}

export function PanelHeading({
  title,
  description,
}: {
  readonly title: string;
  readonly description?: string;
}) {
  return (
    <header className="panel-heading">
      <h2>{title}</h2>
      {description && <p className="muted">{description}</p>}
    </header>
  );
}

/** Shown wherever a panel needs a calculation that does not exist yet. */
export function NotPricedYet({ canEdit }: { readonly canEdit: boolean }) {
  return (
    <Empty title="This quote has not been priced yet.">
      <p className="faint" style={{ marginBottom: canEdit ? '1rem' : 0 }}>
        Add at least one area and one task, then run the calculation. Nothing here is estimated from
        a partial quote — an empty figure is more honest than a confident zero.
      </p>
    </Empty>
  );
}
