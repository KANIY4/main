import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ActionForm, Field } from '@/components/form';
import { signInAction } from '@/lib/actions/auth';
import { currentSession } from '@/lib/session';

export const metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ invitation?: string }>;
}) {
  const session = await currentSession();
  if (session) redirect(session.memberships.length > 0 ? '/dashboard' : '/onboarding');

  const { invitation } = await searchParams;

  return (
    <div className="narrow stack">
      <div>
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in</h1>
      </div>

      {invitation && (
        <p className="banner banner-info">
          Sign in to accept your invitation. It is issued to one address and can only be accepted
          once.
        </p>
      )}

      <div className="card">
        <ActionForm action={signInAction} submitLabel="Sign in" pendingLabel="Signing in…">
          {invitation && <input type="hidden" name="invitationToken" value={invitation} />}
          <Field label="Email address" name="email" type="email" required inputMode="email" />
          <Field label="Password" name="password" type="password" required />
        </ActionForm>
      </div>

      <p className="faint">
        <Link href="/register">Create an account</Link> ·{' '}
        <Link href="/forgot">Forgot password</Link>
      </p>
    </div>
  );
}
