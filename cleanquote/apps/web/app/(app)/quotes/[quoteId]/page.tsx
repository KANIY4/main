import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ActivityPanel } from '@/components/quote/activity-panel';
import { ApprovalPanel } from '@/components/quote/approval-panel';
import { AreasPanel } from '@/components/quote/areas-panel';
import { CapturePanel } from '@/components/quote/capture-panel';
import { CostsPanel } from '@/components/quote/costs-panel';
import { EquipmentPanel } from '@/components/quote/equipment-panel';
import { LabourPanel } from '@/components/quote/labour-panel';
import { OverviewPanel } from '@/components/quote/overview-panel';
import { PricingPanel } from '@/components/quote/pricing-panel';
import { ProposalPanel } from '@/components/quote/proposal-panel';
import { QualifiersPanel } from '@/components/quote/qualifiers-panel';
import { RisksPanel } from '@/components/quote/risks-panel';
import { SchedulePanel } from '@/components/quote/schedule-panel';
import { NotPricedYet } from '@/components/quote/shared';
import { isQuoteTab, TabNav, type QuoteTab } from '@/components/quote/tab-nav';
import { TasksPanel } from '@/components/quote/tasks-panel';
import { loadQuoteWorkspace } from '@/lib/quote-workspace';
import { hasPermission, requireActor } from '@/lib/session';

export const metadata = { title: 'Quote' };

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  capturing: 'Capturing',
  in_review: 'In review',
  awaiting_approval: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Rejected',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
};

export default async function QuoteWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ quoteId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await requireActor();
  const { quoteId } = await params;
  const { tab } = await searchParams;

  // A quote in another organisation is invisible to this query, not forbidden by
  // it — the row-level policy filters it out before the application sees it, so
  // there is nothing here to leak whether the id exists at all.
  const data = await loadQuoteWorkspace(actor, quoteId);
  if (!data) notFound();

  const active: QuoteTab = isQuoteTab(tab) ? tab : 'overview';

  const canEdit = hasPermission(actor, 'quote.edit');
  const canApprove = hasPermission(actor, 'quote.approve');
  const canSend = hasPermission(actor, 'quote.send');
  const canViewCost = hasPermission(actor, 'quote.view_cost');
  const canViewProfit = hasPermission(actor, 'quote.view_profit');

  const { quote, calculation } = data;
  const scenarioKey = quote.selected_scenario ?? calculation?.result.recommendedScenarioKey;
  const scenario = calculation?.result.scenarios.find((s) => s.key === scenarioKey);

  return (
    <div className="stack">
      <header className="quote-header">
        <div>
          <p className="eyebrow">
            <Link href="/dashboard">Dashboard</Link> · {quote.reference}
          </p>
          <h1>{quote.title}</h1>
          <p className="muted">
            {data.client?.name ?? 'No client linked'}
            {data.site ? ` · ${data.site.name}` : ''} · {quote.quote_type.replace(/_/g, ' ')}
          </p>
        </div>
        <span className={`pill pill-${quote.status}`}>
          {STATUS_LABELS[quote.status] ?? quote.status}
        </span>
      </header>

      <TabNav
        quoteId={quote.id}
        active={active}
        counts={{
          capture: data.suggestions.length + data.questions.length,
          areas: data.spaces.length,
          tasks: data.tasks.length,
          risks: data.risks.length,
          assumptions: data.assumptions.length,
          exclusions: data.exclusions.length,
        }}
      />

      <section className="panel">
        {active === 'overview' && <OverviewPanel data={data} canEdit={canEdit} />}
        {active === 'capture' && <CapturePanel data={data} canEdit={canEdit} />}
        {active === 'areas' && <AreasPanel data={data} canEdit={canEdit} />}
        {active === 'tasks' && <TasksPanel data={data} canEdit={canEdit} />}
        {active === 'schedule' && <SchedulePanel data={data} />}

        {active === 'labour' &&
          (scenario ? (
            <LabourPanel
              scenario={scenario}
              currency={quote.currency_code}
              canViewCost={canViewCost}
            />
          ) : (
            <NotPricedYet canEdit={canEdit} />
          ))}

        {active === 'equipment' &&
          (scenario ? (
            <EquipmentPanel
              scenario={scenario}
              currency={quote.currency_code}
              canViewCost={canViewCost}
            />
          ) : (
            <NotPricedYet canEdit={canEdit} />
          ))}

        {active === 'costs' &&
          (scenario ? (
            <CostsPanel
              scenario={scenario}
              currency={quote.currency_code}
              quoteId={quote.id}
              canEdit={canEdit}
              canViewCost={canViewCost}
            />
          ) : (
            <NotPricedYet canEdit={canEdit} />
          ))}

        {active === 'risks' && (
          <RisksPanel data={data} canEdit={canEdit} canViewCost={canViewCost} />
        )}
        {active === 'assumptions' && (
          <QualifiersPanel
            kind="assumption"
            quoteId={quote.id}
            items={data.assumptions}
            canEdit={canEdit}
          />
        )}
        {active === 'exclusions' && (
          <QualifiersPanel
            kind="exclusion"
            quoteId={quote.id}
            items={data.exclusions}
            canEdit={canEdit}
          />
        )}

        {active === 'pricing' &&
          (calculation ? (
            <PricingPanel
              data={data}
              canEdit={canEdit}
              canViewCost={canViewCost}
              canViewProfit={canViewProfit}
            />
          ) : (
            <NotPricedYet canEdit={canEdit} />
          ))}

        {active === 'approval' && (
          <ApprovalPanel data={data} canEdit={canEdit} canApprove={canApprove} />
        )}
        {active === 'proposal' && <ProposalPanel data={data} canSend={canSend} />}
        {active === 'activity' && <ActivityPanel data={data} />}
      </section>
    </div>
  );
}
