import { publicEnv } from '@cleanquote/config';
import type { MetadataRoute } from 'next';

/**
 * Installability, and nothing more.
 *
 * This makes the capture screen launchable from a home screen and gives it the
 * full viewport, which is what a walkthrough on a phone actually needs. It does
 * not claim offline support: the service worker caches the shell so a lost
 * signal produces a readable page instead of a browser error, but captured work
 * is not queued for later upload, and nothing in the interface says it is.
 */
export default function manifest(): MetadataRoute.Manifest {
  const name = publicEnv().NEXT_PUBLIC_APP_NAME;
  return {
    name,
    short_name: name.split(/\s+/)[0] ?? name,
    description: 'Capture a site and price it before you leave the car park.',
    start_url: '/dashboard',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f7f8fa',
    theme_color: '#1f6feb',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
