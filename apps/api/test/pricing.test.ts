import { describe, it, expect } from 'vitest';
import { CostEngine } from '../src/application/cost/pricing.js';

describe('CostEngine Financial Pricing Requirements', () => {
  it('calculates exact fractional USD cost for fast 8B model with zero rounding error', () => {
    // mock-fast: $0.15/1M in, $0.60/1M out
    const cost = CostEngine.calculateCost('mock-fast', 1000, 2000);

    expect(cost.inputCostUsd).toBeCloseTo(0.00015, 6);
    expect(cost.outputCostUsd).toBeCloseTo(0.0012, 6);
    expect(cost.totalCostUsd).toBeCloseTo(0.00135, 6);
  });

  it('calculates zero cost for zero-token edge cases', () => {
    const cost = CostEngine.calculateCost('mock-fast', 0, 0);

    expect(cost.inputCostUsd).toBe(0);
    expect(cost.outputCostUsd).toBe(0);
    expect(cost.totalCostUsd).toBe(0);
  });

  it('calculates proportional costs for large 32K context windows', () => {
    // mock-standard: $0.80/1M in, $2.40/1M out
    const cost = CostEngine.calculateCost('mock-standard', 30000, 2000);

    expect(cost.inputCostUsd).toBeCloseTo(0.024, 5);
    expect(cost.outputCostUsd).toBeCloseTo(0.0048, 5);
    expect(cost.totalCostUsd).toBeCloseTo(0.0288, 5);
  });
});
