import { describe, it, expect } from 'vitest';
import { ModelRouter } from '../src/application/routing/model-router.js';
import { circuitBreakers } from '../src/application/resilience/circuit-breaker.js';

describe('ModelRouter Policy Requirements', () => {
  const router = new ModelRouter();

  it('routes complex formal proof queries to reasoning tier with clear explanation', () => {
    const { decision } = router.resolveRoute(
      'auto',
      'Please prove formally that this distributed mutual exclusion algorithm is starvation free',
      500
    );

    expect(decision.selectedModelId).toBe('mock-reasoning');
    expect(decision.tier).toBe('reasoning');
    expect(decision.reason).toContain('formal multi-step reasoning');
    expect(decision.isFallback).toBe(false);
  });

  it('routes standard lightweight queries to fast 8B tier', () => {
    const { decision } = router.resolveRoute('auto', 'What is the syntax for a typescript interface?', 200);

    expect(decision.selectedModelId).toBe('mock-fast');
    expect(decision.tier).toBe('fast');
    expect(decision.reason).toContain('Fast 8B tier');
  });

  it('routes long-context queries exceeding 4000 tokens to standard tier', () => {
    const { decision } = router.resolveRoute('auto', 'Summarize the above file', 4500);

    expect(decision.selectedModelId).toBe('mock-standard');
    expect(decision.tier).toBe('standard');
    expect(decision.reason).toContain('exceeds fast tier budget');
  });

  it('automatically reroutes to healthy fallback model when primary circuit is OPEN', () => {
    const reasoningCb = circuitBreakers['mock-reasoning'];
    reasoningCb.forceOpen();

    const { decision } = router.resolveRoute('mock-reasoning', 'Analyze this system');

    expect(decision.isFallback).toBe(true);
    expect(decision.selectedModelId).toBe('mock-standard');
    expect(decision.reason).toContain('Circuit breaker for [mock-reasoning] is OPEN');

    // Clean up
    reasoningCb.reset();
  });
});
