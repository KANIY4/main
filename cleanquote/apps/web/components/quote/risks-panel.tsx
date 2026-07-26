import { ActionForm, Field, Select } from '@/components/form';
import { addRiskAction } from '@/lib/actions/workflow';
import { money } from '@/lib/format';
import type { QuoteWorkspace } from '@/lib/quote-workspace';

import { Empty, PanelHeading } from './shared';

const RISK_CODES = [
  ['access_restriction', 'Access restriction'],
  ['unknown_condition', 'Unknown site condition'],
  ['scope_uncertainty', 'Scope uncertainty'],
  ['compliance', 'Compliance requirement'],
  ['staffing', 'Staffing or recruitment'],
  ['equipment_failure', 'Equipment failure'],
  ['client_dependency', 'Client-side dependency'],
  ['site_risk', 'Other site risk'],
].map(([value, label]) => ({ value: value as string, label: label as string }));

/**
 * Risks and what they are worth.
 *
 * Probability and impact are the estimator's judgement, entered explicitly. The
 * engine turns them into contingency; nothing here does arithmetic, and a risk
 * the AI suggested arrives with an impact of zero until a human prices it.
 */
export function RisksPanel({
  data,
  canEdit,
  canViewCost,
}: {
  readonly data: QuoteWorkspace;
  readonly canEdit: boolean;
  readonly canViewCost: boolean;
}) {
  const { quote, risks } = data;

  return (
    <div className="stack">
      <PanelHeading
        title="Risks"
        description="What could cost more than planned, how likely it is, and what it would cost if it happened."
      />

      {risks.length === 0 ? (
        <Empty title="No risks recorded.">
          <p className="faint">
            A quote with no risks is a claim, not an assessment. Record what you are unsure about
            even if you price it at zero.
          </p>
        </Empty>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Risk</th>
                <th scope="col">Type</th>
                <th scope="col">Likelihood</th>
                {canViewCost && <th scope="col">Impact if it happens</th>}
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {risks.map((risk) => (
                <tr key={risk.id}>
                  <td>{risk.label}</td>
                  <td className="muted">{risk.code.replace(/_/g, ' ')}</td>
                  <td className="num">{Math.round(Number(risk.probability) * 100)}%</td>
                  {canViewCost && (
                    <td className="num">{money(risk.impact_amount, quote.currency_code)}</td>
                  )}
                  <td className="muted">{risk.status.replace(/_/g, ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <section className="card">
          <p className="eyebrow">Record a risk</p>
          <ActionForm action={addRiskAction} submitLabel="Add risk" pendingLabel="Adding…">
            <input type="hidden" name="quoteId" value={quote.id} />
            <Field
              label="What could go wrong"
              name="label"
              required
              placeholder="Loading dock unavailable before 9am"
            />
            <Select label="Type" name="code" options={RISK_CODES} defaultValue="site_risk" />
            <div className="grid grid-2">
              <Field
                label="Likelihood (0 to 1)"
                name="probability"
                defaultValue="0.3"
                inputMode="decimal"
                hint="0.3 means roughly a one-in-three chance."
              />
              <Field
                label="Cost if it happens"
                name="impact"
                defaultValue="0"
                inputMode="decimal"
                hint="Leave at zero until you can put a number on it. A guessed impact becomes a real contingency."
              />
            </div>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
