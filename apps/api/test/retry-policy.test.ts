import { describe, it, expect } from 'vitest';
import { RetryPolicy } from '../src/application/resilience/retry.js';
import { ValidationError, ModelTimeoutError } from '../src/domain/errors.js';

describe('RetryPolicy Resilience Requirements', () => {
  it('does not retry non-retryable validation errors (HTTP 400)', async () => {
    let attempts = 0;
    const validationFailingOperation = async () => {
      attempts++;
      throw new ValidationError('Malformed JSON payload');
    };

    await expect(
      RetryPolicy.execute(validationFailingOperation, { maxRetries: 3 })
    ).rejects.toThrow('Malformed JSON payload');

    expect(attempts).toBe(1); // Exits immediately without retry
  });

  it('retries transient 5xx or timeout errors with bounded jittered backoff', async () => {
    let attempts = 0;
    const transientOperation = async () => {
      attempts++;
      if (attempts < 3) {
        throw new ModelTimeoutError('Socket timeout waiting for token');
      }
      return 'recovered_stream_chunk';
    };

    const result = await RetryPolicy.execute(transientOperation, {
      maxRetries: 3,
      baseDelayMs: 10,
      maxDelayMs: 100,
    });

    expect(result).toBe('recovered_stream_chunk');
    expect(attempts).toBe(3);
  });

  it('stops retrying when total deadline is exceeded', async () => {
    let attempts = 0;
    const slowFailingOperation = async () => {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      throw new ModelTimeoutError('Timeout');
    };

    await expect(
      RetryPolicy.execute(slowFailingOperation, {
        maxRetries: 5,
        baseDelayMs: 40,
        deadlineMs: 80,
      })
    ).rejects.toThrow();

    expect(attempts).toBeLessThanOrEqual(2);
  });

  it('deduplicates retry requests with matching idempotency key', async () => {
    const key = `test_idempotency_${Date.now()}`;

    const firstAttempt = await RetryPolicy.acquireIdempotencyLease(key, 10);
    expect(firstAttempt).toBe(true);

    const duplicateAttempt = await RetryPolicy.acquireIdempotencyLease(key, 10);
    expect(duplicateAttempt).toBe(false);
  });
});
