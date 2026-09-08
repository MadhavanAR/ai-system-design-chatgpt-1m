# ADR-004: Server-Sent Events (SSE) vs WebSockets for Token Streaming

## Status
Accepted

## Context
LLM text generation produces tokens incrementally over several seconds. The client interface must render tokens with minimum Time-To-First-Token (TTFT) and seamless backpressure.

## Decision
We chose **Server-Sent Events (SSE)** over WebSockets and gRPC-Web for client-facing response streaming.

## Alternatives Considered
- **WebSockets**: Full duplex bidirectional channel, but complicates CDN/edge caching, bypasses HTTP/2 multiplexing, and requires custom socket heartbeat state machines.
- **gRPC-Web**: Excellent binary protocol, but adds significant client bundling overhead and protobuf decoding complexity in browsers.

## Why We Rejected Them
Chat turns are fundamentally unidirectional streaming operations per prompt (1 POST in -> stream of tokens out). Full-duplex WebSockets introduce operational overhead without functional benefits for text-based chat.

## Trade-offs
- **Pros**: Native HTTP/2 multiplexing over standard HTTPS (port 443); transparent pass-through across corporate proxies and CDNs; automatic reconnection handling built into standard EventSource.
- **Cons**: Unidirectional: client cancellation is handled via connection abort (`AbortSignal`) or separate control endpoints.

## Consequences
Streaming connections scale cleanly across standard reverse proxies and cloud load balancers.

## When We Would Revisit This Decision
If real-time bidirectional audio streaming (speech-to-speech with millisecond interruptibility) or multi-party collaborative document prompt editing is added to the product.
