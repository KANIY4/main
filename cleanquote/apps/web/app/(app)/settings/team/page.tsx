import { listMembers, listRoles } from '@cleanquote/workflow';

import { ActionForm, Field, InlineForm, Select } from '@/components/form';
import { inviteMemberAction, setMemberStatusAction } from '@/lib/actions/workflow';
import { assertPermission, requireActor } from '@/lib/session';

export const metadata = { title: 'Your team' };

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  invited: 'Invited',
  suspended: 'Suspended',
  removed: 'Removed',
};

/**
 * Membership and roles.
 *
 * Suspending somebody takes effect on their next request — the permission check
 * runs against live membership on every request, not against whatever was true
 * when they signed in.
 */
export default async function TeamPage() {
  const actor = await requireActor();
  assertPermission(actor, 'user.manage');

  const [members, roles] = await Promise.all([
    listMembers(actor.userId, actor.organisationId),
    listRoles(actor.userId),
  ]);

  const roleOptions = roles.map((role) => ({ value: role.id, label: role.label }));

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">{actor.organisationName}</p>
        <h1>Your team</h1>
        <p className="muted">
          Roles decide what somebody can see and do. Cost and profit visibility are separate
          permissions from editing — an estimator can build a quote without seeing the margin on it.
        </p>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.user_id}>
                <td>
                  {member.full_name ?? member.email}
                  <span className="faint"> {member.email}</span>
                </td>
                <td className="muted">{member.role_label ?? '—'}</td>
                <td>
                  <span className={`pill pill-member-${member.status}`}>
                    {STATUS_LABELS[member.status] ?? member.status}
                  </span>
                </td>
                <td>
                  {member.user_id !== actor.userId &&
                    (member.status === 'suspended' ? (
                      <InlineForm
                        action={setMemberStatusAction}
                        label="Restore access"
                        hidden={{ memberUserId: member.user_id, status: 'active' }}
                      />
                    ) : (
                      <InlineForm
                        action={setMemberStatusAction}
                        label="Suspend"
                        variant="danger"
                        confirmMessage="Suspend this person? They lose access on their next request."
                        hidden={{ memberUserId: member.user_id, status: 'suspended' }}
                      />
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card">
        <p className="eyebrow">Invite a colleague</p>
        <ActionForm
          action={inviteMemberAction}
          submitLabel="Send invitation"
          pendingLabel="Sending…"
        >
          <div className="grid grid-2">
            <Field label="Email address" name="email" type="email" inputMode="email" required />
            <Select label="Role" name="roleId" options={roleOptions} />
          </div>
          <p className="faint">
            The invitation is issued to that address only, expires in fourteen days, and can be
            accepted once.
          </p>
        </ActionForm>
      </section>
    </div>
  );
}
