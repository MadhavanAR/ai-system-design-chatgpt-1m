# How I Would Design a ChatGPT-Like System for 1 Million Users

### *A practical AI system-design walkthrough covering inference, routing, caching, storage, reliability, scaling, and cost.*

---

## 1. The Problem

Building a chatbot prototype is easy. You write a 30-line script that accepts a prompt, sends it to an OpenAI endpoint, and prints the result.

**Designing a ChatGPT-like system for 1,000,000 users is a completely different engineering challenge.**

When you operate at scale:
- Model inference is slow and non-deterministic.
- A single prompt can hold an HTTP connection open for 15 seconds.
- Naive model selection will bankrupt your infrastructure budget in days.
- A transient outage at your model provider will trigger a catastrophic retry storm that brings down your entire API layer.
- Relational databases buckle under millions of un-indexed conversational write turns.

This article is an end-to-end architectural case study detailing how to build a resilient, cost-effective, and observable ChatGPT-like platform for 1M users.

---

## 2. First, Let’s Estimate the Scale

Before choosing databases or GPU clusters, senior engineers start with back-of-the-envelope calculations:

- **Registered Users**: 1,000,000
- **Daily Active Users (DAU)**: 100,000 (10% of total)
- **Peak Concurrent Users (PCU)**: 10,000 active users during peak hours
- **Average Turns per Active User / Day**: 15 messages/day
- **Total Daily Requests**: $100{,}000 \times 15 = 1{,}500{,}000 \text{ requests/day}$
- **Average Throughput**: $\approx 17.4 \text{ RPS}$
- **Peak Throughput (3x multiplier)**: $\approx 52 \text{ RPS}$
- **Average Prompt + Completion Tokens**: 250 in + 350 out = 600 tokens/turn
- **Daily Token Volume**: $1.5\text{M} \times 600 = 900{,}000{,}000 \text{ tokens/day (27 Billion tokens/month)}$
- **Peak Output Token Generation Rate**: $52 \text{ RPS} \times 350 \text{ tokens} \approx 18{,}200 \text{ output tokens/sec}$

---

## 3. The Architecture

A production AI system must be decoupled into distinct responsibility zones:

```text
                        USERS
                          |
                          v
                 +-----------------+
                 |   Anycast CDN   |
                 +--------+--------+
                          |
                          v
                 +-----------------+
                 |  Load Balancer  |
                 +--------+--------+
                          |
             +------------+------------+
             |                         |
             v                         v
       +-----------+             +-----------+
       |  API #1   |             |  API #N   |
       +-----+-----+             +-----+-----+
             |                         |
             +------------+------------+
                          |
                          v
                 +-----------------+
                 | Control Plane   |
                 | - Rate Limiter  |
                 | - Context Mgr   |
                 | - Model Router  |
                 | - Circuit Breaker|
                 +--------+--------+
                          |
            +-------------+-------------+
            |                           |
            v                           v
     +--------------+            +--------------+
     | Redis Cache  |            | PostgreSQL   |
     | (Rate Limits,|            | (Primary +   |
     |  Hot Threads)|            |  Replicas)   |
     +--------------+            +--------------+
            |
            v
     +------------------------------------------+
     | Model Inference Fleet                    |
     | - Fast Tier (8B FP8)                     |
     | - Standard Tier (70B)                    |
     | - Reasoning Tier                         |
     +------------------------------------------+
            | (SSE Token Stream)
            v
          CLIENT
```

---

## 4. Request Lifecycle

1. **Ingress & TLS Termination**: The user’s request arrives at the Cloudflare edge and passes through an Envoy Load Balancer.
2. **Authentication & Rate Check**: The Fastify API Gateway extracts the user token and queries **Redis** using a sliding-window token bucket (evaluating RPM, TPM, and active concurrent leases).
3. **Context Assembly**: The **ContextManager** fetches recent turns from PostgreSQL (or Redis cache), calculates the token budget, truncates old history, and prepends the system prompt.
4. **Model Routing**: The **ModelRouter** evaluates query intent and context depth, selecting the most cost-effective model tier.
5. **SSE Stream Initiation**: The gateway opens an HTTP `text/event-stream` connection back to the client.
6. **Inference Execution**: The chosen model server generates tokens using continuous batching.
7. **Telemetry & Audit**: Once generation completes, full token counts, latency metrics (TTFT, TPS), and cost calculations are asynchronously persisted.

