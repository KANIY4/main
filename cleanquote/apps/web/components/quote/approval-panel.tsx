import { approvalTriggersFor } from '@cleanquote/workflow';

import { ActionForm, TextArea } from '@/components/form';
import { decideApprovalAction, submitForApprovalAction } from '@/lib/actions/workflow';
import { money, percent } from '@/lib/format';
import type { QuoteWorkspace } from '@/lib/quote-workspace';

import { Empty, PanelHeading } from './shared';

const STATE_COPY: Record<string, { label: string; tone: string; explanation: string }> = {
  not_required: {
    label: 'Not required',
    tone: 'info',
    explanation:
      'Nothing about this price crosses a threshold your organisation asked to review. It can be sent as it stands.',
  },
  submitted: {
    label: 'Waiting on a reviewer',
    tone: 'warning',
    explanation: 'Submitted and unchanged since. A reviewer with approval rights can decide it.',
  },
  approved: {
    label: 'Approved',
    tone: 'success',
    explanation:
      'Approved against this exact calculation. Change anything that moves the price and the approval is withdrawn automatically.',
  },
  rejected: {
    label: 'Rejected',
    tone: 'danger',
    explanation: 'A reviewer declined this price. Revise it and submit again.',
  },
  changes_requested: {
    label: 'No longer valid',
    tone: 'danger',
    explanation:
      'The figures moved after this was approved, so the approval no longer describes what would be sent. Submit the new price for review.',
  },
  draft: { label: 'Draft', tone: 'info', explanation: 'Not yet submitted.' },
  cancelled: { label: 'Cancelled', tone: 'info', explanation: 'This submission was withdrawn.' },
};

/**
 * Approval, bound to one calculation.
 *
 * The approval carries the hash of the inputs it was granted against. That is
 * what makes "approved" mean something — a database trigger invalidates it the
 * moment a new snapshot lands with different numbers.
 */
export function ApprovalPanel({
  data,
  canEdit,
  canApprove,
}: {
  readonly data: QuoteWorkspace;
  readonly canEdit: boolean;
  readonly canApprove: boolean;
}) {
  const { quote, calculation, approval, settings } = data;

  if (!calculation) {
    return (
      <div className="stack">
        <PanelHeading title="Approval" />
        <Empty title="Price the quote first.">
          <p className="faint">There is nothing to approve until a calculation exists.</p>
        </Empty>
      </div>
    );
  }

  const scenarioKey = quote.selected_scenario ?? calculation.result.recommendedScenarioKey;
  const scenario = calculation.result.scenarios.find((s) => s.key === scenarioKey);
  const triggers = scenario ? approvalTriggersFor(scenario, settings) : [];
  const state = STATE_COPY[approval.state] ?? STATE_COPY['not_required']!;
  // An approval whose hash no longer matches the current snapshot describes a
  // price that no longer exists. Saying so beats letting someone read
  // "Approved" beside a figure nobody signed off.
  const staleApproval =
    approval.approval?.calculation_input_hash !== null &&
    approval.approval?.calculation_input_hash !== undefined &&
    approval.approval.calculation_input_hash !== calculation.inputHash;

  return (
    <div className="stack">
      <PanelHeading title="Approval" description={`Reviewed against the ${scenarioKey} price.`} />

      <div className={`banner banner-${state.tone}`}>
        <strong>{state.label}.</strong> {state.explanation}
      </div>

      {triggers.length > 0 && (
        <section className="card">
          <p className="eyebrow">Why this needs a decision</p>
          <ul className="plain-list">
            {triggers.map((trigger) => (
              <li key={trigger.code}>{trigger.description}</li>
            ))}
          </ul>
        </section>
      )}

      {approval.approval && (
        <section className="card">
          <p className="eyebrow">Submission</p>
          <dl className="detail-list">
            <div>
              <dt>Submitted</dt>
              <dd>{approval.approval.created_at.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Price at submission</dt>
              <dd>
                {approval.approval.price_at_submission
                  ? money(approval.approval.price_at_submission, quote.currency_code)
                  : 'Not recorded'}
              </dd>
            </div>
            <div>
              <dt>Margin at submission</dt>
              <dd>
                {approval.approval.margin_pct_at_submission
                  ? percent(approval.approval.margin_pct_at_submission)
                  : 'Not recorded'}
              </dd>
            </div>
            <div>
              <dt>Calculation</dt>
              <dd>
                {approval.approval.calculation_input_hash?.slice(0, 12) ?? 'Not recorded'}
                {staleApproval && ' — superseded'}
              </dd>
            </div>
          </dl>
          {approval.approval.reason && (
            <p className="muted">Reviewer note: {approval.approval.reason}</p>
          )}
        </section>
      )}

      {canEdit && approval.state !== 'submitted' && (
        <section className="card">
          <p className="eyebrow">Submit for review</p>
          <ActionForm
            action={submitForApprovalAction}
            submitLabel="Submit this price"
            pendingLabel="Submitting…"
          >
            <input type="hidden" name="quoteId" value={quote.id} />
            <input type="hidden" name="scenarioKey" value={scenarioKey} />
            <p className="muted">
              {triggers.length > 0
                ? 'This price crosses a threshold, so it cannot be sent until a reviewer signs it off.'
                : 'No threshold is crossed. You can still ask for a second opinion.'}
            </p>
          </ActionForm>
        </section>
      )}

      {canApprove && approval.state === 'submitted' && approval.approval && (
        <section className="card">
          <p className="eyebrow">Your decision</p>
          <ActionForm action={decideApprovalAction} submitLabel="Approve" pendingLabel="Recording…">
            <input type="hidden" name="quoteId" value={quote.id} />
            <input type="hidden" name="approvalId" value={approval.approval.id} />
            <input type="hidden" name="decision" value="approved" />
            <TextArea label="Note (optional)" name="comment" rows={2} />
          </ActionForm>
          <ActionForm action={decideApprovalAction} submitLabel="Reject" pendingLabel="Recording…">
            <input type="hidden" name="quoteId" value={quote.id} />
            <input type="hidden" name="approvalId" value={approval.approval.id} />
            <input type="hidden" name="decision" value="rejected" />
            <TextArea label="Why you are rejecting it" name="comment" rows={2} />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
