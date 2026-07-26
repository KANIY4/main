import type { ScenarioResult } from '@cleanquote/types';

import { CostBreakdown } from '@/components/cost-breakdown';
import { ActionForm, Field, Select } from '@/components/form';
import { addCostLineAction } from '@/lib/actions/workflow';

import { Empty, PanelHeading } from './shared';

const CATEGORIES = [
  ['chemicals', 'Chemicals'],
  ['consumables', 'Consumables'],
  ['client_consumables', 'Client consumables'],
  ['equipment', 'Equipment'],
  ['equipment_rental', 'Equipment rental'],
  ['high_access_equipment', 'High-access equipment'],
  ['vehicle', 'Vehicle'],
  ['fuel', 'Fuel'],
  ['parking', 'Parking'],
  ['waste', 'Waste removal'],
  ['laundry', 'Laundry'],
  ['ppe', 'Protective equipment'],
  ['testing', 'Testing'],
  ['certification', 'Certification'],
  ['induction', 'Site induction'],
  ['subcontractor', 'Subcontractor'],
].map(([value, label]) => ({ value: value as string, label: label as string }));

const METHODS = [
  ['per_year', 'A year'],
  ['per_month', 'A month'],
  ['per_occurrence', 'Each visit'],
  ['per_labour_hour', 'Per labour hour'],
  ['one_off', 'Once, at the start'],
].map(([value, label]) => ({ value: value as string, label: label as string }));

export function CostsPanel({
  scenario,
  currency,
  quoteId,
  canEdit,
  canViewCost,
}: {
  readonly scenario: ScenarioResult;
  readonly currency: string;
  readonly quoteId: string;
  readonly canEdit: boolean;
  readonly canViewCost: boolean;
}) {
  return (
    <div className="stack">
      <PanelHeading
        title="Costs"
        description="Every figure the price is built from, line by line. A quote nobody can explain is a quote nobody can defend."
      />

      {canViewCost ? (
        <CostBreakdown scenario={scenario} currency={currency} />
      ) : (
        <Empty title="The cost breakdown is hidden for your role.">
          <p className="faint">
            You can still review the scope, the schedule and the client-facing price.
          </p>
        </Empty>
      )}

      {canEdit && (
        <section className="card">
          <p className="eyebrow">Add a cost this job carries</p>
          <ActionForm action={addCostLineAction} submitLabel="Save cost" pendingLabel="Saving…">
            <input type="hidden" name="quoteId" value={quoteId} />
            <div className="grid grid-2">
              <Field label="What it is" name="label" required placeholder="Scissor lift hire" />
              <Select label="Category" name="category" options={CATEGORIES} />
            </div>
            <div className="grid grid-2">
              <Field label="Amount" name="amount" required inputMode="decimal" placeholder="1250" />
              <Select label="How often" name="method" options={METHODS} defaultValue="per_year" />
            </div>
            <Select
              label="Is this a start-up cost?"
              name="oneOff"
              defaultValue="no"
              options={[
                { value: 'no', label: 'No — it recurs through the contract' },
                { value: 'yes', label: 'Yes — it is incurred once' },
              ]}
              hint="A start-up cost is recovered against the one-off side of the quote, not loaded onto the annual contract value."
            />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
