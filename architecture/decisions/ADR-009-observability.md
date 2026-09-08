# ADR-009: Observability and Structured Telemetry

## Status
Accepted

## Context
High-throughput LLM platforms require multidimensional observability capturing token-level metrics (TTFT, TPS, input/output tokens), financial metrics (cost per request/tenant), reliability metrics (circuit breaker trips, rate limit hits), and distributed correlation IDs across services.

## Decision
- **Prometheus Metrics**: Expose standard OpenMetrics format at `/metrics` (TTFT histogram, request duration histogram, token counters, active stream gauges, circuit breaker states).
- **Structured JSON Logging**: Every request is tagged with a unique `requestId`, `userId`, `conversationId`, `modelId`, timestamps, and token counts, while redacting sensitive headers and authorization tokens.
- **Live Telemetry API**: Expose `/api/stats` endpoint with rolling percentiles (p50, p95, p99) derived from empirical observation arrays.

## Alternatives Considered
- **Unstructured Console Logs**: Unparseable under high concurrency.
- **Heavy APM Agent Dependencies (Datadog/NewRelic)**: Useful for enterprise production, but would introduce broken dependencies for local development.

## Why We Rejected Them
Prometheus and OpenMetrics provide industry standard metrics without locking local development to proprietary vendors.

## Trade-offs
- **Pros**: Zero external dependencies for local observability; seamless integration with Grafana / Prometheus in production.
- **Cons**: Rolling in-memory percentile calculation incurs minor memory buffer overhead (capped at last 500 requests).

## When We Would Revisit This Decision
In enterprise production, deploying OpenTelemetry (OTel) Collector sidecars forwarding traces to Grafana Tempo/Jaeger and metrics to Grafana Mimir.
