import { ActionForm, Field, InlineForm, Select } from '@/components/form';
import { addTaskAction, applyTemplateAction, recalculateAction } from '@/lib/actions/workflow';
import type { QuoteWorkspace } from '@/lib/quote-workspace';

import { ConfirmFieldButton, Empty, FieldStatus, PanelHeading } from './shared';

/** The system templates seeded with every organisation. */
const TEMPLATES = [
  ['general_office', 'General office'],
  ['amenities', 'Toilet and amenities'],
  ['kitchen', 'Kitchen'],
  ['meeting_room', 'Meeting room'],
  ['retail', 'Retail floor'],
  ['childcare', 'Childcare room'],
  ['healthcare', 'Healthcare room'],
  ['industrial', 'Industrial area'],
  ['warehouse', 'Warehouse'],
  ['window_cleaning', 'Window cleaning'],
  ['periodical_floor', 'Periodical floor care'],
].map(([value, label]) => ({ value: value as string, label: label as string }));

const FREQUENCIES = [
  ['daily', 'Daily'],
  ['weekly', 'Weekly'],
  ['fortnightly', 'Fortnightly'],
  ['monthly', 'Monthly'],
  ['quarterly', 'Quarterly'],
  ['annually', 'Annually'],
  ['one_off', 'One-off'],
].map(([value, label]) => ({ value: value as string, label: label as string }));

export function TasksPanel({
  data,
  canEdit,
}: {
  readonly data: QuoteWorkspace;
  readonly canEdit: boolean;
}) {
  const { quote, spaces, tasks } = data;
  const spaceOptions = spaces.map((space) => ({ value: space.id, label: space.name }));
  const spaceName = new Map(spaces.map((space) => [space.id, space.name]));

  return (
    <div className="stack">
      <PanelHeading
        title="Tasks"
        description="What gets done, how often, and how long it takes. The rate card turns these into hours and cost — this screen never does."
      />

      {tasks.length === 0 ? (
        <Empty title="No tasks yet.">
          <p className="faint">
            Apply a template to an area for a sensible starting scope, then adjust. Templates are
            editable starting points, not benchmarks.
          </p>
        </Empty>
      ) : (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Task</th>
                  <th scope="col">Area</th>
                  <th scope="col">Frequency</th>
                  <th scope="col">Quantity</th>
                  <th scope="col">Rate</th>
                  <th scope="col">Source</th>
                  {canEdit && <th scope="col">Action</th>}
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td>{task.label}</td>
                    <td className="muted">
                      {task.space_id ? (spaceName.get(task.space_id) ?? 'Area') : 'Whole site'}
                    </td>
                    <td className="muted">
                      {task.frequency_pattern.replace(/_/g, ' ')}
                      {task.days_per_week ? ` · ${task.days_per_week} days/week` : ''}
                    </td>
                    <td className="num">
                      {Number(task.quantity)} {task.unit}
                    </td>
                    <td className="num">
                      {task.minutes_per_unit
                        ? `${Number(task.minutes_per_unit)} min/${task.unit}`
                        : task.units_per_hour
                          ? `${Number(task.units_per_hour)} ${task.unit}/hr`
                          : '—'}
                    </td>
                    <td>
                      <FieldStatus status={task.field_status} />
                    </td>
                    {canEdit && (
                      <td>
                        <ConfirmFieldButton
                          quoteId={quote.id}
                          entity="task"
                          entityId={task.id}
                          status={task.field_status}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canEdit && (
            <div className="form-actions">
              <InlineForm
                action={recalculateAction}
                label="Recalculate the price"
                variant="primary"
                hidden={{ quoteId: quote.id }}
              />
              <p className="faint">
                Recalculating writes a new snapshot. Any approval already granted against the old
                figures is withdrawn automatically.
              </p>
            </div>
          )}
        </>
      )}

      {canEdit && spaces.length > 0 && (
        <div className="grid grid-2">
          <section className="card">
            <p className="eyebrow">Apply a template</p>
            <ActionForm
              action={applyTemplateAction}
              submitLabel="Add these tasks"
              pendingLabel="Adding…"
            >
              <input type="hidden" name="quoteId" value={quote.id} />
              <Select label="Area" name="spaceId" options={spaceOptions} />
              <Select label="Template" name="templateCode" options={TEMPLATES} />
              <div className="grid grid-2">
                <Field label="Quantity" name="quantity" defaultValue="1" inputMode="decimal" />
                <Field label="Unit" name="unit" defaultValue="m2" />
              </div>
              <Field
                label="Days per week"
                name="daysPerWeek"
                defaultValue="5"
                inputMode="numeric"
              />
            </ActionForm>
          </section>

          <section className="card">
            <p className="eyebrow">Add one task</p>
            <ActionForm action={addTaskAction} submitLabel="Add task" pendingLabel="Adding…">
              <input type="hidden" name="quoteId" value={quote.id} />
              <Field label="What is done" name="label" required placeholder="Vacuum open plan" />
              <Select label="Area" name="spaceId" options={spaceOptions} />
              <div className="grid grid-2">
                <Select label="Frequency" name="frequencyPattern" options={FREQUENCIES} />
                <Field label="Days per week" name="daysPerWeek" inputMode="numeric" />
              </div>
              <div className="grid grid-2">
                <Field label="Quantity" name="quantity" defaultValue="1" inputMode="decimal" />
                <Field label="Unit" name="unit" defaultValue="m2" />
              </div>
              <div className="grid grid-2">
                <Field
                  label="Minutes per unit"
                  name="minutesPerUnit"
                  inputMode="decimal"
                  hint="Use this for fixture and item work."
                />
                <Field
                  label="Units per hour"
                  name="unitsPerHour"
                  inputMode="decimal"
                  hint="Use this for area work. Fill in one or the other, not both."
                />
              </div>
            </ActionForm>
          </section>
        </div>
      )}
    </div>
  );
}
