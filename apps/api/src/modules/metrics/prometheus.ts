import client from 'prom-client';
import { circuitBreakers } from '../resilience/circuit-breaker.js';

// Initialize default Prometheus system metrics (CPU, Memory, Event Loop)
client.collectDefaultMetrics({ prefix: 'aichat_' });

// Custom LLM Infrastructure Prometheus Metrics
export const httpRequestCounter = new client.Counter({
  name: 'aichat_http_requests_total',
  help: 'Total HTTP chat and API requests',
  labelNames: ['method', 'route', 'status', 'model_id'],
});

export const requestDurationHistogram = new client.Histogram({
  name: 'aichat_request_duration_seconds',
  help: 'End-to-end request duration in seconds',
  labelNames: ['route', 'model_id'],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
});

export const ttftHistogram = new client.Histogram({
  name: 'aichat_time_to_first_token_seconds',
  help: 'Time to first token (TTFT) in seconds',
  labelNames: ['model_id'],
  buckets: [0.05, 0.1, 0.2, 0.4, 0.8, 1.5, 3.0],
});

export const tokenCounter = new client.Counter({
  name: 'aichat_tokens_processed_total',
  help: 'Total tokens processed by type and model',
  labelNames: ['type', 'model_id'], // type: 'input' | 'output'
});

export const activeConnectionsGauge = new client.Gauge({
  name: 'aichat_active_connections',
  help: 'Current active streaming SSE connections',
});

export const rateLimitCounter = new client.Counter({
  name: 'aichat_rate_limited_requests_total',
  help: 'Total rate limited requests (HTTP 429)',
  labelNames: ['reason'],
});

export const circuitBreakerStateGauge = new client.Gauge({
  name: 'aichat_circuit_breaker_state',
  help: 'Circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)',
  labelNames: ['service'],
});

// Rolling Telemetry Stats Tracker for UI HUD
class LiveStatsTracker {
  private recentLatencies: number[] = [];
  private recentTtfts: number[] = [];
  private totalRequests = 0;
  private totalErrors = 0;
  private totalRateLimits = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private totalCostUsd = 0;
  private activeStreams = 0;

  recordStreamStart() {
    this.activeStreams++;
    activeConnectionsGauge.inc();
  }

  recordStreamEnd() {
    this.activeStreams = Math.max(0, this.activeStreams - 1);
    activeConnectionsGauge.dec();
  }

  recordCompletion(data: {
    durationMs: number;
    ttftMs?: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    isError?: boolean;
    isRateLimit?: boolean;
  }) {
    this.totalRequests++;
    if (data.isError) this.totalErrors++;
    if (data.isRateLimit) this.totalRateLimits++;

    this.totalInputTokens += data.inputTokens;
    this.totalOutputTokens += data.outputTokens;
    this.totalCostUsd += data.costUsd;

    this.recentLatencies.push(data.durationMs);
    if (this.recentLatencies.length > 500) this.recentLatencies.shift();

    if (data.ttftMs) {
      this.recentTtfts.push(data.ttftMs);
      if (this.recentTtfts.length > 500) this.recentTtfts.shift();
    }
  }

  getLiveDashboard() {
    // Update Prometheus circuit breaker gauges
    for (const [name, cb] of Object.entries(circuitBreakers)) {
      const state = cb.getState();
      const numState = state === 'CLOSED' ? 0 : state === 'HALF_OPEN' ? 1 : 2;
      circuitBreakerStateGauge.set({ service: name }, numState);
    }

    const sortedLatencies = [...this.recentLatencies].sort((a, b) => a - b);
    const sortedTtfts = [...this.recentTtfts].sort((a, b) => a - b);

    const getPercentile = (arr: number[], p: number) => {
      if (arr.length === 0) return 0;
      const idx = Math.floor(arr.length * p);
      return arr[Math.min(idx, arr.length - 1)];
    };

    return {
      activeStreams: this.activeStreams,
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      totalRateLimits: this.totalRateLimits,
      errorRatePct:
        this.totalRequests > 0
          ? Number(((this.totalErrors / this.totalRequests) * 100).toFixed(2))
          : 0,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      totalCostUsd: Number(this.totalCostUsd.toFixed(6)),
      latency: {
        p50Ms: getPercentile(sortedLatencies, 0.5),
        p95Ms: getPercentile(sortedLatencies, 0.95),
        p99Ms: getPercentile(sortedLatencies, 0.99),
        avgTtftMs:
          sortedTtfts.length > 0
            ? Math.round(sortedTtfts.reduce((a, b) => a + b, 0) / sortedTtfts.length)
            : 0,
        p95TtftMs: getPercentile(sortedTtfts, 0.95),
      },
      circuitBreakers: Object.entries(circuitBreakers).map(([name, cb]) => cb.getMetrics()),
    };
  }
}

export const liveStats = new LiveStatsTracker();
export const promRegistry = client.register;
