# Architecture Diagrams: ChatGPT-like AI System for 1M Users

This document outlines the end-to-end architectural topologies, request flows, data tiering, and resilience state machines for the 1M-user platform.

---

## Diagram 1: High-Level End-to-End System Architecture

```mermaid
flowchart TD
    subgraph Clients["Clients Layer"]
        Web["Next.js Web App"]
        Mobile["Mobile / SDK Clients"]
    end

    subgraph Edge["Edge & Ingress Layer"]
        CDN["Cloudflare Anycast CDN / WAF"]
        LB["Layer 7 Load Balancer (Envoy / ALB)"]
    end

    subgraph APILayer["API Gateway & Service Layer (Fastify)"]
        GW1["API Gateway Pod #1"]
        GW2["API Gateway Pod #2"]
        GWN["API Gateway Pod #N"]
    end

    subgraph Middleware["Core Control Plane"]
        RL["Rate Limiter (RPM / TPM / Concurrency)"]
        CtxMgr["Context Manager & Budgeting"]
        Router["Dynamic Model Router"]
        CB["Circuit Breaker & Fallback Engine"]
    end

    subgraph CacheAndState["Cache & Ephemeral State"]
        RedisCluster["Redis 7 Cluster\n- Token Buckets\n- Hot Sessions\n- Prompt Prefix Cache"]
        Queue["Async Queue (Redis Streams / BullMQ)\n- Background Summaries\n- Analytics Ingestion"]
    end

    subgraph InferenceCluster["Model Serving & Inference Layer"]
        FastModel["Fast Tier: 8B Models\n(vLLM Cluster / 120ms TTFT)"]
        StdModel["Standard Tier: 70B Models\n(TensorRT-LLM / 280ms TTFT)"]
        ReasonModel["Reasoning Tier: DeepThink\n(Multi-step CoT)"]
        ExternalLLM["OpenAI / Anthropic Provider\n(External API Fallback)"]
    end

    subgraph Storage["Persistent Storage Tier"]
        PGPrimary["PostgreSQL 16 Primary (Writes)"]
        PGReplica["PostgreSQL Read Replicas (Reads)"]
        S3["Object Storage (S3 / GCS)\n- Cold Chat Archives\n- Daily DB Snapshots"]
    end

    subgraph Telemetry["Observability & Cost Engine"]
        Prometheus["Prometheus / OpenMetrics"]
        Grafana["Grafana Dashboards"]
        CostEngine["Live Token & Cost Engine"]
    end

    Clients --> Edge
    Edge --> APILayer
    APILayer --> Middleware
    Middleware <--> CacheAndState
    Middleware --> InferenceCluster
    APILayer --> Storage
    APILayer --> Telemetry
    InferenceCluster -- SSE Token Stream --> Clients
```

---

## Diagram 2: Chat Request Streaming Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant GW as API Gateway (Fastify)
    participant Redis as Redis Cluster
    participant DB as PostgreSQL 16
    participant Router as Model Router
    participant LLM as Model Inference Cluster (vLLM)

    User->>GW: POST /api/chat (SSE Handshake + Payload)
    GW->>DB: Fetch Active Conversation History
    GW->>Redis: Check & Acquire Token Bucket Rate Limit (RPM/TPM/Concurrency)
    
    alt Rate Limit Exceeded
        Redis-->>GW: Limit Exceeded (429)
        GW-->>User: HTTP 429 Too Many Requests (Retry-After)
    else Rate Limit OK
        Redis-->>GW: Quota Lease Acquired
        GW->>Router: Resolve Model Tier (Context Length + Query Policy)
        Router-->>GW: Selected Model + Circuit Status OK
        
        GW->>DB: Save User Turn Message
        GW-->>User: HTTP 200 SSE Stream Header (event: start)
        
        GW->>LLM: Stream Inference Request (Context Budgeted Tokens)
        LLM-->>GW: First Token Generated (TTFT ~120ms)
        GW-->>User: data: {"type":"token", "content":"..."}
        
        loop Token Generation Stream
            LLM-->>GW: Chunked Tokens
            GW-->>User: data: {"type":"token", "content":"..."}
        end
        
        LLM-->>GW: Stream Finished (Total Tokens, Durations)
        GW->>DB: Save Assistant Message + Audit Telemetry
        GW->>Redis: Release Concurrency Lease
        GW-->>User: data: {"type":"meta", "ttftMs":120, "cost":0.0002}
        GW-->>User: data: {"type":"done"}
    end
