import { ActionForm, Field, TextArea } from '@/components/form';
import { sendProposalAction } from '@/lib/actions/workflow';
import type { QuoteWorkspace } from '@/lib/quote-workspace';

import { Empty, PanelHeading } from './shared';

/**
 * Sending, and the record of what was sent.
 *
 * A sent proposal is sealed: the version it was built from cannot be edited
 * afterwards, so the document a client is reading always matches the figures
 * that were approved. Revising means a new version, not an overwrite.
 */
export function ProposalPanel({
  data,
  canSend,
}: {
  readonly data: QuoteWorkspace;
  readonly canSend: boolean;
}) {
  const { quote, calculation, proposals, approval } = data;
  const scenarioKey = quote.selected_scenario ?? calculation?.result.recommendedScenarioKey;

  return (
    <div className="stack">
      <PanelHeading
        title="Proposal"
        description="A branded document on a private link. It carries the price, the scope and the terms — and none of the internal cost, margin or floor figures."
      />

      {proposals.length > 0 && (
        <section className="card">
          <p className="eyebrow">Sent</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Sent</th>
                  <th scope="col">Scenario</th>
                  <th scope="col">Views</th>
                  <th scope="col">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((proposal) => (
                  <tr key={proposal.id}>
                    <td>{proposal.sent_at ? proposal.sent_at.toLocaleString() : 'Not sent'}</td>
                    <td className="muted">{proposal.scenario_key}</td>
                    <td className="num">
                      {proposal.view_count}
                      {proposal.first_viewed_at
                        ? ` · first ${proposal.first_viewed_at.toLocaleDateString()}`
                        : ''}
                    </td>
                    <td>{outcomeOf(proposal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="footnote">
            The link itself is shown once, when it is created. Only a hash of it is stored, so it
            cannot be recovered from here — reissue the proposal if the client loses it.
          </p>
        </section>
      )}

      {!calculation || !scenarioKey ? (
        <Empty title="Price the quote before you send it.">
          <p className="faint">
            A proposal is built from a calculation snapshot, not from a draft.
          </p>
        </Empty>
      ) : !canSend ? (
        <Empty title="Sending needs the send permission.">
          <p className="faint">Ask an administrator, or hand the quote to someone who has it.</p>
        </Empty>
      ) : (
        <section className="card">
          <p className="eyebrow">Send this proposal</p>
          {approval.state === 'changes_requested' && (
            <div className="banner banner-danger">
              The approval for this quote was withdrawn when the figures changed. Resubmit before
              sending.
            </div>
          )}
          <ActionForm
            action={sendProposalAction}
            submitLabel="Send proposal"
            pendingLabel="Sending…"
          >
            <input type="hidden" name="quoteId" value={quote.id} />
            <input type="hidden" name="scenarioKey" value={scenarioKey} />
            <Field
              label="Send to"
              name="toEmail"
              type="email"
              inputMode="email"
              hint="Leave blank to create the link without emailing it. The quote is saved either way — a failed email never loses the work."
            />
            <TextArea
              label="Message to the client"
              name="clientMessage"
              rows={4}
              hint="Appears above the proposal. Keep it short; the document does the work."
            />
          </ActionForm>
        </section>
      )}
    </div>
  );
}

function outcomeOf(proposal: QuoteWorkspace['proposals'][number]): string {
  if (proposal.accepted_at) return `Accepted ${proposal.accepted_at.toLocaleDateString()}`;
  if (proposal.declined_at) return `Declined ${proposal.declined_at.toLocaleDateString()}`;
  if (proposal.revoked_at) return 'Link revoked';
  if (proposal.first_viewed_at) return 'Opened, no decision yet';
  return 'Not opened yet';
}
