import type { ScenarioResult } from '@cleanquote/types';

import { hours, labourCategoryLabel, money } from '@/lib/format';

import { PanelHeading } from './shared';

/**
 * Labour for the scenario currently selected.
 *
 * Productive hours and paid hours are shown side by side because they are not
 * the same number and quoting the first as if it were the second is how a
 * contract loses money quietly for a year.
 */
export function LabourPanel({
  scenario,
  currency,
  canViewCost,
}: {
  readonly scenario: ScenarioResult;
  readonly currency: string;
  readonly canViewCost: boolean;
}) {
  return (
    <div className="stack">
      <PanelHeading
        title="Labour"
        description={`${scenario.label} scenario. Paid hours include the absence allowance; productive hours do not.`}
      />

      <div className="grid grid-3">
        <Figure
          label="Productive hours a year"
          value={hours(scenario.labour.recurringProductiveHoursPerYear)}
        />
        <Figure
          label="Paid hours a year"
          value={hours(scenario.labour.recurringPaidHoursPerYear)}
        />
        <Figure
          label="Blended hourly cost"
          value={canViewCost ? money(scenario.labour.blendedHourlyCost, currency) : 'Restricted'}
        />
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Line</th>
              <th scope="col">Profile</th>
              <th scope="col">Occurrences a year</th>
              <th scope="col">Productive hours</th>
              <th scope="col">Paid hours</th>
              {canViewCost && <th scope="col">Effective hourly cost</th>}
              {canViewCost && <th scope="col">Total cost</th>}
            </tr>
          </thead>
          <tbody>
            {scenario.labour.lines.map((line) => (
              <tr key={line.lineId}>
                <td>
                  {line.label}
                  {line.oneOff && <span className="pill pill-oneoff">one-off</span>}
                </td>
                <td className="muted">{labourCategoryLabel(line.category)}</td>
                <td className="num">{Number(line.occurrencesPerYear).toFixed(0)}</td>
                <td className="num">{hours(line.productiveHoursPerYear, 1)}</td>
                <td className="num">{hours(line.paidHoursPerYear, 1)}</td>
                {canViewCost && (
                  <td className="num">{money(line.effectiveHourlyCost, currency)}</td>
                )}
                {canViewCost && <td className="num">{money(line.totalCost, currency)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!canViewCost && (
        <p className="footnote">
          Cost figures are hidden for your role. The hours above are not — you can check the scope
          without seeing what it costs the business.
        </p>
      )}
    </div>
  );
}

function Figure({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="card stat">
      <p className="eyebrow">{label}</p>
      <p className="stat-value num">{value}</p>
    </div>
  );
}
