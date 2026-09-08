import { ModelDecision, ModelTier } from '../../domain/types.js';
import { circuitBreakers, CircuitBreaker } from '../resilience/circuit-breaker.js';
import { MODEL_CATALOG } from '../../config/index.js';
import { LLMProvider } from '../../infrastructure/inference/types.js';
import { MockLLMProvider } from '../../infrastructure/inference/mock-provider.js';
import { OpenAICompatibleProvider } from '../../infrastructure/inference/openai-provider.js';
import { config } from '../../config/index.js';
import { CostEngine } from '../cost/pricing.js';

export class ModelRouter {
  private mockProvider = new MockLLMProvider();
  private openAIProvider = new OpenAICompatibleProvider();

  getMockProvider(): MockLLMProvider {
    return this.mockProvider;
  }

  /**
   * Explainable model routing policy based on prompt complexity, context depth, and circuit health.
   */
  resolveRoute(
    requestedModelId: string = 'mock-fast',
    queryText: string = '',
    contextTokens: number = 0
  ): { decision: ModelDecision; provider: LLMProvider } {
    let targetModelId = requestedModelId;
    let targetTier: ModelTier = 'fast';
    let rationale = '';

    // 1. Policy Decision
    if (targetModelId === 'auto') {
      if (this.requiresDeepReasoning(queryText)) {
        targetModelId = 'mock-reasoning';
        targetTier = 'reasoning';
        rationale = 'Query classified as requiring formal multi-step reasoning or mathematical proof.';
      } else if (contextTokens > 4000) {
        targetModelId = 'mock-standard';
        targetTier = 'standard';
        rationale = `Context size (${contextTokens} tokens) exceeds fast tier budget. Standard 70B tier selected.`;
      } else {
        targetModelId = 'mock-fast';
        targetTier = 'fast';
        rationale = 'Standard lightweight conversational query. Fast 8B tier selected for optimal TTFT and cost.';
      }
    } else {
      const catalogEntry = MODEL_CATALOG[targetModelId];
      targetTier = catalogEntry?.tier || 'fast';
      rationale = `User explicitly selected model [${targetModelId}] (${targetTier} tier).`;
    }

    // 2. Health & Circuit Breaker Evaluation
    const cb: CircuitBreaker = circuitBreakers[targetModelId] || circuitBreakers['mock-fast'];
    let selectedModelId = targetModelId;
    let isFallback = false;
    const fallbackCandidates = this.getFallbackCandidates(targetModelId);

    if (cb.isOpen()) {
      isFallback = true;
      const healthyFallback = fallbackCandidates.find((mId) => {
        const candidateCb = circuitBreakers[mId];
        return !candidateCb || !candidateCb.isOpen();
      }) || 'mock-fast';

      selectedModelId = healthyFallback;
      rationale = `Circuit breaker for [${targetModelId}] is OPEN. Resiliently rerouted to fallback [${healthyFallback}].`;
    }

    // 3. Estimate Pre-Inference Cost
    const costEstimate = CostEngine.calculateCost(selectedModelId, contextTokens, 350);

    const isLiveOpenAI = selectedModelId.startsWith('gpt-') && !!config.OPENAI_API_KEY;
    const provider: LLMProvider = isLiveOpenAI ? this.openAIProvider : this.mockProvider;

    const decision: ModelDecision = {
      requestedModelId,
      selectedModelId,
      tier: targetTier,
      reason: rationale,
      circuitState: cb.getState(),
      isFallback,
      fallbackCandidates,
      estimatedInputTokens: contextTokens,
      estimatedCostUsd: costEstimate.totalCostUsd,
    };

    return { decision, provider };
  }

  private getFallbackCandidates(failedModelId: string): string[] {
    if (failedModelId === 'mock-reasoning' || failedModelId === 'gpt-4o') {
      return ['mock-standard', 'mock-fast'];
    }
    if (failedModelId === 'mock-standard' || failedModelId === 'gpt-4o-mini') {
      return ['mock-fast'];
    }
    return ['mock-fast'];
  }

  private requiresDeepReasoning(text: string): boolean {
    const triggers = ['prove', 'derive', 'formal verification', 'deadlock', 'step by step mathematical', 'theorem'];
    const lower = text.toLowerCase();
    return triggers.some((t) => lower.includes(t));
  }
}

export const modelRouter = new ModelRouter();
