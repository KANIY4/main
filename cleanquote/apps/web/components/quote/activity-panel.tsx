import type { QuoteWorkspace } from '@/lib/quote-workspace';

import { Empty, PanelHeading } from './shared';

/**
 * Human-readable labels for the audit trail.
 *
 * The stored action codes are stable and machine-readable; this map exists so
 * the screen reads like a history rather than like a log file. An unmapped code
 * falls through to itself rather than being hidden.
 */
const ACTION_LABELS: Record<string, string> = {
  'quote.created': 'Quote created',
  'quote.space_added': 'Area added',
  'quote.task_added': 'Task added',
  'quote.template_applied': 'Tasks added from a template',
  'quote.risk_added': 'Risk recorded',
  'quote.field_status_changed': 'Capture confidence changed',
  'quote.scenario_selected': 'Client-facing price selected',
  'quote.submitted_for_approval': 'Submitted for approval',
  'quote.approval_decided': 'Approval decision recorded',
  'quote.proposal_sent': 'Proposal sent',
  'quote.accepted': 'Client accepted',
  'quote.declined': 'Client declined',
  'ai.extraction_completed': 'Assistant analysed the walkthrough',
  'ai.suggestion_confirmed': 'Suggestion confirmed',
  'ai.suggestion_corrected': 'Suggestion corrected',
  'ai.suggestion_rejected': 'Suggestion rejected',
  'ai.question_answered': 'Question answered',
  'ai.question_ask_client': 'Question passed to the client',
};

export function ActivityPanel({ data }: { readonly data: QuoteWorkspace }) {
  const { activity } = data;

  return (
    <div className="stack">
      <PanelHeading
        title="Activity"
        description="Who did what, and when. Written by the database as each change lands, not reconstructed afterwards."
      />

      {activity.length === 0 ? (
        <Empty title="Nothing recorded yet." />
      ) : (
        <ol className="timeline">
          {activity.map((entry, index) => (
            <li key={`${entry.action}-${entry.created_at.toISOString()}-${index}`}>
              <span className="timeline-time">{entry.created_at.toLocaleString()}</span>
              <span className="timeline-action">{ACTION_LABELS[entry.action] ?? entry.action}</span>
              {entry.reason && <span className="faint"> — {entry.reason}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
