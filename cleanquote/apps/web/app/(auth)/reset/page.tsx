import Link from 'next/link';

import { ActionForm, Field } from '@/components/form';
import { completePasswordResetAction } from '@/lib/actions/auth';

export const metadata = { title: 'Choose a new password' };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <div className="narrow stack">
        <h1>Choose a new password</h1>
        <p className="banner banner-danger">That link is missing its reset token.</p>
      </div>
    );
  }

  return (
    <div className="narrow stack">
      <h1>Choose a new password</h1>
      <p className="muted">
        Setting a new password signs out every existing session on this account.
      </p>
      <div className="card">
        <ActionForm action={completePasswordResetAction} submitLabel="Update password">
          <input type="hidden" name="token" value={token} />
          <Field
            label="New password"
            name="password"
            type="password"
            required
            hint="At least 12 characters."
          />
        </ActionForm>
      </div>
      <p className="faint">
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </div>
  );
}
