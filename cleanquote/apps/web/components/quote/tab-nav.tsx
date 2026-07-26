import Link from 'next/link';

export const QUOTE_TABS = [
  ['overview', 'Overview'],
  ['capture', 'Capture'],
  ['areas', 'Areas'],
  ['tasks', 'Tasks'],
  ['schedule', 'Schedule'],
  ['labour', 'Labour'],
  ['equipment', 'Equipment'],
  ['costs', 'Costs'],
  ['risks', 'Risks'],
  ['assumptions', 'Assumptions'],
  ['exclusions', 'Exclusions'],
  ['pricing', 'Pricing'],
  ['approval', 'Approval'],
  ['proposal', 'Proposal'],
  ['activity', 'Activity'],
] as const;

export type QuoteTab = (typeof QUOTE_TABS)[number][0];

export function isQuoteTab(value: string | undefined): value is QuoteTab {
  return QUOTE_TABS.some(([key]) => key === value);
}

/**
 * Tab navigation as links, not client state.
 *
 * The tab lives in the URL so a colleague can be sent straight to the cost
 * breakdown being argued about, and so the back button behaves.
 */
export function TabNav({
  quoteId,
  active,
  counts,
}: {
  readonly quoteId: string;
  readonly active: QuoteTab;
  readonly counts: Partial<Record<QuoteTab, number>>;
}) {
  return (
    <nav className="tab-nav" aria-label="Quote sections">
      <ul>
        {QUOTE_TABS.map(([key, label]) => {
          const count = counts[key];
          return (
            <li key={key}>
              <Link
                href={`/quotes/${quoteId}?tab=${key}`}
                className={key === active ? 'tab is-active' : 'tab'}
                aria-current={key === active ? 'page' : undefined}
              >
                {label}
                {count !== undefined && count > 0 && <span className="tab-count">{count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
