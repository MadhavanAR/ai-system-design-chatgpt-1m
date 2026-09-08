import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { FastifyInstance } from 'fastify';

/**
 * Contributor Contract Verification Suite
 *
 * This test suite verifies the core public behaviors that open-source
 * contributors are most likely to extend (e.g., adding model providers,
 * tuning model routing heuristics, or altering SSE stream events).
 */
describe('Contributor Contract: Public Request & Streaming Lifecycle', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  it('verifies the full SSE event schema structure during chat streaming', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: 'Hello system design contributor!',
        modelId: 'mock-fast',
        temperature: 0.7,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');

    const lines = response.payload.split('\n\n').filter((l) => l.startsWith('data: '));
    const events = lines.map((l) => JSON.parse(l.replace('data: ', '')));

    // 1. Verify 'start' event with routing metadata
    const startEvent = events.find((e) => e.type === 'start');
    expect(startEvent).toBeDefined();
    expect(startEvent.modelId).toBe('mock-fast');

    // 2. Verify 'token' events stream content
    const tokenEvents = events.filter((e) => e.type === 'token');
    expect(tokenEvents.length).toBeGreaterThan(0);
    expect(tokenEvents[0].content).toBeDefined();

    // 3. Verify 'meta' event carries cost and latency metrics
    const metaEvent = events.find((e) => e.type === 'meta');
    expect(metaEvent).toBeDefined();
    expect(metaEvent.tokensGenerated).toBeGreaterThan(0);
    expect(metaEvent.estimatedCostUsd).toBeGreaterThanOrEqual(0);
    expect(metaEvent.ttftMs).toBeGreaterThan(0);

    // 4. Verify 'done' event closes the transmission
    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
  });

  it('verifies explicit model overrides route to the target model', async () => {
    // Requesting 'mock-reasoning' explicitly
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: 'Simple query',
        modelId: 'mock-reasoning',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('"modelId":"mock-reasoning"');
    expect(res.headers['x-selected-model']).toBe('mock-reasoning');
    expect(res.headers['x-model-tier']).toBe('reasoning');
  });

  it('verifies graceful 400 Bad Request when request body is malformed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      payload: {
        // Missing required 'message' string
        temperature: 0.7,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('Validation failed');
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toBeDefined();
  });
});
