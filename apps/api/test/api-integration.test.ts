import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { FastifyInstance } from 'fastify';

describe('Fastify HTTP & SSE Transport Requirements', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  it('GET /health returns process liveness status', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('pass');
    expect(body.uptimeSeconds).toBeDefined();
  });

  it('GET /ready returns dependency readiness check', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ready');
    expect(body.checks.postgres).toBeDefined();
  });

  it('GET /api/models returns catalog with circuit breaker availability', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/models' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.models)).toBe(true);
    expect(body.models.length).toBeGreaterThan(0);
    expect(body.models[0].status).toBe('CLOSED');
  });

  it('GET /api/stats returns live telemetry with empirical latency percentiles', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.live).toBeDefined();
    expect(body.live.latency).toBeDefined();
    expect(body.infrastructure).toBeDefined();
  });

  it('GET /metrics exports standard Prometheus OpenMetrics text format', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('aichat_');
  });

  it('POST /api/chat streams Server-Sent Events with start, tokens, meta, and done', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: 'Explain how distributed systems handle traffic spikes.',
        modelId: 'mock-fast',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.payload).toContain('data: {"type":"start"');
    expect(res.payload).toContain('data: {"type":"token"');
    expect(res.payload).toContain('data: {"type":"meta"');
    expect(res.payload).toContain('data: {"type":"done"}');
  });

  it('POST /api/chat rejects duplicate requests when idempotencyKey is already active', async () => {
    const idempotencyKey = `test_dup_${Date.now()}`;

    // First request
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: 'First request',
        idempotencyKey,
      },
    });
    expect(res1.statusCode).toBe(200);

    // Duplicate request with same idempotency key
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: 'Duplicate retry request',
        idempotencyKey,
      },
    });
    expect(res2.statusCode).toBe(409);
    const body = JSON.parse(res2.payload);
    expect(body.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('POST /api/simulate-failure controls fault injection and restores state cleanly', async () => {
    // 1. Force Trip Circuit
    const tripRes = await app.inject({
      method: 'POST',
      url: '/api/simulate-failure',
      payload: { action: 'trip_circuit', targetModel: 'mock-fast' },
    });
    expect(tripRes.statusCode).toBe(200);

    // 2. Verify fallback routing occurs
    const chatRes = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Hello', modelId: 'mock-fast' },
    });
    expect(chatRes.statusCode).toBe(200);
    expect(chatRes.payload).toContain('fallbackActivated":true');

    // 3. Reset circuits
    const resetRes = await app.inject({
      method: 'POST',
      url: '/api/simulate-failure',
      payload: { action: 'reset_circuits' },
    });
    expect(resetRes.statusCode).toBe(200);
  });
});
