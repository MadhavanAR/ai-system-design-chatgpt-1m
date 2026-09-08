# Engineering Trade-Offs Analysis

Every architectural decision involves a conscious exchange between competing constraints (latency, cost, operational complexity, consistency, and resilience). This document details the explicit trade-offs made in the **ChatGPT-1M** reference architecture.

---

## 1. Server-Sent Events (SSE) vs. WebSockets

- **Decision**: Use **Server-Sent Events (SSE)** over HTTP/2 for client-facing response streaming.
- **Why**: LLM chat interactions are fundamentally *unidirectional streaming per turn*: 1 prompt payload goes in -> a stream of $N$ tokens flows out. WebSockets provide full-duplex bi-directionality that is unnecessary for this interaction model.
- **Benefits**:
  - Operates over standard HTTPS (port 443) through corporate firewalls, reverse proxies, and CDN edge layers without custom upgrade negotiation.
  - Native multiplexing over HTTP/2 connections (multiple conversations share a single TCP/TLS handshake).
  - Built-in reconnect semantics via browser `EventSource` and fetch streaming.
- **Costs & Trade-offs**:
  - Unidirectional: client cancellations must be signaled via HTTP connection termination (`AbortSignal`) or a separate control endpoint rather than an in-band frame.
- **Failure Mode**: Network intermediate proxies that buffer HTTP responses without flushing chunked transfers. Mitigated via `X-Accel-Buffering: no` and `Cache-Control: no-transform` headers.
- **When I Would Change It**: If bidirectional audio streaming (e.g. real-time speech-to-speech with interruptibility) or multi-party collaborative editing on the prompt buffer is introduced.

---

## 2. PostgreSQL Relational Persistence vs. NoSQL / Document Store

- **Decision**: Use **PostgreSQL 16** with monthly table partitions and Read Replicas as the primary relational system of record.
- **Why**: Conversational data in a multi-tenant platform has strict relational constraints (`User` -> `Tenant` -> `Conversation` -> `Message` -> `UsageRecord`). Token accounting and rate limit audits require ACID transactional integrity.
- **Benefits**:
  - ACID transactions prevent double-billing or orphaned message records.
  - Mature ecosystem for read-replica horizontal scaling and logical replication.
  - Strict typing and constraints eliminate data corruption.
- **Costs & Trade-offs**:
  - Requires explicit schema migrations and connection pool management (e.g. PgBouncer) to prevent connection exhaustion during traffic bursts.
- **Failure Mode**: Write lock contention on hot user records during simultaneous multi-turn bursts.
- **When I Would Change It**: Beyond 100M daily messages, migrate cold message partitions to distributed column-oriented stores (e.g., Apache Cassandra or AWS DynamoDB) while keeping users, tenants, and billing in PostgreSQL.

---

## 3. Redis Streams / BullMQ vs. Apache Kafka

- **Decision**: Use **Redis Streams / BullMQ** for asynchronous background workloads (conversation summarization, vector indexing, usage aggregation) rather than Kafka.
- **Why**: At 1M users (1.5M requests/day ≈ 17.4 avg RPS), Kafka’s operational overhead (ZooKeeper/KRaft clusters, partition rebalancing, JVM memory footprints) is an unnecessary complexity hazard.
- **Benefits**:
  - Zero additional infrastructure when Redis is already deployed for rate limiting and session caching.
  - Sub-millisecond queuing and consumer acknowledgment latencies.
- **Costs & Trade-offs**:
  - In-memory queue retention must be bounded; message replay beyond the configured stream length requires reading from PostgreSQL audit logs.
- **Failure Mode**: Redis node memory pressure if workers fail to consume messages faster than ingestion rates. Mitigated with `MAXLEN ~` stream caps.
- **When I Would Change It**: At 10M+ users (>500M daily events) with multiple downstream analytical consumers (data warehouse, fraud detection, fine-tuning pipelines) requiring persistent multi-week retention.

---

## 4. Synchronous Token Streaming vs. Asynchronous Job Queuing

