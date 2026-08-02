import { BrandHeader } from '@/components/brand-header';

// Rendered per request so its scripts carry the nonce the CSP header expects.
// See app/(auth)/layout.tsx.
export const dynamic = 'force-dynamic';

/**
 * Pages that need no configuration at all.
 *
 * The demonstration cases are priced by the real engine from fixtures, so they
 * work with no database, no storage and no mail provider. They deliberately sit
 * outside the signed-in group, whose layout refuses to render when those are
 * missing — a deployment with nothing configured yet should still be able to
 * show what the pricing engine does.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BrandHeader />
      <main>
        <div className="wrap">{children}</div>
      </main>
    </>
  );
}
