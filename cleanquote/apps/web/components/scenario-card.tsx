import type { ScenarioResult } from '@cleanquote/types';

import { hours, money, moneyCompact, percent } from '@/lib/format';

interface Props {
  readonly scenario: ScenarioResult;
  readonly currency: string;
  readonly isRecommended: boolean;
  /** Cost, profit and margin are hidden unless the viewer holds the permission. */
  readonly canViewCost: boolean;
  readonly canViewProfit: boolean;
}

export function ScenarioCard({
  scenario,
  currency,
  isRecommended,
  canViewCost,
  canViewProfit,
}: Props) {
  const recurring = Number(scenario.price.annualExTax) > 0;
  const enforced = scenario.guardrails.filter((g) => g.outcome === 'enforced');
  const overridden = scenario.guardrails.filter((g) => g.outcome === 'overridden');

  return (
    <article
      className={`scenario scenario-${scenario.key}${isRecommended ? ' is-recommended' : ''}`}
    >
      {/* Scenario labels are organisation configuration and the default for
          the balanced strategy is literally "Recommended", so the flag would
          read twice on the same card. Say who is recommending it instead. */}
      {isRecommended && <span className="recommended-flag">Our recommendation</span>}
      <p className="eyebrow" style={{ marginBottom: 0 }}>
        {scenario.label}
      </p>

      <p className="headline-price num">
        {recurring
          ? moneyCompact(scenario.price.annualExTax, currency)
          : moneyCompact(scenario.price.oneOffExTax, currency)}
      </p>
      <p className="faint" style={{ marginBottom: '0.9rem' }}>
        {recurring ? 'a year, excluding tax' : 'one-off, excluding tax'}
      </p>

      <dl>
        {recurring && (
          <>
            <div className="figure-row">
              <dt>Per visit</dt>
              <dd className="num">{money(scenario.price.perOccurrenceExTax, currency)}</dd>
            </div>
            <div className="figure-row">
              <dt>Per week</dt>
              <dd className="num">{money(scenario.price.perWeekExTax, currency)}</dd>
            </div>
            <div className="figure-row">
              <dt>Per month</dt>
              <dd className="num">{money(scenario.price.perMonthExTax, currency)}</dd>
            </div>
            <div className="figure-row">
              <dt>Visits a year</dt>
              <dd className="num">{hours(scenario.occurrencesPerYear, 0).replace(' h', '')}</dd>
            </div>
          </>
        )}
        {Number(scenario.price.oneOffExTax) > 0 && recurring && (
          <div className="figure-row">
            <dt>Mobilisation</dt>
            <dd className="num">{money(scenario.price.oneOffExTax, currency)}</dd>
          </div>
        )}
        <div className="figure-row">
          <dt>Contract total</dt>
          <dd className="num">{moneyCompact(scenario.price.contractTotalExTax, currency)}</dd>
        </div>

        {canViewCost && (
          <>
            <div className="figure-row">
              <dt>Estimated cost</dt>
              <dd className="num">{moneyCompact(scenario.totalCost, currency)}</dd>
            </div>
            <div className="figure-row">
              <dt>Paid labour hours</dt>
              <dd className="num">{hours(scenario.labour.recurringPaidHoursPerYear)}</dd>
            </div>
            <div className="figure-row">
              <dt>Recovery per hour</dt>
              <dd className="num">{money(scenario.hourlyRecovery, currency)}</dd>
            </div>
          </>
        )}

        {canViewProfit && (
          <>
            <div className="figure-row">
              <dt>Gross margin</dt>
              <dd className="num">
                {percent(
                  recurring
                    ? scenario.margin.grossMarginPct
                    : scenario.margin.overallGrossMarginPct,
                )}
              </dd>
            </div>
            <div className="figure-row">
              <dt>Contingency</dt>
              <dd className="num">{money(scenario.contingency.total, currency)}</dd>
            </div>
          </>
        )}
      </dl>

      <div style={{ marginTop: '0.9rem' }}>
        <p className="faint" style={{ margin: '0 0 0.3rem' }}>
          Input confidence{' '}
          {scenario.confidenceBasis === 'unknown'
            ? '— not yet assessable'
            : `${Math.round(scenario.confidence * 100)}%`}
        </p>
        <div
          className="confidence-bar"
          role="img"
          aria-label={`Input confidence ${Math.round(scenario.confidence * 100)} percent`}
        >
          <div className="confidence-fill" style={{ width: `${scenario.confidence * 100}%` }} />
        </div>
      </div>

      {canViewProfit && (
        <div style={{ marginTop: '0.9rem' }}>
          <p className="faint" style={{ margin: 0 }}>
            Lowest authorised price{' '}
            <strong className="num">
              {moneyCompact(scenario.negotiation.lowestAuthorisedAnnualPrice, currency)}
            </strong>{' '}
            — {percent(scenario.negotiation.headroomPct)} headroom
          </p>
        </div>
      )}

      {enforced.length > 0 && (
        <p className="banner banner-caution" style={{ marginTop: '0.9rem' }}>
          Lifted to meet {enforced.length} commercial floor
          {enforced.length === 1 ? '' : 's'}.
        </p>
      )}
      {overridden.length > 0 && (
        <p className="banner banner-danger" style={{ marginTop: '0.9rem' }}>
          Below {overridden.length} commercial floor
          {overridden.length === 1 ? '' : 's'} under an approved override.
        </p>
      )}
    </article>
  );
}
