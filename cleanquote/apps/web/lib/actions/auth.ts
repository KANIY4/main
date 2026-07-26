'use server';

import * as auth from '@cleanquote/auth';
import { sendEmail } from '@cleanquote/email';
import { publicEnv } from '@cleanquote/config';
import { acceptInvitation } from '@cleanquote/workflow';
import { redirect } from 'next/navigation';

import { consumeRateLimit } from '../rate-limit';
import {
  clearSessionCookie,
  currentSession,
  readSessionToken,
  requestContext,
  setActiveOrganisation,
  setSessionCookie,
} from '../session';

/**
 * Authentication actions.
 *
 * Every one returns a plain `{ error }` shape rather than throwing, so a form
 * can render the message without a client-side error boundary. Nothing here
 * reveals whether an address has an account.
 */

export interface FormState {
  readonly error?: string;
  readonly notice?: string;
}

function messageFor(error: unknown): string {
  if (error instanceof auth.WeakPasswordError) return error.message;
  if (error instanceof auth.AuthError) return error.message;
  return 'Something went wrong. Try again.';
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const fullName = String(formData.get('fullName') ?? '').trim();

  if (!email || !password) return { error: 'Enter an email address and a password.' };

  try {
    const registered = await auth.register({ email, password, fullName });

    // The verification link is emailed. With the local provider that means the
    // development inbox at /dev/inbox — nothing leaves the machine.
    const base = publicEnv().NEXT_PUBLIC_APP_URL;
    await sendEmail({
      kind: 'email_verification',
      to: email,
      subject: 'Confirm your email address',
      body: `Confirm your address to finish setting up your account:\n\n${base}/verify?token=${registered.verificationToken}`,
    });

    return {
      notice: 'Account created. Check your inbox for the confirmation link before signing in.',
    };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function verifyEmailAction(token: string): Promise<FormState> {
  try {
    await auth.verifyEmail(token);
    return { notice: 'Email confirmed. You can sign in now.' };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const invitationToken = String(formData.get('invitationToken') ?? '').trim();

  const context = await requestContext();
  // Two windows: one on the address so a single account cannot be ground
  // through a dictionary, one on the caller so a spray across many addresses
  // from one source is throttled too.
  for (const key of [`sign-in:${email.toLowerCase()}`, `sign-in-ip:${context.ip ?? 'unknown'}`]) {
    const limit = await consumeRateLimit(key, { limit: 10, windowSeconds: 300 });
    if (!limit.allowed) {
      return {
        error: `Too many sign-in attempts. Try again in ${limit.retryAfterSeconds} seconds.`,
      };
    }
  }

  let userId: string;
  try {
    const session = await auth.signIn(email, password, context);
    await setSessionCookie(session.sessionToken, session.expiresAt);
    userId = session.userId;
  } catch (error) {
    return { error: messageFor(error) };
  }

  // A pending invitation is redeemed on the first successful sign-in, so an
  // invited colleague lands inside the organisation rather than at onboarding.
  if (invitationToken) {
    await acceptInvitation({ token: invitationToken, userId, userEmail: email });
  }

  const session = await currentSession();
  redirect(session && session.memberships.length > 0 ? '/dashboard' : '/onboarding');
}

export async function signOutAction(): Promise<void> {
  const token = await readSessionToken();
  if (token) await auth.signOut(token);
  await clearSessionCookie();
  redirect('/sign-in');
}

export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim();

  const context = await requestContext();
  const limit = await consumeRateLimit(`reset:${context.ip ?? 'unknown'}`, {
    limit: 5,
    windowSeconds: 900,
  });
  // The same answer as the success path: a limiter that says "slow down" to a
  // stranger and "if that address has an account" to everyone else has just
  // become an account-existence oracle.
  if (!limit.allowed) {
    return { notice: 'If that address has an account, a reset link is on its way.' };
  }

  const reset = await auth.beginPasswordReset(email);

  if (reset) {
    const base = publicEnv().NEXT_PUBLIC_APP_URL;
    await sendEmail({
      kind: 'password_reset',
      to: email,
      subject: 'Reset your password',
      body: `Reset your password using this link:\n\n${base}/reset?token=${reset.token}\n\nIt expires in one hour. If you did not ask for this, ignore it.`,
    });
  }

  // The same answer either way. Saying "no such account" would let anyone test
  // which addresses are registered.
  return {
    notice: 'If that address has an account, a reset link is on its way.',
  };
}

export async function completePasswordResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');

  try {
    await auth.completePasswordReset(token, password);
    return { notice: 'Password updated. Sign in with your new password.' };
  } catch (error) {
    return { error: messageFor(error) };
  }
}

export async function switchOrganisationAction(formData: FormData): Promise<void> {
  const organisationId = String(formData.get('organisationId') ?? '');
  const session = await currentSession();
  // Re-checked against live membership: a forged form value naming another
  // tenant simply does not match anything the user belongs to.
  if (session?.memberships.some((m) => m.organisation_id === organisationId)) {
    await setActiveOrganisation(organisationId);
  }
  redirect('/dashboard');
}

export async function acceptInvitationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get('token') ?? '');
  const session = await currentSession();
  if (!session) return { error: 'Sign in first, then open the invitation link again.' };

  const result = await acceptInvitation({
    token,
    userId: session.userId,
    userEmail: session.email,
  });
  if (!result) {
    return {
      error:
        'That invitation is not valid for this account. Invitations are issued to one address and can only be accepted once.',
    };
  }

  await setActiveOrganisation(result.organisationId);
  redirect('/dashboard');
}
