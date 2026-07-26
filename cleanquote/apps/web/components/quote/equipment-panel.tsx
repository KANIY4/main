import type { ScenarioResult } from '@cleanquote/types';

import { costCategoryLabel, money } from '@/lib/format';

import { Empty, PanelHeading } from './shared';

/** Cost categories that describe kit rather than consumption or overhead. */
const EQUIPMENT_CATEGORIES = new Set([
  'equipment',
  'equipment_rental',
  'depreciation',
  'repairs',
  'high_access_equipment',
  'ppe',
  'testing',
  'certification',
]);

export function EquipmentPanel({
  scenario,
  currency,
  canViewCost,
}: {
  readonly scenario: ScenarioResult;
  readonly currency: string;
  readonly canViewCost: boolean;
}) {
  const lines = scenario.costs.lines.filter((line) => EQUIPMENT_CATEGORIES.has(line.category));

  return (
    <div className="stack">
      <PanelHeading
        title="Equipment"
        description="Machines, access equipment, protective gear and the testing that keeps them compliant."
      />

      {!canViewCost ? (
        <Empty title="Equipment cost is hidden for your role.">
          <p className="faint">
            Ask an administrator for the cost-visibility permission if you need it to review a
            quote.
          </p>
        </Empty>
      ) : lines.length === 0 ? (
        <Empty title="No equipment cost on this quote.">
          <p className="faint">
            Add an equipment line on the Costs tab if this job needs a scrubber, a scissor lift or
            anything else that is not already in the rate card.
          </p>
        </Empty>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Category</th>
                <th scope="col">Basis</th>
                <th scope="col">Annual amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.lineId}>
                  <td>{line.label}</td>
                  <td className="muted">{costCategoryLabel(line.category)}</td>
                  <td className="muted">{line.oneOff ? 'One-off' : 'Recurring'}</td>
                  <td className="num">{money(line.annualAmount, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
