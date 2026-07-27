import { BrandHeader } from '@/components/brand-header';
import { ServiceWorkerRegistration } from '@/components/service-worker';
import { SiteNav } from '@/components/site-nav';
import { assertDeploymentIsCoherent } from '@/lib/startup-checks';

/**
 * The signed-in shell.
 *
 * Lives in a route group so the client-facing proposal at /p/[token] does not
 * inherit it. A client reading a quotation should not see a dashboard link, an
 * organisation switcher, or any other evidence of the tool that produced it.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Checked on the signed-in shell rather than at module load: a misconfigured
  // production deployment should fail where somebody is looking at it, and the
  // public proposal at /p/[token] should keep working for a client who already
  // has a link even while the operator sorts the configuration out.
  assertDeploymentIsCoherent();

  return (
    <>
      <BrandHeader>
        <nav className="site-nav" aria-label="Main">
          <SiteNav />
        </nav>
      </BrandHeader>
      <main>
        <div className="wrap">{children}</div>
      </main>
      <ServiceWorkerRegistration />
    </>
  );
}
