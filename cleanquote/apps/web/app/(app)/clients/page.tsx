import { crmStore, withUser } from '@cleanquote/database';

import { ActionForm, Field, Select, TextArea } from '@/components/form';
import { createClientAction, createSiteAction } from '@/lib/actions/workflow';
import { hasPermission, requireActor } from '@/lib/session';

export const metadata = { title: 'Clients and sites' };

export default async function ClientsPage() {
  const actor = await requireActor();
  const canEdit = hasPermission(actor, 'quote.edit');

  const { clients, sites } = await withUser(actor.userId, async (db) => ({
    clients: await crmStore.listClients(db, actor.organisationId),
    sites: await crmStore.listSites(db, actor.organisationId),
  }));

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">{actor.organisationName}</p>
        <h1>Clients and sites</h1>
      </div>

      <div className="grid grid-2">
        <section>
          <h2>Clients</h2>
          {clients.length === 0 ? (
            <div className="card empty">
              <p className="faint">No clients yet. Add one to start quoting.</p>
            </div>
          ) : (
            <ul className="plain-list">
              {clients.map((client) => (
                <li key={client.id} className="card">
                  <strong>{client.name}</strong>
                  {client.industry && <p className="faint">{client.industry}</p>}
                  <p className="faint">
                    {sites.filter((site) => site.client_id === client.id).length} site(s)
                  </p>
                </li>
              ))}
            </ul>
          )}

          {canEdit && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <h3>Add a client</h3>
              <ActionForm action={createClientAction} submitLabel="Add client">
                <Field label="Company name" name="name" required />
                <Field label="Industry" name="industry" />
                <Field label="Primary contact name" name="contactName" />
                <div className="grid grid-2">
                  <Field label="Contact email" name="contactEmail" type="email" inputMode="email" />
                  <Field label="Contact phone" name="contactPhone" inputMode="tel" />
                </div>
                <TextArea label="Notes" name="notes" />
              </ActionForm>
            </div>
          )}
        </section>

        <section>
          <h2>Sites</h2>
          {sites.length === 0 ? (
            <div className="card empty">
              <p className="faint">No sites yet.</p>
            </div>
          ) : (
            <ul className="plain-list">
              {sites.map((site) => (
                <li key={site.id} className="card">
                  <strong>{site.name}</strong>
                  <p className="faint">
                    {[site.address_line1, site.locality].filter(Boolean).join(', ') ||
                      'No address recorded'}
                  </p>
                  {site.cleaning_window && (
                    <p className="faint">Cleaning window: {site.cleaning_window}</p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canEdit && clients.length > 0 && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <h3>Add a site</h3>
              <ActionForm action={createSiteAction} submitLabel="Add site">
                <Select
                  label="Client"
                  name="clientId"
                  options={clients.map((client) => ({ value: client.id, label: client.name }))}
                />
                <Field label="Site name" name="name" required />
                <Field label="Address" name="addressLine1" />
                <div className="grid grid-2">
                  <Field label="Suburb or town" name="locality" />
                  <Field label="Postcode" name="postcode" />
                </div>
                <div className="grid grid-2">
                  <Field label="Operating hours" name="operatingHours" placeholder="7am – 6pm" />
                  <Field
                    label="Cleaning window"
                    name="cleaningWindow"
                    placeholder="After 6pm weeknights"
                    hint="Sets how many cleaners a visit needs."
                  />
                </div>
                <Field label="Access process" name="accessProcess" />
                <div className="grid grid-2">
                  <Field label="Parking" name="parking" />
                  <Field label="Security or induction" name="security" />
                </div>
                <Field label="Current contractor" name="incumbent" />
              </ActionForm>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
