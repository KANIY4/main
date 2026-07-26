import { ActionForm, Field } from '@/components/form';
import { requestPasswordResetAction } from '@/lib/actions/auth';

export const metadata = { title: 'Reset your password' };

export default function ForgotPage() {
  return (
    <div className="narrow stack">
      <h1>Reset your password</h1>
      <p className="muted">
        We will email a reset link if that address has an account. For everyone&rsquo;s safety the
        answer is the same either way.
      </p>
      <div className="card">
        <ActionForm action={requestPasswordResetAction} submitLabel="Send reset link">
          <Field label="Email address" name="email" type="email" required inputMode="email" />
        </ActionForm>
      </div>
    </div>
  );
}
