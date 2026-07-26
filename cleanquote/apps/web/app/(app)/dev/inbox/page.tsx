import { auditStore, withSystem } from '@cleanquote/database';
import { getEmailProvider } from '@cleanquote/email';
import { notFound } from 'next/navigation';

import { requireActor } from '@/lib/session';

export const metadata = { title: 'Development inbox' };

/**
 * The local mail inbox.
 *
 * With no mail credentials configured, the local provider records messages
 * instead of sending them, and this page is where they land — so verification,
 * invitation and proposal links are genuinely usable in development without
 * anything leaving the machine.
 *
 * It refuses to render against a real provider, because the bodies include
 * single-use tokens and this page has no per-recipient authorisation.
 */
export default async function DevInboxPage() {
  // Reachable only by a signed-in member, and only in local mode.
  await requireActor();
  if (getEmailProvider().name !== 'local' || process.env.NODE_ENV === 'production') notFound();

  const messages = await withSystem(async (db) => auditStore.listEmails(db, 50));

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">Local development only</p>
        <h1>Development inbox</h1>
        <p className="muted">
          No mail provider is configured, so nothing was actually sent. Set{' '}
          <code>EMAIL_PROVIDER</code>, <code>EMAIL_API_URL</code> and <code>EMAIL_API_KEY</code> to
          deliver for real; this page then refuses to render.
        </p>
      </div>

      {messages.length === 0 ? (
        <div className="card empty">
          <p>No messages yet.</p>
        </div>
      ) : (
        messages.map((message) => (
          <article className="card" key={message.id}>
            <p className="eyebrow">
              {message.kind.replace(/_/g, ' ')} · {message.status}
            </p>
            <h2>{message.subject}</h2>
            <p className="faint">
              To {message.to_email} · {message.created_at.toLocaleString()}
            </p>
            <pre className="email-body">{message.body_text}</pre>
          </article>
        ))
      )}
    </div>
  );
}
