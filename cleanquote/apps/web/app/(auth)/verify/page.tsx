import Link from 'next/link';

import { verifyEmailAction } from '@/lib/actions/auth';

export const metadata = { title: 'Confirm your email' };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token
    ? await verifyEmailAction(token)
    : { error: 'That link is missing its confirmation token.' };

  return (
    <div className="narrow stack">
      <h1>Confirm your email</h1>
      {result.error ? (
        <p className="banner banner-danger">{result.error}</p>
      ) : (
        <p className="banner banner-info">{result.notice}</p>
      )}
      <p>
        <Link href="/sign-in">Go to sign in</Link>
      </p>
    </div>
  );
}
