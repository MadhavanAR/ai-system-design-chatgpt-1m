# ADR-007: Prefix and Semantic Caching Strategy

## Status
Accepted

## Context
In chat applications, system prompts and earlier turns in a conversation are sent repeatedly on every turn. Computing full transformer attention matrices over identical prefixes wastes massive GPU FLOPs and introduces latency.

## Decision
We establish a two-tier caching strategy:
1. **Application-Level Exact & Prefix Caching**: Hash of `(system_prompt + turn_history)` stored in Redis for exact query deduplication.
2. **Inference-Level Prefix / KV Caching (vLLM / PagedAttention / RadixAttention)**: Model servers cache the Key-Value attention tensor for common prefixes, dropping TTFT from ~400ms to <80ms for warm prompts.

## Alternatives Considered
- **Aggressive Exact Response Caching Only**: Misses 95%+ of queries due to slight prompt variations or non-zero temperature sampling.
- **No Caching**: Recomputes full attention matrices on every turn, wasting GPU memory bandwidth.

## Why We Rejected Them
Exact response caching is ineffective for conversational AI, whereas GPU Prefix/KV caching delivers huge speedups regardless of minor query variations.

## Trade-offs
- **Pros**: Reuses GPU memory tensors without compromising response freshness; drops prompt prefill latency by up to 80%.
- **Cons**: Consumes GPU High-Bandwidth Memory (HBM3) to store Key-Value tensors.

## When We Would Revisit This Decision
If the product evolves toward highly structured repetitive FAQ agents where semantic vector caching in pgvector achieves a >60% hit rate.
