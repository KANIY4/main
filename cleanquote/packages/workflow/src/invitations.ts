import { expiryFromNow, hashToken, issueToken, TOKEN_LIFETIMES } from '@cleanquote/auth';
import { auditStore, tenancyStore, withSystem, withUser } from '@cleanquote/database';
import { sendEmail } from '@cleanquote/email';

/**
 * Organisation invitations and membership changes.
 */

export interface InviteResult {
  readonly invitationId: string;
  /** Returned once so it can be emailed. Only its hash is stored. */
  readonly token: string;
}

/**
 * Invites someone to an organisation.
 *
 * Creating the invitation runs under RLS: the policy requires `user.manage` and
 * that the row names the caller as the inviter, so a permitted user cannot issue
 * an invitation attributed to a colleague.
 */
export async function inviteMember(input: {
  userId: string;
  organisationId: string;
  organisationName: string;
  email: string;
  roleId: string;
  baseUrl: string;
}): Promise<InviteResult> {
  const token = issueToken();

  const invitationId = await withUser(input.userId, async (db) => {
    const id = await tenancyStore.createInvitation(db, {
      organisationId: input.organisationId,
      email: input.email,
      roleId: input.roleId,
      tokenHash: token.hash,
      expiresAt: expiryFromNow(TOKEN_LIFETIMES.invitation),
      invitedByUserId: input.userId,
    });

    await auditStore.writeAudit(db, {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: 'membership.invited',
      entityType: 'organisation',
      entityId: input.organisationId,
      after: { email: input.email, roleId: input.roleId },
    });

    return id;
  });

  const link = `${input.baseUrl.replace(/\/$/, '')}/invitations/${token.value}`;
  await sendEmail({
    kind: 'invitation',
    to: input.email,
    subject: `You have been invited to ${input.organisationName}`,
    body: `You have been invited to join ${input.organisationName}.\n\nAccept the invitation here:\n${link}\n\nThis link expires in 14 days.`,
    organisationId: input.organisationId,
    relatedEntityType: 'invitation',
    relatedEntityId: invitationId,
  });

  return { invitationId, token: token.value };
}

/**
 * Redeems an invitation.
 *
 * Runs at system level because the invitee is by definition not yet a member and
 * could not satisfy the membership INSERT policy. The token is the
 * authorisation: single-use, expiring, matched on its hash, and bound to the
 * address it was issued for so a leaked link cannot admit a different account.
 */
export async function acceptInvitation(input: {
  token: string;
  userId: string;
  userEmail: string;
}): Promise<{ organisationId: string } | undefined> {
  return withSystem(async (db) => {
    const result = await tenancyStore.acceptInvitation(
      db,
      hashToken(input.token),
      input.userId,
      input.userEmail,
    );
    if (!result) return undefined;

    await auditStore.writeAudit(db, {
      organisationId: result.organisationId,
      actorUserId: input.userId,
      action: 'membership.accepted',
      entityType: 'organisation',
      entityId: result.organisationId,
      after: { email: input.userEmail },
    });

    return result;
  });
}

/**
 * Suspends or reactivates a member.
 *
 * A suspended member loses access on their next request — `is_org_member` only
 * matches active membership, so nothing further is needed to lock them out.
 */
export async function setMemberStatus(input: {
  userId: string;
  organisationId: string;
  targetUserId: string;
  status: 'active' | 'suspended';
  reason?: string | null;
}): Promise<void> {
  await withUser(input.userId, async (db) => {
    await tenancyStore.setMemberStatus(db, input.organisationId, input.targetUserId, input.status);
    await auditStore.writeAudit(db, {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: `membership.${input.status}`,
      entityType: 'membership',
      entityId: input.targetUserId,
      reason: input.reason ?? null,
      after: { status: input.status },
    });
  });
}

export async function listMembers(userId: string, organisationId: string) {
  return withUser(userId, async (db) => tenancyStore.listMembers(db, organisationId));
}

export async function listRoles(userId: string) {
  return withUser(userId, async (db) => tenancyStore.listSystemRoles(db));
}
