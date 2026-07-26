'use client';

import { useEffect } from 'react';

/**
 * Registers the shell service worker.
 *
 * Only in production: a worker caching a development build produces stale
 * assets and an afternoon of confusion. It caches the shell so a lost signal
 * shows a readable page — nothing more, and the offline page says so.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // A failed registration costs the offline page and nothing else, so it is
      // not worth interrupting anyone over.
    });
  }, []);

  return null;
}
