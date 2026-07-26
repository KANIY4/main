import { proposalStore, tenancyStore, withUser } from '@cleanquote/database';
import Link from 'next/link';

import { money, percent } from '@/lib/format';
import { assertPermission, requireActor } from '@/lib/session';

export const metadata = { title: 'Approvals' };

/**
 * The reviewer's queue.
 *
 * Gated by the approve permission here and by the row-level policy underneath,
 * so a user without it sees nothing even if they reach the URL directly.
 */
export default async function ApprovalsPage() {
  const actor = await requireActor();
  assertPermission(actor, 'quote.approve');

  const { pending, currency } = await withUser(actor.userId, async (db) => {
    const [approvals, organisation] = await Promise.all([
      proposalStore.listApprovals(db, actor.organisationId, 'pending'),
      tenancyStore.getOrganisation(db, actor.organisationId),
    ]);
    return { pending: approvals, currency: organisation?.currency_code ?? 'AUD' };
  });

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">{actor.organisationName}</p>
        <h1>Approvals</h1>
        <p className="muted">
          Each of these is bound to one calculation. If the estimator repriced since submitting, it
          will say so when you open it.
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="card empty">
          <p style={{ marginBottom: '0.4rem' }}>Nothing waiting on you.</p>
          <p className="faint">
            Quotes appear here when they fall below your minimum margin, exceed your value
            threshold, or override a commercial floor.
          </p>
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Quote</th>
                <th scope="col">Price</th>
                <th scope="col">Margin</th>
                <th scope="col">Why</th>
                <th scope="col">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((approval) => (
                <tr key={approval.id}>
                  <td>
                    <Link href={`/quotes/${approval.quote_id}?tab=approval`}>
                      {approval.reference}
                    </Link>
                  </td>
                  <td>{approval.quote_title}</td>
                  <td className="num">
                    {approval.price_at_submission
                      ? money(approval.price_at_submission, currency)
                      : '—'}
                  </td>
                  <td className="num">
                    {approval.margin_pct_at_submission
                      ? percent(approval.margin_pct_at_submission)
                      : '—'}
                  </td>
                  <td className="muted">
                    {approval.trigger_reasons.length > 0
                      ? approval.trigger_reasons.join(', ').replace(/_/g, ' ')
                      : 'Second opinion requested'}
                  </td>
                  <td className="muted">{approval.created_at.toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
