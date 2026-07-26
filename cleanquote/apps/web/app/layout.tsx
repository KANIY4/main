import { publicEnv } from '@cleanquote/config';
import type { Metadata } from 'next';
import Link from 'next/link';

import './globals.css';

// The brand is configuration, not a hard-coded string. An organisation on a
// white-label plan changes one environment variable, not the source.
const appName = publicEnv().NEXT_PUBLIC_APP_NAME;

export const metadata: Metadata = {
  title: {
    default: `${appName} — commercial cleaning quotation intelligence`,
    template: `%s — ${appName}`,
  },
  description:
    'Capture a site, price it against a defensible cost model, and compare pricing strategies before a proposal ever leaves the building.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const initials = appName
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link className="brand" href="/">
              <span className="brand-mark" aria-hidden="true">
                {initials}
              </span>
              {appName}
            </Link>
            <span className="spacer" />
            <span className="faint">Quotation intelligence</span>
          </div>
        </header>
        <main>
          <div className="wrap">{children}</div>
        </main>
      </body>
    </html>
  );
}
