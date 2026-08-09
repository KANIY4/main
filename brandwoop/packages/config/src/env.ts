import { z } from "zod";

/**
 * Environment validation runs at build and at runtime start (scope section 13).
 * A missing or malformed variable fails fast instead of surfacing as a
 * half-configured production deployment.
 */

const nonEmpty = z.string().min(1);
const httpsUrl = z.url().refine((value) => value.startsWith("https://"), {
  message: "Must be an https URL",
});

/** Variables only ever read on the server. Never bundled into a client. */
export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "preview", "staging", "production"]).default("local"),
  DATABASE_URL: nonEmpty,
  /** Service-role credential. Runtime, migration, CI and support each use a distinct identity. */
  DATABASE_SERVICE_KEY: nonEmpty,
  STORAGE_BUCKET_EVIDENCE: nonEmpty,
  STORAGE_BUCKET_REPORTS: nonEmpty,
  EMAIL_API_KEY: nonEmpty,
  EMAIL_SENDER_ADDRESS: z.email(),
  CRON_SHARED_SECRET: z.string().min(32),
  SESSION_COOKIE_DOMAIN: nonEmpty,
  RELEASE_VERSION: z.string().default("0.0.0-dev"),
});

/** Variables safe to expose to browsers and the mobile bundle. */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: httpsUrl.or(z.literal("http://localhost:3000")),
  NEXT_PUBLIC_API_VERSION: z.literal("v1").default("v1"),
  NEXT_PUBLIC_SUPPORT_EMAIL: z.email(),
});

export const mobileEnvSchema = z.object({
  EXPO_PUBLIC_API_BASE_URL: httpsUrl.or(z.literal("http://localhost:3000")),
  EXPO_PUBLIC_APP_ENV: z.enum(["development", "preview", "production"]),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type MobileEnv = z.infer<typeof mobileEnvSchema>;

class EnvironmentError extends Error {
  constructor(scope: string, issues: string[]) {
    super(`Invalid ${scope} environment: ${issues.join("; ")}`);
    this.name = "EnvironmentError";
  }
}

function parse<T>(scope: string, schema: z.ZodType<T>, source: unknown): T {
  const result = schema.safeParse(source);
  if (result.success) {
    return result.data;
  }
  // Report the failing variable names only. Values may be secrets.
  const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new EnvironmentError(scope, issues);
}

export function parseServerEnv(source: unknown = process.env): ServerEnv {
  return parse("server", serverEnvSchema, source);
}

export function parsePublicEnv(source: unknown = process.env): PublicEnv {
  return parse("public", publicEnvSchema, source);
}

export function parseMobileEnv(source: unknown = process.env): MobileEnv {
  return parse("mobile", mobileEnvSchema, source);
}
