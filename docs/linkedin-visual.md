# LinkedIn Architecture Visual (Mobile Optimized)

## Headline
### **How would you design ChatGPT for 1,000,000 users?**

---

```text
┌────────────────────────────────────────────────────────┐
│                        USERS                           │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                   API GATEWAY / CDN                    │
│   (Anycast Edge • TLS Termination • WAF Filtering)     │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                     LOAD BALANCER                      │
│        (Layer 7 Reverse Proxy • Envoy / ALB)           │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                    API SERVICE LAYER                   │
│      (Stateless Fastify Pods • Kubernetes HPA)         │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
               ▼                          ▼
   ┌───────────────────────┐  ┌───────────────────────┐
   │    REDIS 7 CLUSTER    │  │    POSTGRESQL 16      │
   │  • Rate Limiting      │  │  • Conversations      │
   │  • Active Concurrency │  │  • Monthly Partitions │
   │  • Hot Thread Cache   │  │  • Read Replicas      │
   └───────────────────────┘  └───────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────┐
│                 DYNAMIC MODEL ROUTER                   │
│   • Simple (8B FP8)   • Standard (70B)   • Reasoning   │
│   • Circuit Breaker Automatic Fallback Engine          │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│               INFERENCE CLUSTER (vLLM)                 │
│    Continuous Batching • GPU Prefix/KV Cache Reuse     │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│             SERVER-SENT EVENTS (SSE) STREAM            │
│            (Sub-150ms TTFT • ~145 Tokens/Sec)          │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
                         USER
```

---

## Key Supporting Pillars:
- **Observability**: Prometheus `/metrics` • TTFT histograms • Token usage counters
- **Cost Engine**: Real-time micro-cent tracking per model tier
- **Resilience**: Closed/Open/Half-Open Circuit Breakers + Full Jitter Backoff
- **Data Scale**: 100K DAU • 1.5M daily messages • 27 Billion tokens/month
