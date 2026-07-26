import Link from 'next/link';

import { signOutAction, switchOrganisationAction } from '@/lib/actions/auth';
import { currentActor, currentSession } from '@/lib/session';

/**
 * The header's right-hand side.
 *
 * Rendered on the server from the live session, so the organisation shown is
 * the one the request will actually run as. The switcher posts a form rather
 * than holding client state — the active organisation is a server-side fact.
 */
export async function SiteNav() {
  const [session, actor] = await Promise.all([currentSession(), currentActor()]);

  if (!session) {
    return (
      <>
        <Link className="nav-link" href="/demo">
          Worked examples
        </Link>
        <Link className="nav-link" href="/sign-in">
          Sign in
        </Link>
      </>
    );
  }

  return (
    <>
      <Link className="nav-link" href="/dashboard">
        Dashboard
      </Link>
      <Link className="nav-link" href="/clients">
        Clients
      </Link>
      <Link className="nav-link" href="/approvals">
        Approvals
      </Link>

      {session.memberships.length > 1 ? (
        <form action={switchOrganisationAction} className="org-switcher">
          <label className="visually-hidden" htmlFor="org-switch">
            Active organisation
          </label>
          <select id="org-switch" name="organisationId" defaultValue={actor?.organisationId ?? ''}>
            {session.memberships.map((membership) => (
              <option key={membership.organisation_id} value={membership.organisation_id}>
                {membership.organisation_name}
              </option>
            ))}
          </select>
          <button type="submit" className="button button-quiet">
            Switch
          </button>
        </form>
      ) : (
        actor && <span className="faint">{actor.organisationName}</span>
      )}

      <form action={signOutAction}>
        <button type="submit" className="button button-quiet">
          Sign out
        </button>
      </form>
    </>
  );
}