- **Decision**: Keep user-facing SSE chat generation in the **direct synchronous path**; offload only background tasks (summaries, embeddings, analytics) to asynchronous queues.
- **Why**: Putting interactive chat behind an asynchronous job queue introduces queue scheduling latency that directly degrades interactive **Time-To-First-Token (TTFT)**.
- **Benefits**:
  - Delivers sub-150ms TTFT by eliminating worker polling and queue dispatch overhead.
- **Costs & Trade-offs**:
  - API Gateway instances must hold open persistent streaming sockets for the duration of generation (~2–6 seconds per turn).
- **Failure Mode**: API Gateway node memory exhaustion if tens of thousands of idle connections accumulate. Mitigated with connection timeouts and reverse proxy buffering limits.
- **When I Would Change It**: For non-interactive batch generation tasks (e.g., bulk document translation, offline batch evals).

---

## 5. Dynamic 3-Tier Model Routing vs. Single Frontier Model

- **Decision**: Dynamically route prompts across **Fast (8B)**, **Standard (70B)**, and **Reasoning** tiers based on complexity and context length.
- **Why**: Monolithic routing to frontier reasoning models ($2.50–$10.00/1M tokens) is financially unsustainable. Under realistic traffic distributions, 60%+ of queries are simple questions, formatting requests, or greetings that an 8B model solves in <150ms.
- **Benefits**:
  - Slashes aggregate inference spend by >80%.
  - Significantly reduces average user latency.
  - Provides built-in circuit breaker fallback targets.
- **Costs & Trade-offs**:
  - Requires maintaining multiple model serving instances and routing heuristic policies.
- **Failure Mode**: False-negative classification where a subtly complex query is routed to the fast tier and produces an unsatisfactory answer.
- **When I Would Change It**: If compact models become so cheap that maintaining multiple deployment pipelines outweighs the marginal cost difference.

---

## 6. Prefix / KV Attention Caching vs. Exact Query Response Caching

- **Decision**: Prioritize **Prefix/KV Caching** at the model serving layer (vLLM / PagedAttention) over aggressive response-level caching.
- **Why**: LLM user prompts are rarely identical down to the character; small conversational variations cause exact-match response caches to miss. Prefix caching reuses computed attention matrices for the shared system prompt and prior turns, delivering high cache hits regardless of minor variations in the latest prompt.
- **Benefits**:
  - Reuses GPU memory tensors without compromising response freshness or non-deterministic temperature sampling.
  - Drops prompt prefill latency by up to 80%.
- **Costs & Trade-offs**:
  - Consumes GPU High-Bandwidth Memory (HBM3) to store Key-Value tensors.
- **Failure Mode**: Fragmented GPU memory under extreme context diversity. Mitigated by RadixAttention LRU eviction.
- **When I Would Change It**: For highly static API use cases (e.g., standard FAQ chatbots where 90% of user queries match known patterns).

---

## 7. Regional Edge Gateways with Centralized Primary DB vs. Multi-Region Active-Active

- **Decision**: Deploy **Regional Edge Gateways + Read Replicas** with a **Single Primary Master PostgreSQL** in US-East for 1M scale.
- **Why**: Full multi-master active-active relational replication introduces cross-region write conflicts, complex distributed transactions (2PC), and massive operational overhead. At 1M users (17 avg RPS, 52 peak RPS), a single primary PostgreSQL handles writes with <5% CPU utilization.
- **Benefits**:
  - Eliminates distributed lock contention and write-conflict resolution logic.
  - Edge gateways terminate TLS locally, keeping connection latency sub-50ms globally.
- **Costs & Trade-offs**:
  - Cross-region writes incur 80–120ms roundtrip network latency to the US-East primary.
- **Failure Mode**: Outage in the primary cloud region requires promoting a regional read replica (RTO: ~60s, RPO: <5s).
- **When I Would Change It**: At 10M+ users with strict global data residency (GDPR) mandates requiring local write authority, migrating to Google Cloud Spanner or CockroachDB.
