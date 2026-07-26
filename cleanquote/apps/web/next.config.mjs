/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source rather than build output, so Next
  // compiles them as part of the app. One fewer build step to keep in sync.
  transpilePackages: [
    '@cleanquote/ai',
    '@cleanquote/auth',
    '@cleanquote/config',
    '@cleanquote/database',
    '@cleanquote/email',
    '@cleanquote/workflow',
    '@cleanquote/storage',
    '@cleanquote/pricing-engine',
    '@cleanquote/seed-cases',
    '@cleanquote/types',
    '@cleanquote/validation',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            // Camera is allowed on this origin only, for walkthrough capture.
            // Everything else stays off: a quotation tool has no business
            // reaching for a microphone or a location.
            value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Next's runtime needs inline styles; scripts stay same-origin.
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self' https://*.supabase.co",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
