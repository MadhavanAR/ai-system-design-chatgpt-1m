# ADR-006: Asynchronous Queue Strategy (Telemetry vs Chat Streaming)

## Status
Accepted

## Context
Deciding what belongs in the synchronous request path versus the asynchronous worker queue is critical for LLM responsiveness. Placing the entire chat request behind a job queue introduces queue wait latency that directly degrades interactive Time-To-First-Token (TTFT).

## Decision
- **Synchronous Path**: API Gateway -> Rate Limiting -> Context Assembly -> Model Router -> SSE Token Stream directly back to the browser.
- **Asynchronous Path (Redis Streams / BullMQ)**: Conversation summarization, vector embedding generation, cold storage archiving to S3, asynchronous billing aggregates, and high-volume audit logging.

## Alternatives Considered
- **All Requests Queued (Kafka / SQS)**: Guarantees load leveling, but adds 200–500ms of queue polling lag before token generation begins.
- **No Queue (All Synchronous)**: Fast, but heavy background embeddings contend with user-facing CPU event loops.

## Why We Rejected Them
User-facing chat demands sub-150ms TTFT. Background analytics must never contend with live token streaming.

## Trade-offs
- **Pros**: Sub-second interactive TTFT is preserved without queue scheduling lag; heavy background computation does not contend with user-facing CPU loops.
- **Cons**: Requires maintaining both synchronous HTTP handlers and background worker process pools.

## Consequences
User experience remains snappy while heavy analytical pipelines run decoupled in the background.

## When We Would Revisit This Decision
If non-interactive batch document evaluations or asynchronous background report generation becomes a major product feature.
