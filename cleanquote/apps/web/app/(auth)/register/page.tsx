import Link from 'next/link';

import { ActionForm, Field } from '@/components/form';
import { registerAction } from '@/lib/actions/auth';

export const metadata = { title: 'Create an account' };

export default function RegisterPage() {
  return (
    <div className="narrow stack">
      <div>
        <p className="eyebrow">Get started</p>
        <h1>Create an account</h1>
        <p className="muted">
          You will confirm your email address, then set up your company. Quick Start has you quoting
          in a few minutes.
        </p>
      </div>

      <div className="card">
        <ActionForm action={registerAction} submitLabel="Create account" pendingLabel="Creating…">
          <Field label="Your name" name="fullName" />
          <Field label="Email address" name="email" type="email" required inputMode="email" />
          <Field
            label="Password"
            name="password"
            type="password"
            required
            hint="At least 12 characters. Length matters far more than punctuation."
          />
        </ActionForm>
      </div>

      <p className="faint">
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </div>
  );
}
