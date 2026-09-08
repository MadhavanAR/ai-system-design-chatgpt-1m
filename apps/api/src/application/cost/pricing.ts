import { MODEL_CATALOG } from '../../config/index.js';
import { ModelPricing } from '../../domain/types.js';

export interface CostCalculationResult {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
}

export class CostEngine {
  static getPricing(modelId: string): ModelPricing {
    return (
      MODEL_CATALOG[modelId] || {
        modelId,
        name: 'Custom Model',
        tier: 'standard',
        inputCostPer1M: 1.0,
        outputCostPer1M: 3.0,
        maxContextTokens: 16384,
        targetTtftMs: 300,
        targetTokensPerSec: 50,
      }
    );
  }

  static calculateCost(
    modelId: string,
    inputTokens: number,
    outputTokens: number
  ): CostCalculationResult {
    const pricing = this.getPricing(modelId);

    const inputCostUsd = (inputTokens / 1_000_000) * pricing.inputCostPer1M;
    const outputCostUsd = (outputTokens / 1_000_000) * pricing.outputCostPer1M;
    const totalCostUsd = inputCostUsd + outputCostUsd;

    return {
      modelId,
      inputTokens,
      outputTokens,
      inputCostUsd: Number(inputCostUsd.toFixed(8)),
      outputCostUsd: Number(outputCostUsd.toFixed(8)),
      totalCostUsd: Number(totalCostUsd.toFixed(8)),
    };
  }
}
