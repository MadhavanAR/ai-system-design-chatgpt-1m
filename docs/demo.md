# Interview Demo Walkthrough Script

Use this structured script to present the **ChatGPT for 1M Users** architecture during system design interviews, portfolio reviews, or technical presentations.

---

## Step 1: Launch and Health Check

**Presenter Says:**
> *"I've built a production-oriented reference implementation of a ChatGPT-like AI platform designed for 1M users. Let's start the system with zero required API keys using the local mock provider."*

**Action:**
```bash
# Terminal 1:
pnpm dev

# Terminal 2 (Verify Liveness & Readiness):
curl -s http://localhost:4000/health
curl -s http://localhost:4000/ready
```

**Observation:**
- `/health` returns `status: pass` (process is alive).
- `/ready` returns `status: ready` (dependencies or in-memory fallbacks are operational).

---

## Step 2: Interactive Chat & SSE Streaming

**Presenter Says:**
> *"Let's open the Next.js frontend at `http://localhost:3000`. We'll submit a complex architectural prompt: 'Explain how distributed systems handle traffic spikes.' Notice the sub-150ms Time-To-First-Token (TTFT) and chunked token streaming over Server-Sent Events."*

**Action:**
- Send prompt in UI.
- Observe streaming tokens, markdown rendering, and code block formatting.
- Point out the technical telemetry HUD beneath the response:
  - `Model: mock-fast`
  - `TTFT: ~120ms`
  - `Tokens: ~180`
  - `Speed: ~75 t/s`
  - `Cost: ~$0.0001`

---

## Step 3: Explain the Request Lifecycle & Model Routing

**Presenter Says:**
> *"When that request was submitted, it wasn't just sent to an LLM. It passed through:
> 1. Redis rate limit check (RPM, TPM, and Concurrency leases).
> 2. The ContextManager, which enforces a sliding token window to prevent context bloat.
> 3. The Model Router, which evaluated query complexity and selected the fast 8B tier rather than a $10/M frontier model, saving ~80% in inference cost."*

---

## Step 4: Open Architecture & Resilience Telemetry HUD

**Presenter Says:**
> *"Click the 'System Metrics' button in the top right. This opens our live telemetry HUD, displaying real-time metrics, measured latency percentiles (p50, p95, p99), and our Circuit Breaker state machines."*

**Action:**
- Click **"System Metrics"**.
- Point out Prometheus counters and Circuit Breaker states (`mock-fast: CLOSED`, `mock-standard: CLOSED`, etc.).

---

## Step 5: Fault Injection & Automatic Circuit Fallback

**Presenter Says:**
> *"Now let's simulate an upstream model outage. I will manually trip the circuit breaker for `mock-fast` to OPEN using our local fault injection controls."*

**Action:**
- Click **"Trip Fast-Model Circuit"**.
- State changes to `OPEN`.
- Send a new message in the chat.

**Presenter Says:**
> *"Notice that the request succeeded without throwing an error to the user! The Model Router inspected the circuit breaker, detected that `mock-fast` was down, and automatically rerouted the request to the healthy `mock-standard` fallback model."*

---

## Step 6: Rate Limiting & 429 Surge Rejection

**Presenter Says:**
> *"To protect upstream model servers from noisy neighbors or rogue scripts, let's trigger rate limiting by flooding requests."*

**Action:**
- Submit rapid bursts in chat or run multiple concurrent curl requests:
```bash
for i in {1..10}; do curl -s -X POST http://localhost:4000/api/chat -H "Content-Type: application/json" -d '{"message":"test"}' & done
```

**Observation:**
- The server returns **HTTP 429 Too Many Requests** with an explicit `Retry-After` header.
- The UI displays the rate limit alert banner.

---

## Step 7: Empirical Load Testing with k6

**Presenter Says:**
> *"We validate infrastructure performance using k6. Let's run a multi-stage load test ramping up to 200 concurrent Virtual Users streaming SSE simultaneously."*

**Action:**
```bash
pnpm benchmark
```

**Presenter Says:**
> *"The k6 test executes thousands of streaming turns with 0% error rate, maintaining average TTFT at ~120ms. It validates our connection handling and rate limiting pipelines under load."*

---

## Step 8: Conclude with Capacity Planning & Production Gaps

**Presenter Says:**
> *"In our `docs/capacity-planning.md` and `docs/production-gap-analysis.md`, we document the full mathematical derivation for 1M users: 100K DAU, 18K peak output tokens/sec, ~30x NVIDIA H100 GPUs, and explain how the system transitions to multi-region active-active at 10M scale."*
