import { afterEach, describe, expect, it, vi } from 'vitest';

import { consumeRateLimit, resetRateLimits } from '../lib/rate-limit';

afterEach(() => {
  resetRateLimits();
  vi.useRealTimers();
});

describe('rate limiting', () => {
  it('allows requests up to the limit', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const decision = await consumeRateLimit('key', { limit: 3, windowSeconds: 60 });
      expect(decision.allowed).toBe(true);
    }
  });

  it('refuses the request after the limit is reached', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await consumeRateLimit('key', { limit: 3, windowSeconds: 60 });
    }

    const decision = await consumeRateLimit('key', { limit: 3, windowSeconds: 60 });

    expect(decision.allowed).toBe(false);
  });

  it('tells a refused caller how long to wait', async () => {
    await consumeRateLimit('key', { limit: 1, windowSeconds: 60 });

    const decision = await consumeRateLimit('key', { limit: 1, windowSeconds: 60 });

    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    expect(decision.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('counts each key separately, so one caller cannot lock out another', async () => {
    await consumeRateLimit('first', { limit: 1, windowSeconds: 60 });

    const other = await consumeRateLimit('second', { limit: 1, windowSeconds: 60 });

    expect(other.allowed).toBe(true);
  });

  it('lets a caller through again once the window has passed', async () => {
    vi.useFakeTimers();
    await consumeRateLimit('key', { limit: 1, windowSeconds: 60 });
    expect((await consumeRateLimit('key', { limit: 1, windowSeconds: 60 })).allowed).toBe(false);

    vi.advanceTimersByTime(61_000);

    expect((await consumeRateLimit('key', { limit: 1, windowSeconds: 60 })).allowed).toBe(true);
  });

  it('reports the remaining allowance so a caller can pace itself', async () => {
    const first = await consumeRateLimit('key', { limit: 5, windowSeconds: 60 });
    const second = await consumeRateLimit('key', { limit: 5, windowSeconds: 60 });

    expect(first.remaining).toBe(4);
    expect(second.remaining).toBe(3);
  });
});
