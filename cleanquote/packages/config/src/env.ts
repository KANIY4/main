import { z } from 'zod';

/**
 * Typed environment configuration.
 *
 * Two rules this module exists to enforce:
 *
 *  1. Server secrets never reach the client. `serverEnv()` throws if called in a
 *     browser bundle, so an accidental import from a client component fails at
 *     build time rather than shipping a service key to every visitor.
 *  2. Missing configuration fails at startup with a readable message, not on the
 *     first request that happens to need it.
 *
 * Anything absent degrades to a documented local mode rather than a crash, so the
 * application is runnable before any external account exists.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default('CleanQuote AI'),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  /** The anon key is publishable by design; it is useless without RLS behind it. */
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
  NEXT_PUBLIC_APP_URL: z.url().default('http://localhost:3000'),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  ANTHROPIC_API_KEY: z.string().min(20).optional(),
  AI_PROVIDER: z.enum(['anthropic', 'mock']).default('mock'),
  AI_MODEL_FAST: z.string().default('claude-haiku-4-5-20251001'),
  AI_MODEL_CAPABLE: z.string().default('claude-opus-5'),
  /** Hard ceiling per organisation per month, in the billing currency. */
  AI_MONTHLY_BUDGET_PER_ORG: z.string().default('50'),
  STRIPE_SECRET_KEY: z.string().min(10).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(10).optional(),
  SENTRY_DSN: z.string().optional(),
  /**
   * Where captured media lives. `local` writes under STORAGE_LOCAL_ROOT and is
   * the default so the product runs before any storage account exists;
   * `s3` targets any S3-compatible endpoint, Supabase Storage included.
   */
  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_ROOT: z.string().default('.storage'),
  STORAGE_BUCKET: z.string().default('capture'),
  STORAGE_ENDPOINT: z.url().optional(),
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  /** How long a media link stays valid. Short by default; these are site photos. */
  STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(86_400).default(600),
  /** Signs local media links. Generated per process when unset, which is fine for one node. */
  STORAGE_URL_SIGNING_SECRET: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
}

let cachedPublic: PublicEnv | undefined;

export function publicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;
  // Next.js inlines NEXT_PUBLIC_* at build time, so these must be read as literal
  // property accesses rather than through a dynamic key.
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!parsed.success) {
    throw new Error(`Invalid public environment configuration:\n${formatIssues(parsed.error)}`);
  }
  cachedPublic = parsed.data;
  return cachedPublic;
}

let cachedServer: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error(
      'serverEnv() was called in a browser bundle. Server configuration must never be imported from a client component.',
    );
  }
  if (cachedServer) return cachedServer;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid server environment configuration:\n${formatIssues(parsed.error)}`);
  }
  cachedServer = parsed.data;
  return cachedServer;
}

/**
 * Which capabilities the current deployment actually has.
 *
 * The application is designed to run without any of them: without Supabase it
 * serves the demonstration cases from local fixtures, and without an AI key it
 * uses the mock provider. Both states are visible in the UI rather than silently
 * pretending to work.
 */
export interface RuntimeCapabilities {
  readonly database: boolean;
  readonly ai: boolean;
  readonly billing: boolean;
  readonly errorReporting: boolean;
}

export function runtimeCapabilities(): RuntimeCapabilities {
  const pub = publicEnv();
  const server = typeof window === 'undefined' ? serverEnv() : undefined;
  return {
    database: Boolean(pub.NEXT_PUBLIC_SUPABASE_URL && pub.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    ai: Boolean(server?.ANTHROPIC_API_KEY) && server?.AI_PROVIDER === 'anthropic',
    billing: Boolean(server?.STRIPE_SECRET_KEY),
    errorReporting: Boolean(server?.SENTRY_DSN),
  };
}
