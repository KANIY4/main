import { BrandHeader } from '@/components/brand-header';
import { SiteNav } from '@/components/site-nav';

/**
 * The signed-in shell.
 *
 * Lives in a route group so the client-facing proposal at /p/[token] does not
 * inherit it. A client reading a quotation should not see a dashboard link, an
 * organisation switcher, or any other evidence of the tool that produced it.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
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
    </>
  );
}
