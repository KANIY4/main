import 'server-only';

/**
 * Rate limiting.
 *
 * A fixed window per key, held in this process. That is honest about what it is:
 * enough to stop one client hammering the proposal link, the upload endpoint or
 * the model, and not enough to coordinate across replicas. Behind more than one
 * node this needs a shared counter — Redis, or Postgres if the traffic is modest
 * — and `docs/DEPLOYMENT.md` says so rather than leaving it to be discovered.
 *
 * It is deliberately not a database table: a limiter that writes a row per
 * request turns a flood into a more expensive flood.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Keeps the map from growing without bound under a spray of distinct keys. */
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export async function consumeRateLimit(
  key: string,
  options: { limit: number; windowSeconds: number },
): Promise<RateLimitDecision> {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) sweep(now);
    windows.set(key, { count: 1, resetAt: now + options.windowSeconds * 1000 });
    return { allowed: true, remaining: options.limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > options.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return {
    allowed: true,
    remaining: options.limit - existing.count,
    retryAfterSeconds: 0,
  };
}

function sweep(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
  // Still full of live windows: this is real traffic, not leaked keys. Drop the
  // oldest rather than refusing to track anything new.
  if (windows.size >= MAX_TRACKED_KEYS) {
    const oldest = [...windows.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (const [key] of oldest.slice(0, Math.floor(MAX_TRACKED_KEYS / 4))) windows.delete(key);
  }
}

/** Test seam: forgets every window. */
export function resetRateLimits(): void {
  windows.clear();
}
