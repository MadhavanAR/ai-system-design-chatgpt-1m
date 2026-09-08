# Maintainers and Project Governance

This document details the ownership areas, code review philosophy, and maintainer responsibilities for the `ai-system-design-chatgpt-1m` repository.

---

## Current Maintainers

This project is currently maintained by the core architecture author:

- **Madhavan** ([@MadhavanAR](https://github.com/MadhavanAR)) — *Lead Architect & Maintainer*

---

## Architectural Ownership Areas

| Component Area | Primary Scope | Core Files |
| :--- | :--- | :--- |
| **Inference Transport & Gateway** | SSE streaming, lifecycle, Fastify routing | `apps/api/src/routes/chat.ts`, `apps/api/src/app.ts` |
| **Resilience & Rate Limiting** | Circuit breakers, sliding window limits, idempotency | `apps/api/src/services/circuit-breaker.ts`, `rate-limiter.ts`, `idempotency.ts` |
| **Model Routing & Context** | Heuristic routing, fallbacks, token compaction | `apps/api/src/services/model-router.ts`, `context-manager.ts` |
| **Observability & Benchmarking** | Prometheus metrics, telemetry APIs, k6 load scripts | `apps/api/src/services/telemetry.ts`, `benchmarks/` |
| **User Interface** | Next.js chat client, telemetry dashboard, fault controls | `apps/web/src/` |
| **System Design Documentation** | ADRs, capacity planning, failure runbooks | `architecture/decisions/`, `docs/` |

---

## Review & Decision Process

1. **Bug Fixes & Ergonomic Improvements**: Can be approved and merged by any maintainer after passing automated CI quality gates (`pnpm verify`).
2. **Architectural & Protocol Changes**: Any changes to the SSE streaming contract, rate-limiting semantics, database schema, or model provider interface must include an ADR in `architecture/decisions/` and undergo review against the 1M-user capacity assumptions.
3. **No Phantom Complexities**: PRs adding cloud-specific wrappers, distributed queues, or complex infrastructure without clear architectural need will be politely declined to keep the educational reference clean and runnable.