---

## 5. Why the LLM Is Not the Whole System

A common misconception is that the LLM is 90% of the platform. In reality, the raw model is simply a slow, stateless compute engine. 

The real engineering lies in everything surrounding the model:
- Managing long-lived HTTP socket lifecycles.
- Enforcing tenant quotas and fair queuing.
- Assembling sliding conversational memory.
- Ensuring circuit-breaker resilience when GPUs crash.
- Tracking financial unit economics down to fractions of a cent per prompt.

---

## 6. Model Routing

Routing every user request to a massive frontier model ($10+/1M tokens) is economically disastrous. We implemented a dynamic 3-tier routing strategy:

1. **Fast / Simple Tier (8B parameters)**: Serves ~60% of requests (conversational greetings, simple QA, basic formatting) at $0.15/1M tokens and ~120ms TTFT.
2. **Standard Tier (70B parameters)**: Serves ~35% of requests (complex coding, multi-document synthesis) at $0.80/1M tokens.
3. **Reasoning Tier**: Serves ~5% of requests (formal proofs, multi-step math) at $2.50/1M tokens.

**Result**: Blended token cost drops from $2.50/M to **$0.45/M**, saving over **80% in operational costs**.

---

## 7. Conversation Storage

We chose **PostgreSQL 16** with a clean relational model (`users`, `conversations`, `messages`, `model_requests`, `usage_records`):
- Hot conversations are cached in Redis with a 24-hour TTL.
- Read-heavy queries (loading previous chat sidebars) are routed to **PostgreSQL Read Replicas**.
- The `messages` table is partitioned monthly by `created_at` to prevent index degradation as records surpass 100M+ rows.

---

## 8. Context Management

Naive chatbots send the entire conversation history with every new message until the context window explodes.

Our `ContextManager`:
- Enforces a sliding token window (e.g. max 6,000 tokens for input).
- Guarantees preservation of the core system prompt.
- Traverses historical messages newest-to-oldest, dropping stale turns when the token budget is reached.
- Leaves 25% of the model’s total context window empty as dedicated headroom for response generation.

---

## 9. Caching

Caching in LLM systems differs fundamentally from traditional web caching because prompt tokens have slight variations:

1. **Exact & Semantic Response Cache**: Exact hashes of `(system_prompt + turn_history)` are cached in Redis for identical queries.
2. **Prefix / KV Caching (vLLM / PagedAttention)**: Instead of recomputing attention matrices for the shared system prompt on every single turn, model servers store the Key-Value attention tensors in GPU memory. This drops Time-To-First-Token (TTFT) from 400ms to <80ms for warm chats.

---

## 10. Streaming

We chose **Server-Sent Events (SSE)** over WebSockets:
- Chat turns are fundamentally unidirectional streaming operations per prompt.
- SSE operates over standard HTTP/2, multiplexing multiple chat streams over a single TCP/TLS connection.
- Works natively through corporate proxies, firewalls, and CDNs without custom ping/pong socket protocols.

---

## 11. Rate Limiting

To prevent API abuse and token exhaustion, we implement a 3-dimensional Redis sliding-window limiter:
1. **Requests Per Minute (RPM)**: Caps burst volume (e.g., 60 RPM).
2. **Tokens Per Minute (TPM)**: Caps token bandwidth (e.g., 40,000 TPM).
3. **Active Concurrency Limit**: Limits simultaneous active streaming sockets per user (e.g., max 5 concurrent streams).

When exceeded, the server returns **HTTP 429 Too Many Requests** with an explicit `Retry-After` header.

