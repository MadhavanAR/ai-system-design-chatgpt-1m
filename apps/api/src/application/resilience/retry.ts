import { redis } from '../../redis/index.js';
import { AppError } from '../../domain/errors.js';
import { logger } from '../../infrastructure/observability/logger.js';

export interface RetryPolicyOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  deadlineMs?: number;
}

export class RetryPolicy {
  /**
   * Calculates exponential backoff with Full Jitter to prevent harmonic retry storms.
   * Formula: random_uniform(0, min(maxDelay, baseDelay * 2^attempt))
   */
  static calculateJitterDelay(
    attempt: number,
    baseDelayMs: number = 300,
    maxDelayMs: number = 4000
  ): number {
    const exponentialLimit = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
    return Math.floor(Math.random() * exponentialLimit);
  }

  /**
   * Classifies whether an error is safe and eligible for retry.
   * Never retry client validation (4xx except 429) or non-retryable domain errors.
   */
  static isRetryable(error: any): boolean {
    if (error instanceof AppError) {
      return error.retryable;
    }

    if (error?.status === 429 || error?.statusCode === 429) {
      return true;
    }

    if (error?.status >= 500 || error?.statusCode >= 500) {
      return true;
    }

    // Network / Socket resets and timeouts
    const msg = String(error?.message || '').toLowerCase();
    return msg.includes('timeout') || msg.includes('econnreset') || msg.includes('socket hang up');
  }

  /**
   * Executes a transient operation with jittered backoff, deadline bounding, and retryable error checking.
   */
  static async execute<T>(
    operation: (attempt: number) => Promise<T>,
    options: RetryPolicyOptions = {}
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? 2;
    const baseDelayMs = options.baseDelayMs ?? 250;
    const maxDelayMs = options.maxDelayMs ?? 3000;
    const deadline = options.deadlineMs ? Date.now() + options.deadlineMs : Infinity;

    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (Date.now() > deadline) {
          throw new AppError('Operation exceeded configured retry deadline', 'MODEL_TIMEOUT', 504, false);
        }
        return await operation(attempt);
      } catch (err: any) {
        lastError = err;

        if (attempt === maxRetries || !this.isRetryable(err) || Date.now() >= deadline) {
          break;
        }

        const delay = this.calculateJitterDelay(attempt, baseDelayMs, maxDelayMs);
        logger.warn(
          { event: 'retry_attempt', attempt: attempt + 1, delayMs: delay, error: err.message },
          'Transient failure encountered. Executing jittered backoff retry.'
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Check and acquire an idempotency lease to prevent duplicate LLM execution during client retries.
   */
  static async acquireIdempotencyLease(idempotencyKey: string, ttlSeconds = 60): Promise<boolean> {
    const key = `idempotency:${idempotencyKey}`;
    const exists = await redis.get(key);
    if (exists) {
      return false; // Already processed or in-flight
    }
    await redis.set(key, 'processing', ttlSeconds);
    return true;
  }
}
