import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreaker } from '../src/application/resilience/circuit-breaker.js';

describe('CircuitBreaker Resilience Requirements', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker('test-model-service', {
      failureThreshold: 3,
      resetTimeoutMs: 100,
      successThreshold: 2,
    });
  });

  it('initializes in CLOSED state allowing executions', () => {
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.canExecute()).toBe(true);
    expect(cb.isOpen()).toBe(false);
  });

  it('opens circuit after configured consecutive failures occur', () => {
    cb.recordFailure();
    expect(cb.getState()).toBe('CLOSED');
    cb.recordFailure();
    expect(cb.getState()).toBe('CLOSED');
    cb.recordFailure();

    expect(cb.getState()).toBe('OPEN');
    expect(cb.canExecute()).toBe(false);
  });

  it('transitions to HALF_OPEN after reset timeout expires', async () => {
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('OPEN');

    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(cb.getState()).toBe('HALF_OPEN');
  });

  it('allows a single probe execution in HALF_OPEN and rejects concurrent callers', async () => {
    cb.forceOpen();
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(cb.getState()).toBe('HALF_OPEN');

    // First caller gets probe lease
    expect(cb.canExecute()).toBe(true);
    // Subsequent concurrent caller is blocked while probe is in flight
    expect(cb.canExecute()).toBe(false);
  });

  it('re-opens circuit immediately if probe execution fails during HALF_OPEN', async () => {
    cb.forceOpen();
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(cb.getState()).toBe('HALF_OPEN');

    cb.canExecute();
    cb.recordFailure();

    expect(cb.getState()).toBe('OPEN');
  });

  it('closes circuit once probe requests meet success threshold', async () => {
    cb.forceOpen();
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(cb.getState()).toBe('HALF_OPEN');

    cb.canExecute();
    cb.recordSuccess(); // 1st success
    expect(cb.getState()).toBe('HALF_OPEN');

    cb.canExecute();
    cb.recordSuccess(); // 2nd success -> meets successThreshold (2)
    expect(cb.getState()).toBe('CLOSED');
  });
});
