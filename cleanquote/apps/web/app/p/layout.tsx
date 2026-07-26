/**
 * The client-facing shell.
 *
 * No product branding, no navigation, no link back into the application. The
 * only identity on the page is the cleaning company's, which comes from the
 * proposal itself.
 */
export default function ProposalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main>
      <div className="wrap wrap-narrow">{children}</div>
    </main>
  );
}
