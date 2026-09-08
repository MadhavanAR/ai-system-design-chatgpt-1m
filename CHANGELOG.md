# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-09-08

### Added
- **Fastify High-Throughput API Gateway** (`apps/api`):
  - Server-Sent Events (SSE) streaming engine with heartbeat framing and client disconnect abort listeners.
  - 3-tier intelligent Model Router (Low latency, General balanced, High reasoning) with automatic fallback.
  - Three-state Circuit Breaker (`CLOSED`, `OPEN`, `HALF_OPEN`) with exponential cooldown.
  - Distributed Sliding Window Log rate limiter backed by Redis with atomic in-memory fallback.
  - Two-phase distributed idempotency leasing with lock timeouts and payload caching.
  - Token-aware Conversation Context Manager with bounded sliding compaction and cost calculations.
  - OpenMetrics `/metrics` endpoint powered by `prom-client` and rich `/api/stats` endpoint.
- **Next.js 14 Web Application** (`apps/web`):
  - Real-time SSE streaming chat UI with markdown rendering and code formatting.
  - Live system telemetry dashboard (TTFT, token generation rate, error rates, circuit breaker states).
  - Model tier selector and interactive failure injection controls.
- **Database & Storage Architecture**:
  - PostgreSQL schema for conversations, messages, and idempotency keys with composite indexes.
  - Docker Compose configuration for PostgreSQL 16 and Redis 7 Alpine.
- **Comprehensive Documentation Suite**:
  - 10 Architectural Decision Records (ADRs) covering storage, streaming, rate limiting, and routing.
  - Complete 1M-user capacity planning model and calculations (`docs/capacity-planning.md`).
  - Empirical k6 load testing suite and benchmarks (`benchmarks/results.md`).
  - Production gap analysis matrix (`docs/production-gap-analysis.md`).
  - Failure mode runbook and 3-minute demo script (`docs/demo.md`).
  - System design interview prep guide (`docs/interview-questions.md`).
  - Developer extension guide (`docs/extending.md`).
- **Open-Source Governance**:
  - Apache 2.0 License, Contributor Covenant Code of Conduct, Security Policy, and Issue/PR templates.
