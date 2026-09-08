# ADR-003: Redis for Ephemeral State, Caching, and Rate Limiting

## Status
Accepted

## Context
High-frequency operations such as token-bucket rate limiting (RPM/TPM), active concurrency tracking, session caching, and prompt prefix metadata must be processed in sub-millisecond latencies without stressing the relational database.

## Decision
We chose **Redis 7 Cluster** to power:
1. Distributed Sliding Window Rate Limiting (RPM, TPM, Concurrency).
2. Hot conversation metadata caching.
3. Request deduplication & Idempotency leases.
4. Temporary circuit breaker telemetry state.

## Alternatives Considered
- **In-Memory Application Maps**: Zero latency, but does not share state across autoscaled API Gateway pods.
- **Memcached**: Fast, but lacks data structures (hashes, sorted sets) and atomic Lua scripting needed for token buckets.

## Why We Rejected Them
In-process caching cannot enforce global rate limits across 50+ API pods. Memcached lacks atomic multi-key scripting.

## Trade-offs
- **Pros**: Sub-millisecond read/write latency; atomic primitives (`INCRBY`, `EXPIRE`, Lua scripts) ensure race-condition-free rate limiting.
- **Cons**: In-memory data store requires careful TTL management to avoid memory exhaustion at scale.

## Consequences
Rate limits and active concurrency are strictly enforced cluster-wide.

## When We Would Revisit This Decision
If global edge-native rate limiting is migrated directly to Anycast CDN edge compute (e.g. Cloudflare Workers KV / Fastly Compute@Edge) to drop rate checks before traffic hits cloud datacenters.
