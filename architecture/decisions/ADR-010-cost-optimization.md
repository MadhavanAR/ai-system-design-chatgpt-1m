# ADR-010: LLM Cost Optimization & Dynamic Budgeting

## Status
Accepted

## Context
At 1M registered users (~100K DAU generating ~1.5B tokens/month), naive routing to frontier models ($10/M tokens) costs upwards of $15,000/month in raw inference. Controlling model spend requires automated cost calculation, tier-based routing, and context budgeting.

## Decision
1. **Dynamic Model Pricing Configuration**: Maintain real-time per-model input and output rates per 1M tokens.
2. **Context Token Budgeting**: The `ContextManager` dynamically truncates stale historical turns and caps conversation context at 75% of model window limit, reserving the remaining 25% for generation headroom.
3. **Smart Tier Routing**: Default routine queries to lightweight 8B models ($0.15/1M tokens) and only escalate to 70B ($0.80/1M) or Reasoning ($2.50/1M) when prompt complexity warrants it.

## Alternatives Considered
- **No Token Caps**: Users easily exceed context windows, causing 500 errors and skyrocketing bills.
- **Fixed Model For All Users**: Either quality is too low for coding, or costs are too high for routine chat.

## Why We Rejected Them
Context budgeting and multi-tier routing protect both user experience and infrastructure unit economics.

## Trade-offs
- **Pros**: Blended token cost drops from ~$2.50/1M to ~$0.45/1M tokens, saving over 80% in operational inference expenditure.
- **Cons**: Requires continuous benchmarking to ensure 8B models meet quality bars for routine queries.

## When We Would Revisit This Decision
When open-weight speculative decoding techniques allow running 70B models at 8B inference speeds and costs.
