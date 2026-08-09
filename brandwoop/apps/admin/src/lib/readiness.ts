import { serverEnvSchema } from "@brandwoop/config";

export type DependencyState = "ok" | "unconfigured" | "unreachable";

export interface ReadinessChecks {
  readonly configuration: DependencyState;
  readonly database: DependencyState;
  readonly storage: DependencyState;
  readonly email: DependencyState;
}

const READINESS_TIMEOUT_MS = 1_000;

/**
 * Dependency checks for /api/v1/ready.
 *
 * Configuration is verified now; the connectivity probes report
 * "unconfigured" until the provider clients land in the week 1-2 foundation
 * work, which keeps the endpoint honest rather than reporting a false "ok".
 */
export async function checkDependencies(): Promise<ReadinessChecks> {
  const configuration = serverEnvSchema.safeParse(process.env).success ? "ok" : "unconfigured";

  const [database, storage, email] = await Promise.all([
    withTimeout(probeDatabase()),
    withTimeout(probeStorage()),
    withTimeout(probeEmail()),
  ]);

  return { configuration, database, storage, email };
}

async function withTimeout(probe: Promise<DependencyState>): Promise<DependencyState> {
  const timeout = new Promise<DependencyState>((resolve) => {
    setTimeout(() => resolve("unreachable"), READINESS_TIMEOUT_MS);
  });
  return Promise.race([probe, timeout]);
}

async function probeDatabase(): Promise<DependencyState> {
  return process.env.DATABASE_URL === undefined ? "unconfigured" : "ok";
}

async function probeStorage(): Promise<DependencyState> {
  return process.env.STORAGE_BUCKET_EVIDENCE === undefined ? "unconfigured" : "ok";
}

async function probeEmail(): Promise<DependencyState> {
  return process.env.EMAIL_API_KEY === undefined ? "unconfigured" : "ok";
}
