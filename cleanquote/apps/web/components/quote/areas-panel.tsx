import { ActionForm, Field, Select } from '@/components/form';
import { addSpaceAction } from '@/lib/actions/workflow';
import type { QuoteWorkspace } from '@/lib/quote-workspace';

import { ConfirmFieldButton, Empty, FieldStatus, PanelHeading } from './shared';

const ROOM_TYPES = [
  ['office', 'Office'],
  ['amenities', 'Toilet and amenities'],
  ['kitchen', 'Kitchen'],
  ['meeting_room', 'Meeting room'],
  ['reception', 'Reception'],
  ['corridor', 'Corridor and stairs'],
  ['retail', 'Retail floor'],
  ['childcare', 'Childcare room'],
  ['healthcare', 'Healthcare room'],
  ['industrial', 'Industrial area'],
  ['warehouse', 'Warehouse'],
  ['glazing', 'Glazing'],
  ['external', 'External area'],
  ['other', 'Other'],
].map(([value, label]) => ({ value: value as string, label: label as string }));

const LEVELS = (values: readonly (readonly [string, string])[]) =>
  values.map(([value, label]) => ({ value, label }));

export function AreasPanel({
  data,
  canEdit,
}: {
  readonly data: QuoteWorkspace;
  readonly canEdit: boolean;
}) {
  const { quote, spaces } = data;

  return (
    <div className="stack">
      <PanelHeading
        title="Areas"
        description="Every area carries how its size was arrived at. An estimated area still prices, and still says so."
      />

      {spaces.length === 0 ? (
        <Empty title="No areas captured yet.">
          <p className="faint">Add the first area below, or capture the walkthrough on a phone.</p>
        </Empty>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Area</th>
                <th scope="col">Type</th>
                <th scope="col">Floor area</th>
                <th scope="col">Traffic</th>
                <th scope="col">Soil</th>
                <th scope="col">Source</th>
                {canEdit && <th scope="col">Action</th>}
              </tr>
            </thead>
            <tbody>
              {spaces.map((space) => (
                <tr key={space.id}>
                  <td>{space.name}</td>
                  <td className="muted">{space.room_type.replace(/_/g, ' ')}</td>
                  <td className="num">
                    {space.floor_area_sqm ? `${Number(space.floor_area_sqm)} m²` : '—'}
                  </td>
                  <td className="muted">{space.traffic_level ?? '—'}</td>
                  <td className="muted">{space.soil_level ?? '—'}</td>
                  <td>
                    <FieldStatus status={space.field_status} />
                  </td>
                  {canEdit && (
                    <td>
                      <ConfirmFieldButton
                        quoteId={quote.id}
                        entity="space"
                        entityId={space.id}
                        status={space.field_status}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <section className="card">
          <p className="eyebrow">Add an area</p>
          <ActionForm action={addSpaceAction} submitLabel="Add area" pendingLabel="Adding…">
            <input type="hidden" name="quoteId" value={quote.id} />
            <div className="grid grid-2">
              <Field label="Name" name="name" required placeholder="Level 3 open plan" />
              <Select label="Type" name="roomType" options={ROOM_TYPES} defaultValue="office" />
            </div>
            <div className="grid grid-2">
              <Field
                label="Floor area (m²)"
                name="floorAreaSqm"
                inputMode="decimal"
                hint="Leave blank if you have not measured it. A blank area is priced by task quantity instead."
              />
              <Select
                label="How was this arrived at?"
                name="fieldStatus"
                defaultValue="confirmed"
                options={LEVELS([
                  ['confirmed', 'Measured or confirmed on site'],
                  ['estimated', 'Estimated'],
                  ['client_provided', 'Provided by the client'],
                  ['pending_clarification', 'Needs clarification'],
                ])}
              />
            </div>
            <div className="grid grid-2">
              <Select
                label="Traffic"
                name="traffic"
                defaultValue="medium"
                options={LEVELS([
                  ['low', 'Low'],
                  ['medium', 'Medium'],
                  ['high', 'High'],
                  ['very_high', 'Very high'],
                ])}
              />
              <Select
                label="Soil level"
                name="soil"
                defaultValue="normal"
                options={LEVELS([
                  ['light', 'Light'],
                  ['normal', 'Normal'],
                  ['heavy', 'Heavy'],
                ])}
              />
            </div>
            <div className="grid grid-2">
              <Select
                label="Furniture density"
                name="furniture"
                defaultValue="normal"
                options={LEVELS([
                  ['open', 'Open'],
                  ['normal', 'Normal'],
                  ['dense', 'Dense'],
                ])}
              />
              <Select
                label="Access"
                name="access"
                defaultValue="unrestricted"
                options={LEVELS([
                  ['unrestricted', 'Unrestricted'],
                  ['restricted', 'Restricted'],
                  ['escorted', 'Escorted only'],
                ])}
              />
            </div>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
