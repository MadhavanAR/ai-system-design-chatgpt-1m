import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../src/modules/ratelimit/rate-limiter.js';
import { redis } from '../src/redis/index.js';

describe('RateLimiter Quota Requirements', () => {
  beforeEach(async () => {
    await redis.flushAll();
  });

  it('allows normal traffic within configured RPM and TPM quotas', async () => {
    const res = await RateLimiter.checkAndAcquire('user_unit_test', 120);

    expect(res.allowed).toBe(true);
    expect(res.currentRpm).toBe(1);
    expect(res.currentTpm).toBe(120);
    expect(res.activeConcurrent).toBe(1);

    await RateLimiter.releaseConcurrency('user_unit_test');
  });

  it('rejects requests exceeding concurrent request limit and recovers after lease release', async () => {
    const userId = 'user_concurrency_test';

    // Default max concurrent is 5 for free/pro tier
    for (let i = 0; i < 5; i++) {
      const res = await RateLimiter.checkAndAcquire(userId, 50);
      expect(res.allowed).toBe(true);
    }

    // 6th concurrent request must be rejected with 429
    const blockedRes = await RateLimiter.checkAndAcquire(userId, 50);
    expect(blockedRes.allowed).toBe(false);
    expect(blockedRes.reason).toBe('concurrent_limit_exceeded');
    expect(blockedRes.retryAfterSeconds).toBeDefined();

    // Release 1 active connection
    await RateLimiter.releaseConcurrency(userId);

    // Slot is now available again
    const freedRes = await RateLimiter.checkAndAcquire(userId, 50);
    expect(freedRes.allowed).toBe(true);
  });
});
