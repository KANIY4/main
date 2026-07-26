import { readRateCard } from '@cleanquote/workflow';
import Link from 'next/link';

import { ActionForm, Field, Select } from '@/components/form';
import { updateCommercialRulesAction, updateLabourRateAction } from '@/lib/actions/workflow';
import { money, percent } from '@/lib/format';
import { assertPermission, requireActor } from '@/lib/session';

export const metadata = { title: 'Rate card' };

const ENGAGEMENTS = [
  { value: 'employee', label: 'Employee' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'casual', label: 'Casual' },
];

export default async function RateCardPage() {
  const actor = await requireActor();
  assertPermission(actor, 'rate_card.manage');

  const card = await readRateCard(actor.userId, actor.organisationId);
  if (!card) {
    return (
      <div className="stack">
        <h1>Rate card</h1>
        <div className="card empty">
          <p>No rate card yet.</p>
          <p className="faint">
            One is created when you finish setting up your company.{' '}
            <Link href="/onboarding">Finish set-up</Link>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">{actor.organisationName}</p>
        <h1>Rate card</h1>
        <p className="muted">
          Version {card.rateCard.version}, effective from{' '}
          {card.rateCard.effective_from.toLocaleDateString()}. Editing this changes what{' '}
          <em>future</em> quotes are priced against — a quote already sent keeps the version it was
          calculated on.
        </p>
      </div>

      <section>
        <h2>Labour</h2>
        <div className="grid grid-2">
          {card.labourProfiles.map((profile) => (
            <div className="card" key={profile.code}>
              <p className="eyebrow">{profile.code}</p>
              <ActionForm action={updateLabourRateAction} submitLabel="Save" pendingLabel="Saving…">
                <input type="hidden" name="code" value={profile.code} />
                <Field label="Label" name="label" defaultValue={profile.label} required />
                <div className="grid grid-2">
                  <Field
                    label="Base hourly rate"
                    name="baseHourlyRate"
                    defaultValue={profile.base_hourly_rate}
                    inputMode="decimal"
                    required
                    hint="What the hour costs you, before on-costs."
                  />
                  <Select
                    label="Engagement"
                    name="engagement"
                    options={ENGAGEMENTS}
                    defaultValue={profile.engagement}
                  />
                </div>
              </ActionForm>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>On-costs</h2>
        <p className="muted">
          Applied on top of the base rate to reach the true cost of an hour. Edited through the
          advanced set-up; shown here so the number in a quote is never a mystery.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">On-cost</th>
                <th scope="col">Method</th>
                <th scope="col">Value</th>
                <th scope="col">Applies to</th>
              </tr>
            </thead>
            <tbody>
              {card.onCostRules.map((rule) => (
                <tr key={rule.code}>
                  <td>{rule.label}</td>
                  <td className="muted">{rule.method.replace(/_/g, ' ')}</td>
                  <td className="num">
                    {rule.method.includes('pct')
                      ? percent(rule.value)
                      : money(rule.value, card.currency)}
                  </td>
                  <td className="muted">
                    {rule.applies_to_engagements.length > 0
                      ? rule.applies_to_engagements.join(', ')
                      : 'all engagements'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Overheads</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Overhead</th>
                <th scope="col">Method</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {card.overheadRules.map((rule) => (
                <tr key={rule.code}>
                  <td>{rule.label}</td>
                  <td className="muted">{rule.method.replace(/_/g, ' ')}</td>
                  <td className="num">
                    {rule.method.includes('pct')
                      ? percent(rule.value)
                      : money(rule.value, card.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Commercial rules</h2>
        <p className="muted">
          A floor is enforced on every calculation: the engine lifts the price to meet it and says
          so. A threshold decides who has to sign the price off before it can be sent.
        </p>
        <ActionForm
          action={updateCommercialRulesAction}
          submitLabel="Save commercial rules"
          pendingLabel="Saving…"
        >
          <fieldset>
            <legend>Floors</legend>
            <div className="grid grid-2">
              <Field
                label="Minimum gross margin %"
                name="minGrossMarginPct"
                defaultValue={card.marginRules?.min_gross_margin_pct ?? ''}
                inputMode="decimal"
              />
              <Field
                label="Minimum hourly recovery"
                name="minHourlyRecovery"
                defaultValue={card.marginRules?.min_hourly_recovery ?? ''}
                inputMode="decimal"
              />
            </div>
            <Field
              label="Minimum charge per visit"
              name="minChargePerVisit"
              defaultValue={card.marginRules?.min_charge_per_visit ?? ''}
              inputMode="decimal"
              hint="Leave blank for no rule. Blank is not the same as zero."
            />
          </fieldset>
          <fieldset>
            <legend>Approval thresholds</legend>
            <div className="grid grid-2">
              <Field
                label="Approval needed below margin %"
                name="approvalBelowMarginPct"
                inputMode="decimal"
              />
              <Field
                label="Approval needed above annual value"
                name="approvalAboveAnnualValue"
                inputMode="decimal"
              />
            </div>
          </fieldset>
        </ActionForm>
      </section>

      <section>
        <h2>Pricing strategies</h2>
        <p className="muted">
          The three positions every calculation produces. These names are internal — a client never
          sees them.
        </p>
        <div className="grid grid-3">
          {card.scenarios.map((scenario) => (
            <div className="card" key={scenario.scenario_key}>
              <p className="eyebrow">{scenario.label}</p>
              <dl className="detail-list">
                <div>
                  <dt>Basis</dt>
                  <dd>
                    {scenario.pricing_basis_type.replace(/_/g, ' ')} {scenario.pricing_basis_value}
                  </dd>
                </div>
                <div>
                  <dt>Contingency</dt>
                  <dd>{percent(scenario.contingency_pct)}</dd>
                </div>
                <div>
                  <dt>Productivity</dt>
                  <dd>{scenario.productivity_multiplier}×</dd>
                </div>
              </dl>
              {scenario.rationale && <p className="faint">{scenario.rationale}</p>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
