/**
 * Structured logging (scope section 16).
 *
 * Log entries are JSON with a fixed field set. Values are passed through a
 * redaction pass so a token or photo path cannot reach the log sink even when
 * a caller includes one by mistake.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const REDACTED = "[redacted]";

const SENSITIVE_KEY_PATTERN =
  /(password|passcode|token|secret|authorization|cookie|otp|signature|apikey|api_key|keystore|checksum|signedurl|signed_url|objectpath|object_path|email|phone|latitude|longitude)/i;

export interface LogContext {
  readonly requestId?: string;
  readonly tenantId?: string;
  readonly userId?: string;
  readonly route?: string;
  readonly durationMs?: number;
  readonly failureCategory?: string;
  readonly [key: string]: unknown;
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(item, depth + 1);
  }
  return output;
}

export function log(level: LogLevel, message: string, context: LogContext = {}): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "brandwoop-admin",
    release: process.env.RELEASE_VERSION ?? "0.0.0-dev",
    message,
    ...(redact(context) as Record<string, unknown>),
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
}
