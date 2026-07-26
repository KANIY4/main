import { redirect } from 'next/navigation';

import { currentSession } from '@/lib/session';

/**
 * The front door.
 *
 * Signed in with an organisation, you land in the workspace. Signed in without
 * one, you finish setting up. Signed out, you sign in. There is no marketing
 * page in front of a tool people open twenty times a day.
 */
export default async function HomePage() {
  const session = await currentSession();
  if (!session) redirect('/sign-in');
  redirect(session.memberships.length > 0 ? '/dashboard' : '/onboarding');
}
