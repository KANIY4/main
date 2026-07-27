import 'server-only';

import { getEmailProvider } from '@cleanquote/email';
import { getStorage } from '@cleanquote/storage';

/**
 * Refuses to serve a production deployment that is configured to lie.
 *
 * Every integration in this product degrades to a working local mode, which is
 * what makes it runnable before any external account exists. On a developer's
 * machine that is the right trade. On a serverless host it is not, and the
 * failure is not obvious from the outside:
 *
 *  - **Local storage** writes to the instance's filesystem. Serverless
 *    instances are ephemeral and not shared, so an upload appears to succeed
 *    and the photo is gone — or missing from the very next request, which is
 *    served by a different instance.
 *  - **The local email provider** records messages instead of sending them, and
 *    `/dev/inbox` refuses to render in production because the bodies contain
 *    single-use tokens. Nobody can confirm an address, so nobody can sign in at
 *    all. The registration form would work and the product would be unusable.
 *  - **A per-process media signing secret** signs links on one instance that
 *    will not verify on another, so images break intermittently. This one needs
 *    no separate check: it is a property of the local adapter, which is already
 *    refused.
 *
 * Each of these is a silent, confusing failure in front of real users. Failing
 * at boot with the variable name is strictly better.
 *
 * `ALLOW_LOCAL_ADAPTERS_IN_PRODUCTION=true` is the deliberate escape hatch, for
 * a production build being smoke-tested on one machine — which is exactly what
 * the end-to-end run does.
 */
export function assertDeploymentIsCoherent(): void {
  if (process.env.NODE_ENV !== 'production') return;
  // Not during the build. `next build` renders pages to discover their output,
  // in an environment that is not the one that will serve them — on Vercel the
  // runtime variables are attached to the deployment, not to the builder. A
  // check that fires here refuses to build a deployment that would have run
  // perfectly well.
  if (process.env['NEXT_PHASE'] === 'phase-production-build') return;
  if (process.env['ALLOW_LOCAL_ADAPTERS_IN_PRODUCTION'] === 'true') return;

  const problems: string[] = [];

  if (!process.env['DATABASE_URL']) {
    problems.push('DATABASE_URL is not set, so no quote, client or user can be read or written.');
  }

  if (getStorage().name === 'local') {
    problems.push(
      'STORAGE_PROVIDER is local. Captured photos would be written to an ephemeral instance ' +
        'filesystem and lost. Set STORAGE_PROVIDER=s3 with its endpoint and credentials.',
    );
  }

  if (getEmailProvider().name === 'local') {
    problems.push(
      'No email provider is configured. Verification, invitation and proposal links would be ' +
        'recorded but never sent, and /dev/inbox does not render in production — nobody could ' +
        'confirm an address. Set EMAIL_PROVIDER, EMAIL_API_URL and EMAIL_API_KEY.',
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `This production deployment is not configured to work:\n\n${problems
        .map((problem) => `  • ${problem}`)
        .join('\n')}\n\nSee docs/DEPLOYMENT.md. Set ALLOW_LOCAL_ADAPTERS_IN_PRODUCTION=true to ` +
        'run a production build against the local adapters anyway, which is only sensible on a ' +
        'single machine you control.',
    );
  }
}
