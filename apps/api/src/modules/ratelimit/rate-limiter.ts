import { redis } from '../../redis/index.js';
import { conversationRepo } from '../../infrastructure/repositories/conversation.repo.js';
import { User } from '../../domain/types.js';

export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: 'rpm_exceeded' | 'tpm_exceeded' | 'concurrent_limit_exceeded';
  retryAfterSeconds?: number;
  currentRpm: number;
  maxRpm: number;
  currentTpm: number;
  maxTpm: number;
  activeConcurrent: number;
  maxConcurrent: number;
}

export class RateLimiter {
  /**
   * Evaluates user quotas across RPM, TPM, and concurrent stream dimensions.
   * Note: In-memory fallback is for local development and does not guarantee cluster-wide rate bounds.
   */
  static async checkAndAcquire(
    userId: string,
    estimatedTokens: number = 100
  ): Promise<RateLimitCheckResult> {
    const user: User | null = await conversationRepo.getUser(userId);
    const rpmLimit = user?.rpmLimit || 60;
    const tpmLimit = user?.tpmLimit || 40000;
    const maxConcurrent = user?.maxConcurrentRequests || 5;

    const nowMinute = Math.floor(Date.now() / 60000);
    const rpmKey = `ratelimit:rpm:${userId}:${nowMinute}`;
    const tpmKey = `ratelimit:tpm:${userId}:${nowMinute}`;
    const concurrentKey = `ratelimit:concurrent:${userId}`;

    // 1. Check Concurrent Streaming Requests
    const activeConcurrentStr = await redis.get(concurrentKey);
    const activeConcurrent = activeConcurrentStr ? parseInt(activeConcurrentStr, 10) : 0;

    if (activeConcurrent >= maxConcurrent) {
      return {
        allowed: false,
        reason: 'concurrent_limit_exceeded',
        retryAfterSeconds: 2,
        currentRpm: 0,
        maxRpm: rpmLimit,
        currentTpm: 0,
        maxTpm: tpmLimit,
        activeConcurrent,
        maxConcurrent,
      };
    }

    // 2. Check Requests Per Minute (RPM)
    const currentRpm = await redis.incrBy(rpmKey, 1, 65);
    if (currentRpm > rpmLimit) {
      const secondsLeftInMinute = 60 - (Math.floor(Date.now() / 1000) % 60);
      return {
        allowed: false,
        reason: 'rpm_exceeded',
        retryAfterSeconds: Math.max(1, secondsLeftInMinute),
        currentRpm,
        maxRpm: rpmLimit,
        currentTpm: 0,
        maxTpm: tpmLimit,
        activeConcurrent,
        maxConcurrent,
      };
    }

    // 3. Check Tokens Per Minute (TPM)
    const currentTpm = await redis.incrBy(tpmKey, estimatedTokens, 65);
    if (currentTpm > tpmLimit) {
      const secondsLeftInMinute = 60 - (Math.floor(Date.now() / 1000) % 60);
      return {
        allowed: false,
        reason: 'tpm_exceeded',
        retryAfterSeconds: Math.max(1, secondsLeftInMinute),
        currentRpm,
        maxRpm: rpmLimit,
        currentTpm,
        maxTpm: tpmLimit,
        activeConcurrent,
        maxConcurrent,
      };
    }

    // Acquire Concurrency Lease (TTL safety fallback 120s)
    await redis.incrBy(concurrentKey, 1, 120);

    return {
      allowed: true,
      currentRpm,
      maxRpm: rpmLimit,
      currentTpm,
      maxTpm: tpmLimit,
      activeConcurrent: activeConcurrent + 1,
      maxConcurrent,
    };
  }

  /**
   * Releases the concurrency lease when the streaming response terminates or errors.
   */
  static async releaseConcurrency(userId: string): Promise<void> {
    const concurrentKey = `ratelimit:concurrent:${userId}`;
    const current = await redis.get(concurrentKey);
    if (current) {
      const val = parseInt(current, 10);
      if (val <= 1) {
        await redis.del(concurrentKey);
      } else {
        await redis.incrBy(concurrentKey, -1, 120);
      }
    }
  }
}
