import Link from 'next/link';

import { InlineForm } from '@/components/form';
import { recalculateAction } from '@/lib/actions/workflow';
import { money } from '@/lib/format';
import type { QuoteWorkspace } from '@/lib/quote-workspace';

import { Empty, PanelHeading } from './shared';

/**
 * The state of the quote in one screen.
 *
 * Deliberately shows what is missing as prominently as what is done. An
 * estimator who cannot see that half the areas are unconfirmed will send a
 * price built on guesses.
 */
export function OverviewPanel({
  data,
  canEdit,
}: {
  readonly data: QuoteWorkspace;
  readonly canEdit: boolean;
}) {
  const { quote, spaces, tasks, calculation } = data;
  const selected = quote.selected_scenario;
  const scenario = calculation?.result.scenarios.find((s) => s.key === (selected ?? 'balanced'));

  const unconfirmedAreas = spaces.filter((space) => space.field_status !== 'confirmed').length;
  const recurring = scenario ? Number(scenario.price.annualExTax) > 0 : false;

  return (
    <div className="stack">
      <PanelHeading title="Overview" />

      <div className="grid grid-3">
        <Stat
          label="Areas"
          value={String(spaces.length)}
          note={`${unconfirmedAreas} unconfirmed`}
        />
        <Stat label="Tasks" value={String(tasks.length)} note="Priced from the rate card" />
        <Stat
          label="Open questions"
          value={String(data.questions.length)}
          note={data.questions.length > 0 ? 'Answer these before sending' : 'Nothing outstanding'}
        />
      </div>

      {scenario ? (
        <section className="card">
          <p className="eyebrow">
            {selected ? 'Selected price' : 'Recommended price (not yet selected)'}
          </p>
          <p className="headline-price num">
            {recurring
              ? money(scenario.price.annualExTax, quote.currency_code)
              : money(scenario.price.oneOffExTax, quote.currency_code)}
          </p>
          <p className="faint">
            {recurring ? 'a year, excluding tax' : 'one-off, excluding tax'} · {scenario.label}{' '}
            scenario
          </p>
          <dl className="detail-list">
            <div>
              <dt>Calculated</dt>
              <dd>{calculation?.calculatedAt.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>
                {scenario.confidenceBasis === 'measured'
                  ? `${Math.round(scenario.confidence * 100)}% — from the capture data`
                  : 'Not yet assessable'}
              </dd>
            </div>
            <div>
              <dt>Areas confirmed</dt>
              <dd>
                {spaces.length - unconfirmedAreas} of {spaces.length}
              </dd>
            </div>
          </dl>
          <p>
            <Link href={`/quotes/${quote.id}?tab=pricing`}>Compare all three scenarios</Link>
          </p>
        </section>
      ) : (
        <Empty title="No price yet.">
          <p className="faint" style={{ marginBottom: '1rem' }}>
            Capture the areas and the work, then calculate. The price comes from the pricing engine
            and the rate card this quote was created against — never from an estimate of an
            estimate.
          </p>
          {canEdit && tasks.length > 0 && (
            <InlineForm
              action={recalculateAction}
              label="Calculate now"
              variant="primary"
              hidden={{ quoteId: quote.id }}
            />
          )}
          {canEdit && tasks.length === 0 && (
            <Link className="button" href={`/quotes/${quote.id}?tab=areas`}>
              Add the first area
            </Link>
          )}
        </Empty>
      )}

      <section className="card">
        <p className="eyebrow">Client and site</p>
        <dl className="detail-list">
          <div>
            <dt>Client</dt>
            <dd>{data.client?.name ?? 'Not linked'}</dd>
          </div>
          <div>
            <dt>Site</dt>
            <dd>{data.site?.name ?? 'Not linked'}</dd>
          </div>
          <div>
            <dt>Contract term</dt>
            <dd>{quote.contract_term_months} months</dd>
          </div>
          <div>
            <dt>Valid for</dt>
            <dd>{quote.quote_validity_days} days from sending</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  readonly label: string;
  readonly value: string;
  readonly note: string;
}) {
  return (
    <div className="card stat">
      <p className="eyebrow">{label}</p>
      <p className="stat-value num">{value}</p>
      <p className="faint">{note}</p>
    </div>
  );
}
