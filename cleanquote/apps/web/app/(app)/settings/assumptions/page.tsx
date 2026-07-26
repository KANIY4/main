import { readProvenance } from '@cleanquote/workflow';

import { InlineForm } from '@/components/form';
import { confirmStarterValueAction } from '@/lib/actions/workflow';
import { assertPermission, requireActor } from '@/lib/session';

export const metadata = { title: 'Starting assumptions' };

const SETTING_LABELS: Record<string, string> = {
  weeks_per_year: 'Service weeks a year',
  public_holidays_per_year: 'Public holidays a year',
  public_holiday_service_day_fraction: 'Service delivered on a public holiday',
  absence_allowance_pct: 'Absence allowance',
  rounding_increment: 'Price rounding increment',
  rounding_mode: 'Price rounding',
  tax_rate_pct: 'Tax rate',
  tax_label: 'Tax name',
  default_quote_validity_days: 'Quote validity',
  default_contingency_pct: 'Default contingency',
  approval_required_below_margin_pct: 'Approval below margin',
  approval_required_above_annual_value: 'Approval above annual value',
  discount_approval_threshold_pct: 'Discount approval threshold',
  default_payment_terms: 'Payment terms',
  labour_model: 'Labour model',
};

/**
 * Every value the product filled in, and where it came from.
 *
 * The wording here is load-bearing. These are the product's conservative
 * starting points — they are not market benchmarks, not industry averages, and
 * not anybody else's data. Until a person in the business confirms one, it is
 * shown as unconfirmed everywhere it is used.
 */
export default async function AssumptionsPage() {
  const actor = await requireActor();
  assertPermission(actor, 'organisation.manage');

  const provenance = await readProvenance(actor.userId, actor.organisationId);
  const unconfirmed = provenance.filter((row) => row.is_system_default);
  const confirmed = provenance.filter((row) => !row.is_system_default);

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">{actor.organisationName}</p>
        <h1>Starting assumptions</h1>
        <p className="muted" style={{ maxWidth: '68ch' }}>
          Where you did not give us a number, we used a conservative starting point so you could
          quote on day one. These are the product&rsquo;s defaults — not market benchmarks, and not
          drawn from any other company&rsquo;s data. Reviewing one does not change its value; it
          records that somebody here decided it was right.
        </p>
      </div>

      <section>
        <h2>Not yet reviewed ({unconfirmed.length})</h2>
        {unconfirmed.length === 0 ? (
          <div className="card empty">
            <p>Everything has been reviewed.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Setting</th>
                  <th scope="col">Value</th>
                  <th scope="col">Source</th>
                  <th scope="col">In effect since</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {unconfirmed.map((row) => (
                  <tr key={row.setting_key}>
                    <td>{SETTING_LABELS[row.setting_key] ?? row.setting_key.replace(/_/g, ' ')}</td>
                    <td className="num">{row.value}</td>
                    <td>
                      <span className="pill pill-starter">Product starting point</span>
                    </td>
                    <td className="muted">{new Date(row.effective_from).toLocaleDateString()}</td>
                    <td>
                      <InlineForm
                        action={confirmStarterValueAction}
                        label="This is right"
                        hidden={{ settingKey: row.setting_key }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2>Reviewed ({confirmed.length})</h2>
        {confirmed.length === 0 ? (
          <div className="card empty">
            <p>Nothing reviewed yet.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Setting</th>
                  <th scope="col">Value</th>
                  <th scope="col">Source</th>
                  <th scope="col">Confirmed</th>
                </tr>
              </thead>
              <tbody>
                {confirmed.map((row) => (
                  <tr key={row.setting_key}>
                    <td>{SETTING_LABELS[row.setting_key] ?? row.setting_key.replace(/_/g, ' ')}</td>
                    <td className="num">{row.value}</td>
                    <td className="muted">{row.source.replace(/_/g, ' ')}</td>
                    <td className="muted">
                      {row.confirmed_at ? new Date(row.confirmed_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
