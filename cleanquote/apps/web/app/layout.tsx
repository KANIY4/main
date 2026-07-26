import { publicEnv } from '@cleanquote/config';
import type { Metadata } from 'next';

import './globals.css';

const appName = publicEnv().NEXT_PUBLIC_APP_NAME;

export const metadata: Metadata = {
  title: {
    default: `${appName} — commercial cleaning quotation intelligence`,
    template: `%s — ${appName}`,
  },
  description:
    'Capture a site, price it against a defensible cost model, and compare pricing strategies before a proposal ever leaves the building.',
  robots: { index: false, follow: false },
  // Installable so the capture screen can be launched from a home screen and
  // gets the whole viewport. See app/manifest.ts for what that does and does
  // not promise.
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default' },
};

export const viewport = {
  themeColor: '#1f6feb',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
};

/**
 * The document shell, and nothing else.
 *
 * The product's own branding lives in the signed-in and sign-in layouts, not
 * here, because a client reading a proposal should see the cleaning company's
 * name — not the name of the tool that produced the document.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
