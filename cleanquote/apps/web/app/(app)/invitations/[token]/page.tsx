import Link from 'next/link';

import { ActionForm } from '@/components/form';
import { acceptInvitationAction } from '@/lib/actions/auth';
import { currentSession } from '@/lib/session';

export const metadata = { title: 'Accept your invitation' };

/**
 * Invitation acceptance.
 *
 * The token is matched on its hash and bound to the address it was issued to, so
 * signing in as somebody else and opening the link achieves nothing. That check
 * lives in the workflow layer; this page only collects the confirmation.
 */
export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await currentSession();

  if (!session) {
    return (
      <div className="stack narrow">
        <h1>You have been invited</h1>
        <p className="muted">
          Sign in — or create your account — with the address the invitation was sent to, and it
          will be applied automatically.
        </p>
        <p>
          <Link className="button" href={`/sign-in?invitation=${encodeURIComponent(token)}`}>
            Sign in to accept
          </Link>
        </p>
        <p className="faint">
          No account yet?{' '}
          <Link href={`/register?invitation=${encodeURIComponent(token)}`}>Create one</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="stack narrow">
      <h1>Accept your invitation</h1>
      <p className="muted">
        You are signed in as {session.email}. An invitation can only be accepted by the address it
        was issued to.
      </p>
      <div className="card">
        <ActionForm action={acceptInvitationAction} submitLabel="Join" pendingLabel="Joining…">
          <input type="hidden" name="token" value={token} />
        </ActionForm>
      </div>
    </div>
  );
}
