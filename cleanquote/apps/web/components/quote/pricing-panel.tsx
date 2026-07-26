import { approvalTriggersFor } from '@cleanquote/workflow';

import { InlineForm } from '@/components/form';
import { ScenarioCard } from '@/components/scenario-card';
import { recalculateAction, selectScenarioAction } from '@/lib/actions/workflow';
import { money } from '@/lib/format';
import type { QuoteWorkspace } from '@/lib/quote-workspace';

import { PanelHeading } from './shared';

/**
 * Scenario comparison and selection.
 *
 * The three scenarios come from one calculation of one set of inputs — they are
 * three commercial positions on the same work, not three different quotes. The
 * internal commentary beside them (floor price, largest risk) never leaves this
 * screen.
 */
export function PricingPanel({
  data,
  canEdit,
  canViewCost,
  canViewProfit,
}: {
  readonly data: QuoteWorkspace;
  readonly canEdit: boolean;
  readonly canViewCost: boolean;
  readonly canViewProfit: boolean;
}) {
  const { quote, calculation, settings } = data;
  if (!calculation) return null;

  const { result } = calculation;
  const selected = quote.selected_scenario;

  return (
    <div className="stack">
      <PanelHeading
        title="Pricing"
        description="One calculation, three commercial positions. Choose the one you will put in front of the client."
      />

      <div className="grid grid-3">
        {result.scenarios.map((scenario) => (
          <ScenarioCard
            key={scenario.key}
            scenario={scenario}
            currency={result.currency}
            isRecommended={scenario.key === result.recommendedScenarioKey}
            canViewCost={canViewCost}
            canViewProfit={canViewProfit}
          />
        ))}
      </div>

      {canEdit && (
        <section className="card">
          <p className="eyebrow">Client-facing price</p>
          <div className="button-row">
            {result.scenarios.map((scenario) => (
              <InlineForm
                key={scenario.key}
                action={selectScenarioAction}
                label={
                  selected === scenario.key
                    ? `${scenario.label} (selected)`
                    : `Use ${scenario.label}`
                }
                variant={selected === scenario.key ? 'primary' : 'quiet'}
                hidden={{ quoteId: quote.id, scenarioKey: scenario.key }}
              />
            ))}
          </div>
          <p className="faint">
            Selecting a scenario does not send anything. It records which price the proposal will
            carry.
          </p>
        </section>
      )}

      {result.recommendationReasons.length > 0 && (
        <section className="card">
          <p className="eyebrow">Why {result.recommendedScenarioKey} is recommended</p>
          <ul className="plain-list">
            {result.recommendationReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>
      )}

      {canViewProfit && (
        <section className="card">
          <p className="eyebrow">Internal only — never shown to a client</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Scenario</th>
                  <th scope="col">Lowest authorised price</th>
                  <th scope="col">Headroom</th>
                  <th scope="col">Needs approval</th>
                </tr>
              </thead>
              <tbody>
                {result.scenarios.map((scenario) => {
                  // The same function the approval gate itself uses. Two
                  // implementations of "does this need sign-off?" would
                  // eventually disagree, and the screen would be the one lying.
                  const triggers = approvalTriggersFor(scenario, settings).length;
                  return (
                    <tr key={scenario.key}>
                      <td>{scenario.label}</td>
                      <td className="num">
                        {money(scenario.negotiation.lowestAuthorisedAnnualPrice, result.currency)}
                      </td>
                      <td className="num">
                        {money(scenario.negotiation.headroomFromQuoted, result.currency)}
                      </td>
                      <td>{triggers > 0 ? `Yes — ${triggers} reason(s)` : 'Not required'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {result.warnings.length > 0 && (
        <div className="banner banner-warning">
          <strong>Worth checking before you send.</strong>
          <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="form-actions">
        <p className="faint">
          Calculated {calculation.calculatedAt.toLocaleString()} · snapshot{' '}
          {calculation.inputHash.slice(0, 12)}
        </p>
        {canEdit && (
          <InlineForm
            action={recalculateAction}
            label="Recalculate"
            hidden={{ quoteId: quote.id }}
          />
        )}
      </div>
    </div>
  );
}
