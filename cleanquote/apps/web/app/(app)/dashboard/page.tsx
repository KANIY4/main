import { crmStore, quoteStore, withUser } from '@cleanquote/database';
import { assessSetup } from '@cleanquote/workflow';
import Link from 'next/link';

import { requireActor } from '@/lib/session';

export const metadata = { title: 'Dashboard' };

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

export default async function DashboardPage() {
  const actor = await requireActor();

  const [setup, quotes, clients] = await Promise.all([
    assessSetup(actor.userId, actor.organisationId),
    withUser(actor.userId, async (db) => quoteStore.listQuotes(db, actor.organisationId)),
    withUser(actor.userId, async (db) => crmStore.listClients(db, actor.organisationId)),
  ]);

  const blocking = setup.gaps.filter((gap) => gap.severity === 'blocking');
  const important = setup.gaps.filter((gap) => gap.severity === 'important');

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">{actor.organisationName}</p>
        <h1>Dashboard</h1>
      </div>

      {blocking.length > 0 && (
        <div className="banner banner-danger">
          <strong>Set-up needed before you can price.</strong>
          <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
            {blocking.map((gap) => (
              <li key={gap.key}>
                <Link href={gap.href}>{gap.label}</Link> — {gap.why}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-3">
        <Link className="tile" href="/quotes/new">
          <span className="tile-title">New quote</span>
          <span className="faint">Start from a client and site</span>
        </Link>
        <Link className="tile" href="/clients">
          <span className="tile-title">Clients and sites</span>
          <span className="faint">
            {clients.length} client{clients.length === 1 ? '' : 's'}
          </span>
        </Link>
        <Link className="tile" href="/approvals">
          <span className="tile-title">Approvals</span>
          <span className="faint">Quotes waiting on a decision</span>
        </Link>
      </div>

      {important.length > 0 && (
        <section className="card">
          <p className="eyebrow">Worth finishing</p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {important.map((gap) => (
              <li key={gap.key} style={{ marginBottom: '0.35rem' }}>
                <Link href={gap.href}>{gap.label}</Link>
                <span className="faint"> — {gap.why}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Quotes</h2>
        {quotes.length === 0 ? (
          <div className="card empty">
            <p style={{ marginBottom: '0.6rem' }}>No quotes yet.</p>
            <p className="faint" style={{ marginBottom: '1rem' }}>
              Create a client and a site, then start a quote. You can capture the walkthrough on
              your phone.
            </p>
            <Link className="button" href="/quotes/new">
              Create your first quote
            </Link>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Title</th>
                  <th scope="col">Type</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => (
                  <tr key={quote.id}>
                    <td>
                      <Link href={`/quotes/${quote.id}`}>{quote.reference}</Link>
                    </td>
                    <td>{quote.title}</td>
                    <td className="muted">{quote.quote_type.replace(/_/g, ' ')}</td>
                    <td>
                      <span className={`pill pill-${quote.status}`}>
                        {STATUS_LABELS[quote.status] ?? quote.status}
                      </span>
                    </td>
                    <td className="muted">{new Date(quote.updated_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
