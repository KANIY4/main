import { BrandHeader } from '@/components/brand-header';

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
