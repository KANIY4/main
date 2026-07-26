import { crmStore, withUser } from '@cleanquote/database';
import Link from 'next/link';

import { ActionForm, Field, Select } from '@/components/form';
import { createQuoteAction } from '@/lib/actions/workflow';
import { assertPermission, requireActor } from '@/lib/session';

export const metadata = { title: 'New quote' };

const QUOTE_TYPES = [
  ['recurring', 'Recurring cleaning'],
  ['one_off', 'One-off cleaning'],
  ['periodical', 'Periodical cleaning'],
  ['window_cleaning', 'Window cleaning'],
  ['tender', 'Tender'],
  ['shift_based', 'Shift-based cleaning'],
  ['day_porter', 'Day porter'],
  ['industrial', 'Industrial'],
  ['controlled_environment', 'Controlled environment'],
  ['post_construction', 'Post-construction'],
  ['custom', 'Custom'],
] as const;

export default async function NewQuotePage() {
  const actor = await requireActor();
  assertPermission(actor, 'quote.create');

  const { clients, sites } = await withUser(actor.userId, async (db) => ({
    clients: await crmStore.listClients(db, actor.organisationId),
    sites: await crmStore.listSites(db, actor.organisationId),
  }));

  if (clients.length === 0) {
    return (
      <div className="narrow stack">
        <h1>New quote</h1>
        <div className="card empty">
          <p>A quote needs a client.</p>
          <Link className="button" href="/clients">
            Add a client first
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="narrow stack">
      <div>
        <p className="eyebrow">
          <Link href="/dashboard">Dashboard</Link>
        </p>
        <h1>New quote</h1>
      </div>

      <div className="card">
        <ActionForm action={createQuoteAction} submitLabel="Create quote and start capture">
          <Field
            label="Quote title"
            name="title"
            required
            placeholder="Riverside Tower A — nightly office clean"
          />
          <Select
            label="Client"
            name="clientId"
            options={clients.map((client) => ({ value: client.id, label: client.name }))}
          />
          <Select
            label="Site"
            name="siteId"
            options={[
              { value: '', label: 'No site yet' },
              ...sites.map((site) => ({ value: site.id, label: site.name })),
            ]}
          />
          <div className="grid grid-2">
            <Select
              label="Quote type"
              name="quoteType"
              options={QUOTE_TYPES.map(([value, label]) => ({ value, label }))}
              defaultValue="recurring"
            />
            <Field
              label="Contract term (months)"
              name="contractTermMonths"
              defaultValue="12"
              inputMode="numeric"
            />
          </div>
          <Field
            label="Lead source"
            name="leadSource"
            placeholder="Referral, tender portal, cold call"
          />
        </ActionForm>
      </div>
    </div>
  );
}