```

---

## Diagram 3: LLM Inference & Prefix/KV Caching Topology

```mermaid
flowchart LR
    subgraph Prompt["Prompt Assembly"]
        Sys["System Prompt\n(Standard Instructions)"]
        Hist["Conversation History\n(Turns 1 to N-1)"]
        New["Latest User Query\n(Turn N)"]
    end

    subgraph Router["Model Router & Cache Key"]
        Hash["Compute Prefix Hash SHA256(Sys + Hist)"]
    end

    subgraph GPUCluster["GPU Inference Engine (vLLM / TensorRT-LLM)"]
        KVCache["GPU Memory (HBM3)\nPrefix / Radix KV Cache"]
        Attn["Attention Kernel (FlashAttention-3)"]
        Weights["Transformer Weights (BF16 / FP8)"]
    end

    Prompt --> Router
    Router --> Hash
    Hash -->|Cache Hit| KVCache
    KVCache -->|Skip Prefill Compute| Attn
    Hash -->|Cache Miss| Attn
    Attn --> Weights
    Weights --> StreamOut["Token Generation Engine"]
```

---

## Diagram 4: Data Architecture & Persistence Strategy

```mermaid
flowchart TD
    subgraph IngressWrites["Conversational Writes (High Velocity)"]
        WriteReq["New Chat Messages / Turn Completion"]
    end

    subgraph CacheTier["Hot Tier: Redis 7"]
        ActiveConv["Active Conversation Threads (TTL 24h)"]
        RateLimits["Sliding Window Quotas (TTL 60s)"]
    end

    subgraph PrimaryDB["Primary Relational Tier: PostgreSQL 16"]
        Users["users Table"]
        Convs["conversations Table"]
        Msgs["messages Table (Monthly Partitioned)"]
        Usage["usage_records Table (Aggregates)"]
    end

    subgraph ReadTier["Read Scaling Tier"]
        Replica1["PostgreSQL Read Replica 1"]
        Replica2["PostgreSQL Read Replica 2"]
    end

    subgraph ColdArchive["Cold Storage Tier"]
        S3["AWS S3 / GCS\n- Parquet / JSONL Archives (90+ Days Old)\n- Daily Snapshots"]
    end

    IngressWrites --> WriteReq
    WriteReq --> ActiveConv
    WriteReq --> PrimaryDB
    PrimaryDB -. Streaming Replication .-> ReadTier
    PrimaryDB -->|Async Archival Job| S3
```

---

## Diagram 5: Resilience & Circuit Breaker State Machine

```mermaid
stateDiagram-v2
    [*] --> CLOSED : Normal Operation

    CLOSED --> OPEN : Consecutive Failures >= Threshold (5) / Model Timeout
    note right of OPEN
        All incoming requests immediately
        rerouted to Resilient Fallback Model.
        Zero latency penalty for user.
    end note

    OPEN --> HALF_OPEN : Reset Timeout Elapsed (10s)
    
    HALF_OPEN --> CLOSED : Probe Request Succeeds
    HALF_OPEN --> OPEN : Probe Request Fails
```

---

## Diagram 6: Multi-Region Global Topology

```mermaid
flowchart TD
    subgraph NorthAmerica["Region: US-East (Primary)"]
        GW_US["API Gateway (US)"]
        Inference_US["GPU Inference Pods (US)"]
        DB_Master["PostgreSQL 16 Primary (Master)"]
        Redis_US["Redis Cluster (US)"]
    end

    subgraph Europe["Region: EU-Central (Edge)"]
        GW_EU["API Gateway (EU)"]
        Inference_EU["GPU Inference Pods (EU)"]
        DB_EU["PostgreSQL Read Replica (EU)"]
        Redis_EU["Redis Cluster (EU)"]
    end

    subgraph Asia["Region: AP-Southeast (Edge)"]
        GW_AP["API Gateway (AP)"]
        Inference_AP["GPU Inference Pods (AP)"]
        DB_AP["PostgreSQL Read Replica (AP)"]
        Redis_AP["Redis Cluster (AP)"]
    end

    Users_Global["Global Users (DNS / Anycast Routing)"] --> GW_US
    Users_Global --> GW_EU
    Users_Global --> GW_AP

    GW_EU --> Inference_EU
    GW_AP --> Inference_AP
    GW_US --> Inference_US

    GW_EU -. Reads .-> DB_EU
    GW_AP -. Reads .-> DB_AP
    GW_EU -. Writes .-> DB_Master
    GW_AP -. Writes .-> DB_Master
    DB_Master -. Async Replication .-> DB_EU
    DB_Master -. Async Replication .-> DB_AP
```
