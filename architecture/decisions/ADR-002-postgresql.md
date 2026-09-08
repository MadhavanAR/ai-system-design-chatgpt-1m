# ADR-002: Relational Persistence with PostgreSQL

## Status
Accepted

## Context
Conversational AI systems require persistence for users, organizational tenants, conversation threads, message histories, token usage audits, and billing records. The data is inherently structured with strict relational integrity (`users` -> `conversations` -> `messages` -> `usage_records`).

## Decision
We chose **PostgreSQL 16** as the primary relational system of record, combined with monthly table partitioning on `messages` and `model_requests`, and Read Replicas for horizontal query scaling.

## Alternatives Considered
- **MongoDB / DocumentDB**: Flexible schema, but lacks ACID transactional guarantees for multi-tenant billing/usage records and requires manual reference integrity management.
- **DynamoDB / Cassandra**: Excellent partition write scaling, but complex query patterns (e.g. searching user conversations by model, date ranges, token audits) require expensive secondary indexes.

## Why We Rejected Them
ACID transactions are non-negotiable for billing and token quotas. Document databases increase data corruption risks during concurrent multi-turn updates.

## Trade-offs
- **Pros**: ACID transactions prevent double-billing; mature ecosystem for read-replica horizontal scaling; strict typing and constraints eliminate data corruption.
- **Cons**: Requires explicit schema migrations and connection pool management (e.g. PgBouncer) to prevent connection exhaustion during traffic bursts.

## Consequences
Read-heavy history queries scale horizontally across replicas without impacting the primary master write throughput.

## When We Would Revisit This Decision
Beyond 100M daily messages where write volume exceeds single-master write limits, migrating historical message partitions to a distributed column-oriented store (e.g., Apache Cassandra or AWS DynamoDB) or globally distributed database (CockroachDB / Spanner).