---

## 12. Failure Handling

Failure handling is where amateur projects and production systems diverge:
- **Upstream Model Timeout**: If an inference node does not emit a first token within 15 seconds, the request aborts and triggers circuit-breaker failure increments.
- **Client Disconnect**: If a user closes their browser tab mid-stream, the Fastify server catches the socket close event and cancels upstream GPU generation via `AbortSignal`, saving wasted GPU cycles.
- **Database / Cache Outages**: The backend features in-memory fallback stores to prevent hard crashes during local network partitions.

---

## 13. Observability

Every request emits structured JSON logs with:
- `request_id`, `user_id`, `conversation_id`, `model_id`
- `ttft_ms`, `total_duration_ms`, `tokens_per_sec`
- `input_tokens`, `output_tokens`, `estimated_cost_usd`

Prometheus metrics are scraped via `/metrics` (request duration histograms, TTFT histograms, token counters, and active stream gauges).

---

## 14. Cost Optimization

At 1M users generating 27 Billion tokens/month, financial transparency is vital:
- We track costs in real time per model ID.
- Telemetry dashboards display estimated costs down to micro-cents per response.
- Context truncation ensures users do not accidentally incur 32K token costs on 1-sentence questions.

---

## 15. What Happens During a Traffic Spike?

During sudden 10x traffic surges:
1. **Edge Admission**: Rate limiters shed excess volume immediately at the edge with HTTP 429s.
2. **Circuit Breaking**: If the primary reasoning model server saturates, the circuit breaker trips to `OPEN`, automatically rerouting incoming traffic to the fast 8B model tier.
3. **Full Jitter Backoff**: Client retries use randomized exponential backoff to prevent harmonic retry storms.

---

## 16. Scaling Roadmap: 1K → 10K → 100K → 1M Users

- **1K Users**: Single monolith container, managed PostgreSQL, direct external API calls.
- **10K Users**: Stateless containers behind an ALB, centralized Redis rate limiting.
- **100K Users**: PostgreSQL Read Replicas, dynamic multi-tier model routing, async BullMQ background queues.
- **1M Users**: Kubernetes HPA autoscaling, dedicated self-hosted vLLM inference clusters, monthly DB partitioning, automated circuit breakers.

---

## 17. What Changes at 10M Users?

At 10M+ users:
- **Multi-Region Active-Active**: Deploy full gateway and inference fleets across US, Europe, and Asia.
- **Distributed Spanner/CockroachDB**: Replace single-region primary PostgreSQL with globally distributed databases for data residency (GDPR) compliance.
- **Global Inference Mesh**: Dynamically route overflow inference queries across continents to follow off-peak GPU capacity.

---

## 18. What I Intentionally Did NOT Build

To keep this a clean, production-oriented reference architecture:
- Did not set up a real 30-node H100 GPU cluster locally (instead built an ultra-realistic Mock Provider with configurable TTFT, TPS, and failure modes).
- Did not build autonomous agent loops with dangerous unrestricted tool access.
- Did not hard-code vendor-specific assumptions.

---

## 19. Lessons Learned

1. **LLM infrastructure is an I/O and connection-holding problem** as much as a compute problem.
2. **Model routing is a cost superpower**: 60% of prompts don't need a frontier model.
3. **Circuit breakers are non-negotiable**: When an upstream GPU cluster fails, failing gracefully to a smaller model saves the user experience.

---

## 20. GitHub Demo & Reproducibility

You can clone and run the full reference implementation locally in under 60 seconds with zero API keys required:

- **Repository**: `[ADD LINK]`
- **Tech Stack**: Fastify, Next.js 14, TypeScript, Tailwind CSS, PostgreSQL, Redis, Prometheus, k6.

```bash
git clone [ADD LINK]
cd ai-system-design-chatgpt-1m
cp .env.example .env
pnpm install
pnpm dev
```
Open `http://localhost:3000` to interact with the streaming chat UI and live Architecture Telemetry HUD!
