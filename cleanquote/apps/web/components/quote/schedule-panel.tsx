import type { QuoteWorkspace } from '@/lib/quote-workspace';

import { Empty, PanelHeading } from './shared';

const FREQUENCY_ORDER = [
  'daily',
  'weekly',
  'fortnightly',
  'monthly',
  'quarterly',
  'biannually',
  'annually',
  'one_off',
];

/**
 * The service pattern, grouped by how often the work happens.
 *
 * This is the view a client argues with — "you have us down for daily but we
 * only need three days" — so it stays close to the tasks rather than to money.
 */
export function SchedulePanel({ data }: { readonly data: QuoteWorkspace }) {
  const { tasks, spaces } = data;
  const spaceName = new Map(spaces.map((space) => [space.id, space.name]));

  const groups = new Map<string, typeof tasks>();
  for (const task of tasks) {
    const existing = groups.get(task.frequency_pattern);
    if (existing) existing.push(task);
    else groups.set(task.frequency_pattern, [task]);
  }

  const ordered = [...groups.entries()].sort(
    (a, b) => indexOfFrequency(a[0]) - indexOfFrequency(b[0]),
  );

  return (
    <div className="stack">
      <PanelHeading
        title="Schedule"
        description="The same tasks, grouped by frequency — the shape of the service as the client will experience it."
      />

      {ordered.length === 0 ? (
        <Empty title="Nothing scheduled yet.">
          <p className="faint">Add tasks and they will appear here grouped by frequency.</p>
        </Empty>
      ) : (
        ordered.map(([frequency, group]) => {
          const daysPerWeek = group.find((task) => task.days_per_week)?.days_per_week;
          return (
            <section className="card" key={frequency}>
              <p className="eyebrow">
                {frequency.replace(/_/g, ' ')}
                {daysPerWeek ? ` · up to ${daysPerWeek} days a week` : ''}
              </p>
              <ul className="plain-list">
                {group.map((task) => (
                  <li key={task.id}>
                    <strong>{task.label}</strong>
                    <span className="faint">
                      {' '}
                      — {task.space_id
                        ? (spaceName.get(task.space_id) ?? 'area')
                        : 'whole site'}, {Number(task.quantity)} {task.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function indexOfFrequency(frequency: string): number {
  const index = FREQUENCY_ORDER.indexOf(frequency);
  return index === -1 ? FREQUENCY_ORDER.length : index;
}
