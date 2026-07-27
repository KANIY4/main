export const metadata = { title: 'No connection' };

// Rendered per request so its scripts carry the nonce the CSP header expects.
// See app/(auth)/layout.tsx.
export const dynamic = 'force-dynamic';

/**
 * Shown when a navigation fails with no signal.
 *
 * It says plainly that nothing was saved, because the alternative — a reassuring
 * page that implies work is queued — would be a lie. Anything typed into a form
 * that did not submit is still in the browser's back-forward cache; anything
 * else is gone.
 */
export default function OfflinePage() {
  return (
    <main>
      <div className="wrap wrap-narrow stack">
        <h1>No connection</h1>
        <p className="muted">
          This page could not be loaded. Nothing you were part-way through has been saved to the
          server — if you had a form open, use the back button and it should still be there.
        </p>
        <p className="muted">
          Photos and areas already showing as uploaded are safe. Anything that said
          &ldquo;uploading&rdquo; when the signal dropped will need to be added again.
        </p>
        <p>
          <a className="button" href="/dashboard">
            Try again
          </a>
        </p>
      </div>
    </main>
  );
}
