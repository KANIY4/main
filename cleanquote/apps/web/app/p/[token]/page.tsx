import type { ProposalContent } from '@cleanquote/workflow';
import { notFound } from 'next/navigation';

import { ActionForm, Field, TextArea } from '@/components/form';
import {
  acceptProposalAction,
  declineProposalAction,
  requestRevisionAction,
} from '@/lib/actions/workflow';
import { money } from '@/lib/format';
import { readPublicProposal, recordProposalView } from '@cleanquote/workflow';
import { consumeRateLimit } from '@/lib/rate-limit';
import { requestContext } from '@/lib/session';

export const metadata = { title: 'Your proposal', robots: { index: false, follow: false } };

/**
 * The client-facing proposal.
 *
 * Reached with a token and nothing else — no account, no session, no cookie.
 * Everything on this page comes from the stored client-facing projection, which
 * is built without ever reading cost, margin, contingency, strategy name or
 * negotiation floor. There is no internal figure here to accidentally reveal.
 */
export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const context = await requestContext();

  // Tokens are 32 random bytes, so guessing is not a realistic threat on
  // arithmetic alone. The limit is here so that trying anyway costs a database
  // round trip per attempt rather than being free.
  const limit = await consumeRateLimit(`proposal-view:${context.ip ?? 'unknown'}`, {
    limit: 60,
    windowSeconds: 300,
  });
  if (!limit.allowed) notFound();

  const proposal = await readPublicProposal(token);
  // A revoked, expired or simply wrong token is the same answer: nothing here.
  // Distinguishing them would turn the link into an oracle for guessing others.
  if (!proposal) notFound();

  await recordProposalView(token, context);

  const content = proposal.content as unknown as ProposalContent;
  const investment = content.investment;
  const decided = proposal.acceptedAt ?? proposal.declinedAt;

  return (
    <div className="stack proposal-document">
      <header>
        <p className="eyebrow">{proposal.organisationName}</p>
        <h1>{content.title}</h1>
        <p className="muted">
          Prepared for {content.clientName}
          {content.siteName ? ` · ${content.siteName}` : ''} · reference {content.reference}
        </p>
        <p className="faint">
          Prepared {content.preparedOn} · valid until {content.validUntil}
        </p>
      </header>

      <section className="card investment">
        <p className="eyebrow">Your investment</p>
        {Number(investment.annualExTax) > 0 && (
          <>
            <p className="headline-price num">
              {money(investment.annualExTax, investment.currency)}
            </p>
            <p className="faint">
              a year, excluding {investment.taxLabel} ·{' '}
              {money(investment.annualIncTax, investment.currency)} including {investment.taxLabel}
            </p>
            {investment.perMonthExTax && (
              <p className="muted">
                {money(investment.perMonthExTax, investment.currency)} a month, over a{' '}
                {investment.contractTermMonths}-month term
              </p>
            )}
          </>
        )}
        {investment.oneOffExTax && Number(investment.oneOffExTax) > 0 && (
          <p className="muted">
            One-off work: {money(investment.oneOffExTax, investment.currency)}, excluding{' '}
            {investment.taxLabel}
          </p>
        )}
      </section>

      <p>
        <a className="button button-quiet" href={`/p/${token}/download`}>
          Download as a PDF
        </a>
      </p>

      {content.sections.map((section) => (
        <section className="card" key={section.key}>
          <h2>{section.heading}</h2>
          {section.body && <p>{section.body}</p>}
          {section.items && section.items.length > 0 && (
            <ul className="plain-list">
              {section.items.map((item, index) => (
                <li key={`${section.key}-${index}`}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {decided ? (
        <div className="banner banner-info">
          {proposal.acceptedAt
            ? `Accepted on ${proposal.acceptedAt.toLocaleDateString()}. Thank you — we will be in touch to arrange the start.`
            : `Declined on ${proposal.declinedAt?.toLocaleDateString()}. Thank you for letting us know.`}
        </div>
      ) : (
        <>
          <section className="card">
            <h2>Accept this proposal</h2>
            <p className="muted">
              Entering your name below records your acceptance of the scope and price above, on
              today&rsquo;s date.
            </p>
            <ActionForm
              action={acceptProposalAction}
              submitLabel="Accept"
              pendingLabel="Recording…"
            >
              <input type="hidden" name="token" value={token} />
              <div className="grid grid-2">
                <Field label="Your name" name="signerName" required />
                <Field label="Your position" name="signerTitle" />
              </div>
            </ActionForm>
          </section>

          <div className="grid grid-2">
            <section className="card">
              <h2>Ask for a change</h2>
              <ActionForm
                action={requestRevisionAction}
                submitLabel="Send request"
                pendingLabel="Sending…"
              >
                <input type="hidden" name="token" value={token} />
                <Field label="Your name" name="authorName" />
                <TextArea label="What would you like changed?" name="note" required rows={3} />
              </ActionForm>
            </section>

            <section className="card">
              <h2>Decline</h2>
              <ActionForm
                action={declineProposalAction}
                submitLabel="Decline"
                pendingLabel="Recording…"
              >
                <input type="hidden" name="token" value={token} />
                <Field label="Your name" name="signerName" />
                <TextArea
                  label="Anything you would like us to know?"
                  name="reason"
                  rows={3}
                  hint="Optional, but it helps us quote better next time."
                />
              </ActionForm>
            </section>
          </div>
        </>
      )}

      <p className="footnote">
        This link is private to you. If you forward it, whoever receives it can read and accept this
        proposal.
      </p>
    </div>
  );
}
