# ADR-001: API Gateway and Web Framework Selection

## Status
Accepted

## Context
A ChatGPT-like application serving 1M users with heavy concurrent streaming workloads requires an API gateway layer capable of handling tens of thousands of concurrent long-lived HTTP connections (Server-Sent Events) with minimal event loop latency, low memory footprint per socket, and zero serialization overhead.

## Decision
We chose **Fastify** over Express.js and NestJS for the core API gateway and routing layer.

## Alternatives Considered
- **Express.js**: Standard Node.js framework, but suffers from higher memory consumption per connection, lacks native schema compilation, and has significantly lower throughput under concurrent SSE streaming.
- **NestJS**: Provides strict OOP architecture, but introduces heavy abstraction overhead and dependency injection layers that increase cold start times and latency.
- **Go / Rust**: Extremely fast, but TypeScript across both backend and frontend enables single-language full-stack type sharing, rapid iteration, and shared schema validation (Zod).

## Why We Rejected Them
Express has higher CPU overhead per streaming chunk under high concurrency. NestJS adds unnecessary class-validator/reflection overhead for high-throughput stream proxying.

## Trade-offs
- **Pros**: 2x-3x higher requests/sec and lower latency than Express; built-in schema compilation with fast-json-stringify; low memory footprint (~30MB base runtime).
- **Cons**: Smaller legacy middleware ecosystem compared to Express (mitigated via Fastify plugins).

## Consequences
Stateless API Gateway containers scale horizontally behind load balancers with predictable memory consumption during peak SSE streaming.

## When We Would Revisit This Decision
If the API Gateway throughput bottleneck shifts to CPU-bound cryptography or binary protocol decoding exceeding 100,000 concurrent sockets per node, warranting a rewrite of the edge ingress proxy in **Rust (Axum)** or **Go (Gin/Fiber)**.
