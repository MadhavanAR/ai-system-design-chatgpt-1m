# ADR-008: Multi-Region Deployment & Latency Optimization

## Status
Accepted

## Context
At 1M registered users (and 100K DAU distributed across North America, Europe, and Asia-Pacific), routing all global network traffic to a single primary datacenter incurs 150ms-300ms TCP/TLS handshake latency penalties before generation even starts.

## Decision
Adopt a **Regional Edge + Centralized Primary DB with Read Replicas** topology:
- **Edge Layer (Anycast CDN + Regional API Gateways)**: Terminate TLS and perform authentication and rate limiting in US-East, EU-Central, and AP-Southeast.
- **Model Inference Clusters**: Deployed regionally where GPU capacity reservations are located, with cross-region routing overflow when local GPU pools saturate.
- **Database**: Primary PostgreSQL in US-East with cross-region Read Replicas for local conversation history reads.

## Alternatives Considered
- **Single-Region Monolith**: High global latency (200ms+ roundtrips for EU/Asia users).
- **Multi-Region Active-Active Multi-Master Database**: Unnecessary operational overhead and write-conflict risks for 1M user scale.

## Why We Rejected Them
Single-region harms international UX; multi-master database replication adds extreme complexity not justified by 17 avg RPS.

## Trade-offs
- **Pros**: Sub-50ms connection establishment globally; resilience against regional cloud provider outages.
- **Cons**: Cross-region writes incur 80–120ms roundtrip latency to the US-East primary.

## When We Would Revisit This Decision
At 10M+ users with strict regulatory data sovereignty (GDPR in EU) requiring local write authority, migrating to Google Cloud Spanner or CockroachDB.
