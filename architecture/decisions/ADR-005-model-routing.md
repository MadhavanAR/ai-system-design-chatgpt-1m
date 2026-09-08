# ADR-005: Dynamic Multi-Tier Model Routing

## Status
Accepted

## Context
In a 1M-user platform, routing every prompt to a top-tier frontier model ($10+/1M tokens) is cost-prohibitive and introduces unnecessary latency for simple queries.

## Decision
We implemented an **Explainable 3-Tier Model Router**:
1. **Fast Tier (8B parameters)**: Serves ~60% of queries (greetings, simple QA, formatting) at $0.15/1M tokens and ~120ms TTFT.
2. **Standard Tier (70B parameters)**: Serves ~35% of queries (coding, synthesis) at $0.80/1M tokens.
3. **Reasoning Tier**: Serves ~5% of queries (formal proofs, multi-step math) at $2.50/1M tokens.
4. **Resilient Circuit Breaker Fallback**: Automatically downgrades requests to secondary tiers if the primary provider trips circuit breakers.

## Alternatives Considered
- **Single Frontier Model**: Simple to build, but economically unsustainable ($15,000+/mo in raw model costs).
- **Client-Side Model Selection Only**: Users always choose the largest model, driving up cloud bills.

## Why We Rejected Them
Monolithic routing ignores the statistical distribution of conversational AI workloads where over half of requests require low reasoning depth.

## Trade-offs
- **Pros**: Reduces aggregate inference spend by >80%; improves average user latency; provides built-in circuit breaker fallback targets.
- **Cons**: Requires maintaining multiple model serving instances and routing heuristic policies.

## Consequences
Every request returns a rich `ModelDecision` explaining why the model was selected and whether fallback was activated.

## When We Would Revisit This Decision
If compact 8B models achieve parity with 70B models across all benchmark reasoning tasks, or if inference pricing drops by an order of magnitude.
