import { NextResponse, type NextRequest } from 'next/server';

/**
 * Per-request Content Security Policy.
 *
 * The policy has to live here rather than in `next.config.mjs` because it needs
 * a fresh nonce per request. (`proxy.ts` is Next 16's name for what used to be
 * `middleware.ts`.) Next injects its bootstrap and hydration data as
 * inline scripts; a static `script-src 'self'` blocks them, the application
 * never hydrates, and every form silently degrades to a full page post with no
 * saving or error state. That is exactly the failure this policy was meant to
 * prevent, arriving as a broken product instead of an attack.
 *
 * The alternative — `'unsafe-inline'` — would work and would also permit any
 * script an injection managed to place on the page, which is the whole thing a
 * CSP exists to stop. A nonce keeps the protection and costs one header.
 */
export default function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const policy = [
    "default-src 'self'",
    // The nonce covers Next's inline bootstrap; `'self'` covers the chunk files
    // it then requests. Deliberately no `'strict-dynamic'`: it causes `'self'`
    // to be ignored, and Next does not nonce every `<script src>` it emits, so
    // the chunks are refused and the page never hydrates.
    `script-src 'self' 'nonce-${nonce}'`,
    // Next injects critical CSS inline during streaming; there is no nonce hook
    // for it, and a stylesheet cannot exfiltrate the way a script can.
    "style-src 'self' 'unsafe-inline'",
    // blob: is required for the capture preview, which renders the compressed
    // image before it is uploaded. data: covers the inlined icons.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

  const headers = new Headers(request.headers);
  // Next parses the nonce out of the policy on the *request* to stamp its own
  // inline scripts. Setting only `x-nonce` leaves them unnonced and refused —
  // the header has to be on both sides.
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and the icons, which need no policy and
    // are requested often enough that skipping the work is worth it.
    {
      source: '/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-maskable.svg|sw.js).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
