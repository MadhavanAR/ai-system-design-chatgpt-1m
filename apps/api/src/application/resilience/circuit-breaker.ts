import { logger } from '../../infrastructure/observability/logger.js';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  successThreshold?: number;
}

export class CircuitBreaker {
  public readonly serviceName: string;
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private consecutiveSuccesses = 0;
  private nextAttemptTimestamp = Date.now();
  private isProbeInFlight = false;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;

  constructor(serviceName: string, options: CircuitBreakerOptions = {}) {
    this.serviceName = serviceName;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeoutMs = options.resetTimeoutMs || 10000;
    this.successThreshold = options.successThreshold || 2;
  }

  getState(): CircuitState {
    if (this.state === 'OPEN' && Date.now() >= this.nextAttemptTimestamp) {
      this.state = 'HALF_OPEN';
      this.isProbeInFlight = false;
    }
    return this.state;
  }

  canExecute(): boolean {
    const currentState = this.getState();

    if (currentState === 'CLOSED') {
      return true;
    }

    if (currentState === 'OPEN') {
      return false;
    }

    // HALF_OPEN: Allow a single probe request through
    if (!this.isProbeInFlight) {
      this.isProbeInFlight = true;
      return true;
    }

    return false;
  }

  isOpen(): boolean {
    return !this.canExecute();
  }

  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.consecutiveSuccesses++;
      this.isProbeInFlight = false;

      if (this.consecutiveSuccesses >= this.successThreshold) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.consecutiveSuccesses = 0;
        logger.info(
          { event: 'circuit_closed', service: this.serviceName },
          `Circuit breaker for [${this.serviceName}] restored to CLOSED`
        );
      }
    } else {
      this.failureCount = 0;
      this.state = 'CLOSED';
    }
  }

  recordFailure(): void {
    this.isProbeInFlight = false;

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.nextAttemptTimestamp = Date.now() + this.resetTimeoutMs;
      this.consecutiveSuccesses = 0;
      logger.warn(
        { event: 'circuit_reopened', service: this.serviceName, retryInMs: this.resetTimeoutMs },
        `Probe request failed. Circuit breaker for [${this.serviceName}] re-opened.`
      );
      return;
    }

    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTimestamp = Date.now() + this.resetTimeoutMs;
      logger.warn(
        { event: 'circuit_tripped', service: this.serviceName, failureCount: this.failureCount, retryInMs: this.resetTimeoutMs },
        `Circuit breaker for [${this.serviceName}] tripped to OPEN.`
      );
    }
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.consecutiveSuccesses = 0;
    this.isProbeInFlight = false;
    this.nextAttemptTimestamp = Date.now();
  }

  forceOpen(): void {
    this.state = 'OPEN';
    this.nextAttemptTimestamp = Date.now() + this.resetTimeoutMs;
    this.isProbeInFlight = false;
  }

  getMetrics() {
    return {
      service: this.serviceName,
      state: this.getState(),
      failureCount: this.failureCount,
      failureThreshold: this.failureThreshold,
      nextAttemptInMs: Math.max(0, this.nextAttemptTimestamp - Date.now()),
    };
  }
}

export const circuitBreakers: Record<string, CircuitBreaker> = {
  'mock-fast': new CircuitBreaker('mock-fast'),
  'mock-standard': new CircuitBreaker('mock-standard'),
  'mock-reasoning': new CircuitBreaker('mock-reasoning'),
  'gpt-4o-mini': new CircuitBreaker('gpt-4o-mini'),
  'gpt-4o': new CircuitBreaker('gpt-4o'),
};
