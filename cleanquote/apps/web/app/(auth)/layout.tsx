import { BrandHeader } from '@/components/brand-header';

/**
 * These pages must render per request.
 *
 * The Content Security Policy carries a per-request nonce, and a statically
 * prerendered page is baked once with whatever nonce existed at build time —
 * so its scripts never match the header and the page silently fails to
 * hydrate. Rendering them dynamically costs nothing here; they are three small
 * forms.
 */
export const dynamic = 'force-dynamic';

/** Sign-in, registration and password recovery: brand, no navigation. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BrandHeader />
      <main>
        <div className="wrap wrap-narrow">{children}</div>
      </main>
    </>
  );
}
