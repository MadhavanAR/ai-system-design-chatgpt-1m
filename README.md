# AI System Design — ChatGPT at 1M Users

[![CI Quality Gate](https://github.com/MadhavanAR/AI-Chatbot/actions/workflows/ci.yml/badge.svg)](https://github.com/MadhavanAR/AI-Chatbot/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.27-black.svg)](https://www.fastify.io/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black.svg)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-red.svg)](https://redis.io/)
[![k6](https://img.shields.io/badge/k6-Load%20Tested-purple.svg)](https://k6.io/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

> A production-oriented reference architecture and runnable implementation exploring how to design, operate, and scale a ChatGPT-like AI platform for 1 million users.

---

## Architectural Positioning & Scope

To ensure absolute clarity and transparency, this repository explicitly distinguishes between three engineering tiers:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ LEVEL 1: RUNNABLE REFERENCE IMPLEMENTATION                                 │
│ What runs on your machine today: Fastify SSE streaming gateway, Next.js UI,  │
│ 3-tier model router, circuit breaker, Redis sliding-window rate limiter,    │
│ Postgres conversation storage, OpenMetrics telemetry, and mock/live LLMs.   │
├─────────────────────────────────────────────────────────────────────────────┤
│ LEVEL 2: PRODUCTION TARGET ARCHITECTURE                                     │
│ The patterns required to scale: Anycast CDN/WAF, Envoy L7 load balancers,   │
│ stateless auto-scaling API pods, Redis clusters, read-replica Postgres,     │
│ dedicated GPU inference clusters (vLLM/TGI), and OpenTelemetry tracing.     │
├─────────────────────────────────────────────────────────────────────────────┤
│ LEVEL 3: 1M+ CAPACITY & SIZING MODEL                                        │
│ The mathematical derivations and infrastructure sizing: 100K DAU, 18K TPS,   │
│ 150 peak requests/sec, ~30x H100 GPU nodes, IOPS, and operational budgets.  │
└─────────────────────────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **Honest Scope Notice**: This repository does NOT claim that a single local machine can serve 1 million concurrent users. It provides an empirically tested local reference implementation alongside complete mathematical capacity planning and architecture designs for 1M-user production scale.

---

## Why Does This Project Exist?

Calling an LLM API is straightforward; building the surrounding distributed platform that remains reliable, observable, cost-effective, and resilient under sustained traffic spikes is the true engineering challenge.

This project addresses the critical platform engineering concerns:
- **Intelligent Model Routing**: Routing simple queries to high-throughput 8B models ($0.15/1M tokens) while reserving frontier reasoning models ($2.50/1M tokens) for complex tasks, slashing blended inference costs by up to 60%.
- **Token Budgeting & Context Management**: Sliding window historical compaction reserving fixed token generation headroom to avoid context overflows.
- **Connection Holding & SSE Streaming**: Server-Sent Events with persistent heartbeat framing, client disconnect cleanup, and error framing.
- **Resilience Under Pressure**: Three-state Circuit Breakers (`CLOSED`, `OPEN`, `HALF_OPEN`), bounded exponential backoff with full jitter, and two-phase distributed idempotency locks.
- **Multi-Dimensional Rate Limiting**: Redis-backed sliding window logs enforcing Requests Per Minute (RPM), Tokens Per Minute (TPM), and Active Concurrent Streams.

---

## System Architecture

```text
                                CLIENT (Next.js / SDK / curl)
                                              │
                                              ▼
                                    ┌───────────────────┐
                                    │  Fastify Gateway  │ (Port 4000)
                                    └─────────┬─────────┘
                                              │
                      ┌───────────────────────┼───────────────────────┐
                      ▼                       ▼                       ▼
            ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
            │   Rate Limiter    │   │ Idempotency Guard │   │ Context Manager   │
            │ (RPM, TPM, Concur)│   │ (Redis 2-Phase)   │   │ (Sliding Window)  │
            └─────────┬─────────┘   └─────────┬─────────┘   └─────────┬─────────┘
                      │                       │                       │
                      └───────────────────────┼───────────────────────┘
                                              ▼
                                    ┌───────────────────┐
                                    │   Model Router    │
                                    │ (Cost & Circuit)  │
                                    └─────────┬─────────┘
                                              │
                      ┌───────────────────────┼───────────────────────┐
                      ▼                       ▼                       ▼
            ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
            │     Fast Tier     │   │   Standard Tier   │   │  Reasoning Tier   │
            │ (8B FP8, 120ms)   │   │ (70B, 280ms)      │   │ (DeepThink / o1)  │
            └─────────┬─────────┘   └─────────┬─────────┘   └─────────┬─────────┘
                      │                       │                       │
                      └───────────────────────┼───────────────────────┘
                                              ▼
                                ┌───────────────────────────┐
                                │ Server-Sent Events (SSE)  │
                                │ (Tokens, Cost, Latency)   │
                                └─────────────┬─────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
            ┌───────────────────┐                           ┌───────────────────┐
            │ PostgreSQL 16 DB  │                           │ Redis 7 / Metrics │
            │ (Conversations)   │                           │ (Prometheus /api) │
            └───────────────────┘                           └───────────────────┘
```

---

## What Is Actually Implemented?

| Capability | Local Reference Status | Production Scale Target | Code Reference |
| :--- | :--- | :--- | :--- |
| **HTTP & SSE API Gateway** | Fully Implemented (Fastify) | Horizontal Gateway Fleet | [`apps/api/src/routes/chat.ts`](apps/api/src/routes/chat.ts) |
| **SSE Streaming & Heartbeats** | Fully Implemented | SSE / HTTP/2 Ingress | [`apps/api/src/routes/chat.ts`](apps/api/src/routes/chat.ts) |
| **Model Router & Cost Engine** | Fully Implemented (3 tiers) | Dynamic Latency Router | [`apps/api/src/services/model-router.ts`](apps/api/src/services/model-router.ts) |
| **Circuit Breakers** | Fully Implemented (3 states) | Service Mesh / Envoy | [`apps/api/src/services/circuit-breaker.ts`](apps/api/src/services/circuit-breaker.ts) |
| **Multi-Dimension Rate Limiter** | Fully Implemented (Redis/Mem) | Redis Cluster / Envoy | [`apps/api/src/services/rate-limiter.ts`](apps/api/src/services/rate-limiter.ts) |
| **Distributed Idempotency** | Fully Implemented (2-phase) | Distributed Lock Engine | [`apps/api/src/services/idempotency.ts`](apps/api/src/services/idempotency.ts) |
| **Context Window Compaction** | Fully Implemented | KV Cache & Compactor | [`apps/api/src/services/context-manager.ts`](apps/api/src/services/context-manager.ts) |
| **Conversation Persistence** | Fully Implemented (Postgres) | Master + Read Replicas | [`apps/api/src/services/database.ts`](apps/api/src/services/database.ts) |
| **OpenMetrics & Telemetry** | Fully Implemented (`prom-client`) | Prometheus + Grafana | [`apps/api/src/services/telemetry.ts`](apps/api/src/services/telemetry.ts) |
| **Next.js Web Client** | Fully Implemented (SSE Hook) | CDN-hosted Web App | [`apps/web/src/`](apps/web/src/) |
| **Mock LLM Provider** | Fully Implemented | For Zero-Cost Local Dev | [`apps/api/src/services/providers/mock.ts`](apps/api/src/services/providers/mock.ts) |
| **OpenAI / vLLM Provider** | Fully Implemented | External / Self-hosted GPU | [`apps/api/src/services/providers/openai-compatible.ts`](apps/api/src/services/providers/openai-compatible.ts) |
| **Physical GPU Cluster (H100)**| Capacity Planning Derived | 30x H100 vLLM Cluster | [`docs/capacity-planning.md`](docs/capacity-planning.md) |
| **Multi-Region Deployment** | Architectural Blueprint | Active-Active Cross-Region | [`docs/scaling.md`](docs/scaling.md) |

---

## 3-Minute Quickstart

### Prerequisites
- **Node.js**: v20+ LTS
- **pnpm**: v9+
- **Docker** (optional, recommended for PostgreSQL & Redis)

### 1. Clone & Install
```bash
git clone https://github.com/MadhavanAR/AI-Chatbot.git ai-system-design-chatgpt-1m
cd ai-system-design-chatgpt-1m
pnpm install
```

### 2. Environment Configuration
```bash
cp .env.example .env
```
*(The default configuration runs out-of-the-box with the mock LLM provider without requiring any paid API keys).*

### 3. Start Backing Services (Docker)
```bash
docker compose up -d
```
*Starts PostgreSQL 16 on port `5432` and Redis 7 on port `6379`.*

### 4. Verify & Run
```bash
# Run complete test and build verification suite
pnpm verify

# Start development servers (API on 4000, Web on 3000)
pnpm dev
```

- **Web Application**: [`http://localhost:3000`](http://localhost:3000)
- **API Health Check**: [`http://localhost:4000/health`](http://localhost:4000/health)
- **Prometheus Metrics**: [`http://localhost:4000/metrics`](http://localhost:4000/metrics)

---

## Chat API Example (SSE Streaming)

You can interact directly with the streaming endpoint using `curl`:

```bash
curl -N -X POST http://localhost:4000/api/chat \
  -H "Content-Type: application/json" \
  -H "x-user-id: dev-user-1" \
  -d '{
    "message": "Explain how circuit breakers protect LLM inference services under high latency.",
    "modelId": "mock-fast",
    "temperature": 0.7
  }'
```

### Example Streaming Output
```text
data: {"type":"start","conversationId":"b49a1d12-1f7c-48b2","model":"mock-fast","tier":"FAST"}

data: {"type":"token","token":"Circuit"}

data: {"type":"token","token":" breakers"}

data: {"type":"token","token":" isolate"}

data: {"type":"token","token":" failing"}

data: {"type":"token","token":" dependencies..."}

data: {"type":"meta","usage":{"promptTokens":18,"completionTokens":124,"totalTokens":142},"costUsd":0.000031,"latencyMs":184,"fallback":false}

data: {"type":"done"}
```

---

## Web User Interface

The Next.js 14 frontend (`apps/web`) provides:
1. **Interactive Chat**: Real-time token rendering with markdown formatting and conversation history.
2. **Model Selection**: Live model tier switching (Fast, Standard, Reasoning).
3. **Telemetry Dashboard**: Real-time Heads-Up Display (HUD) displaying Time-to-First-Token (TTFT), tokens/sec, sliding-window cost counters, and circuit breaker status.
4. **Fault Injection Controls**: Test resilience live by tripping circuits, simulating network timeouts, or injecting 503 errors.

---

## Empirical Benchmarks

Empirical load testing was executed using **k6** against the live Server-Sent Events (SSE) pipeline with PostgreSQL 16 and Redis 7 backing services under 200 concurrent virtual users (VUs):

```text
   LOAD TEST RESULTS SUMMARY (k6, 200 Virtual Users, 62s Duration)

    Total Requests......: 8,870 requests
    Peak Request Rate...: 146.2 req/s
    Rate-Limited (429)..: 7,658 requests shed (Multi-dimensional limiter protection)
    Completed Streams...: 1,212 full SSE streams
    Avg Time-to-First-Tk: 119.96 ms (p95 = 135.8 ms)
    Token Output Rate...: 146.04 tokens/sec
    Error Rate..........: 0.00% (Zero unhandled 5xx exceptions)
```

> See [benchmarks/results.md](benchmarks/results.md) for full benchmark configuration, hardware specifications, and Grafana/k6 run output.

---

## Documentation Index

| Guide | Description |
| :--- | :--- |
| [**Capacity Planning (1M Users)**](docs/capacity-planning.md) | Derivations for 100K DAU, 18K TPS, ~30x H100 GPU cluster sizing, and financial models. |
| [**Architecture Decisions (ADRs)**](architecture/decisions/) | 10 formal ADRs covering storage, SSE, rate limiting, and model routing. |
| [**Engineering Trade-Offs**](docs/trade-offs.md) | SSE vs WebSockets, PostgreSQL vs NoSQL, Redis vs Kafka, and Sync vs Async streaming. |
| [**Production Gap Analysis**](docs/production-gap-analysis.md) | Side-by-side matrix comparing reference implementation vs. 1M vs. 10M production scale. |
| [**Developer Extension Guide**](docs/extending.md) | Step-by-step instructions for adding model providers, vector search, auth, and caching. |
| [**System Design Interview Guide**](docs/interview-questions.md) | 15+ senior engineering interview questions answered from this project's architecture. |
| [**Interactive Demo Runbook**](docs/demo.md) | 3-minute live interview and presentation demo walkthrough. |
| [**Scaling Roadmap (1K to 10M+)**](docs/scaling.md) | Evolutionary milestones from single VM to active-active multi-region deployment. |
| [**Claims & Forensic Audit**](docs/claims-audit.md) | Evidence audit validating all architectural and performance claims. |

---

## Contributing & Community

We welcome contributions from engineers and system designers! Please review:
- [**CONTRIBUTING.md**](CONTRIBUTING.md): Workflow, code style, testing requirements, and PR checklists.
- [**CODE_OF_CONDUCT.md**](CODE_OF_CONDUCT.md): Contributor Covenant v2.1.
- [**SECURITY.md**](SECURITY.md): Security policy and responsible vulnerability disclosure.
- [**CHANGELOG.md**](CHANGELOG.md): Version history and release notes.

---

## License

This project is licensed under the [Apache License 2.0](LICENSE).
Third-party open-source components are acknowledged in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
