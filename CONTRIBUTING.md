# Contributing to AI System Design - ChatGPT at 1M Users

Thank you for your interest in contributing to this open-source reference implementation and system-design case study. We welcome contributions that improve correctness, documentation, clarity, test coverage and developer ergonomics.

---

## 1. Ground Rules & Project Philosophy

Before opening a pull request, please keep our core tenets in mind:

1. **Honest Claims**: We strictly distinguish between **Level 1 (local runnable implementation)**, **Level 2 (production target architecture)**, and **Level 3 (1M capacity model)**. Never claim local code serves 1M concurrent users.
2. **Lean Dependencies**: Do not introduce heavy infrastructure (Kafka, Kubernetes, pgvector, service meshes) unless there is a verified architectural justification and the existing design genuinely requires it.
3. **Reproducibility**: Any new feature or bugfix must pass verification (`pnpm verify`) and work out of the box with zero external paid API requirements.

---

## 2. Getting Started

### Prerequisites
- **Node.js**: v20+ LTS
- **pnpm**: v9+ (or v11)
- **Docker & Docker Compose** (optional for local mock mode, required for full Redis/Postgres integration & benchmarks)

### Setup
```bash
# 1. Clone repository
git clone https://github.com/MadhavanAR/AI-Chatbot.git
cd AI-Chatbot

# 2. Install dependencies
pnpm install

# 3. Configure environment
cp .env.example .env

# 4. Start backing databases (Postgres + Redis)
docker compose up -d

# 5. Run full verification suite
pnpm verify

# 6. Start development servers
pnpm dev
```

- API runs at `http://localhost:4000`
- Web UI runs at `http://localhost:3000`

---

## 3. Development Workflow

The project is structured as a `pnpm` monorepo:
- `apps/api`: Fastify backend (SSE streaming, model router, circuit breaker, rate limiting, metrics)
- `apps/web`: Next.js 14 frontend (TailwindCSS, real-time telemetry, model switcher)
- `architecture/decisions`: Architectural Decision Records (ADRs)
- `benchmarks`: k6 load testing scripts and empirical results
- `docs`: System design, capacity planning, and failure mode documentation

### Running Services Independently
```bash
# Run API server only
pnpm dev:api

# Run Web UI only
pnpm dev:web
```

---

## 4. Testing & Verification

All contributions must pass the verification gate before submitting a PR:

```bash
# Run all checks (typecheck, tests, build)
pnpm verify

# Run unit & integration tests
pnpm test

# Run TypeScript typechecks
pnpm typecheck

# Run linter
pnpm lint

# Run k6 load test (with Docker containers running)
pnpm benchmark
```

---

## 5. Architectural Changes & ADRs

If your pull request introduces a significant architectural decision (such as modifying rate-limiting algorithms, context compaction strategies, or routing state machines), please include an **Architectural Decision Record (ADR)** in `architecture/decisions/`.

Use the standard format:
1. **Context**: What problem are we solving?
2. **Decision**: What is the chosen solution?
3. **Alternatives Considered**: What other designs were evaluated?
4. **Why this Choice**: Technical trade-offs.
5. **Consequences**: Positive and negative implications.
6. **Revisit Trigger**: When should this decision be reconsidered?

---

## 6. Pull Request Guidelines

1. **Focused Scope**: Keep PRs focused on a single issue, fix, or improvement.
2. **Commit Messages**: Write clear, descriptive commit messages (e.g. `fix(router): prevent race condition during fallback evaluation`).
3. **Tests Included**: Accompany code changes with corresponding unit or integration tests in `apps/api/test/`.
4. **Documentation**: Update relevant Markdown docs (`docs/` or `README.md`) if configuration, APIs, or behaviors change.
5. **No Tracked Secrets**: Ensure `.env` or personal credentials are never committed.

---

## 7. Reporting Issues & Proposing Features

- **Bug Reports**: Please open an issue using the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md). Include your OS, Node version, reproduction steps, and relevant logs.
- **Feature Requests**: Please open an issue using the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md). Clearly state the architectural problem, proposed solution, and trade-offs.
