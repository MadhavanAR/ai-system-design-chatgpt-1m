import { LLMProvider, InferenceRequest, InferenceResult } from './types.js';
import { StreamEvent } from '../../domain/types.js';
import { CostEngine } from '../../application/cost/pricing.js';
import { ContextManager } from '../../application/context/context-manager.js';
import { ModelTimeoutError, ModelUnavailableError } from '../../domain/errors.js';

export class MockLLMProvider implements LLMProvider {
  public name = 'MockLLMProvider';
  public forceError = false;
  public forceTimeout = false;
  public forcePartialError = false;

  async streamCompletion(
    request: InferenceRequest,
    onEvent: (event: StreamEvent) => void
  ): Promise<InferenceResult> {
    const startTime = Date.now();
    const pricing = CostEngine.getPricing(request.modelId);

    // 1. Check early failure injection (Before first token)
    if (this.forceError) {
      throw new ModelUnavailableError(`Simulated upstream 503 from provider on [${request.modelId}]`);
    }

    if (this.forceTimeout) {
      // Simulate timeout exceeding typical 30s threshold
      await new Promise((resolve) => setTimeout(resolve, 32000));
      throw new ModelTimeoutError(`Upstream model generation timed out after 30000ms`);
    }

    // 2. Calculate prompt token volume
    const promptText = request.messages.map((m) => m.content).join('\n');
    const inputTokens = ContextManager.estimateTokens(promptText);

    // 3. Simulate TTFT with slight natural jitter
    const baseTtft = pricing.targetTtftMs || 150;
    const ttftJitter = baseTtft * (0.9 + Math.random() * 0.2);
    await new Promise((resolve) => setTimeout(resolve, ttftJitter));

    if (request.abortSignal?.aborted) {
      throw new Error('Inference aborted by client disconnect');
    }

    const firstTokenTime = Date.now();
    const ttftMs = firstTokenTime - startTime;

    // 4. Generate structured technical response
    const lastUserQuery = [...request.messages].reverse().find((m) => m.role === 'user')?.content || '';
    const template = this.buildResponseText(lastUserQuery, pricing.tier);

    // 5. Stream reasoning tokens if in reasoning tier
    if (pricing.tier === 'reasoning') {
      const reasoningChunks = [
        'Evaluating architectural constraints and distributed state requirements...\n',
        'Analyzing capacity boundaries and fault-isolation domains...\n\n',
      ];
      for (const rChunk of reasoningChunks) {
        if (request.abortSignal?.aborted) break;
        onEvent({
          type: 'reasoning',
          content: rChunk,
          modelId: request.modelId,
        });
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
    }

    // 6. Token generation loop
    const words = template.split(/(\s+)/);
    let accumulatedText = '';
    let tokensEmitted = 0;
    const tokenIntervalMs = Math.max(10, Math.floor(1000 / (pricing.targetTokensPerSec || 60)));

    for (let i = 0; i < words.length; i++) {
      if (request.abortSignal?.aborted) {
        throw new Error('Inference aborted by client disconnect');
      }

      // Simulate partial generation error mid-stream if configured
      if (this.forcePartialError && i > words.length / 2) {
        throw new ModelUnavailableError('Upstream connection dropped mid-stream after partial output');
      }

      const chunk = words[i];
      if (!chunk) continue;

      accumulatedText += chunk;
      tokensEmitted += ContextManager.estimateTokens(chunk);

      onEvent({
        type: 'token',
        content: chunk,
        tokensGenerated: tokensEmitted,
        modelId: request.modelId,
      });

      if (chunk.trim().length > 0) {
        await new Promise((resolve) => setTimeout(resolve, tokenIntervalMs));
      }
    }

    const endTime = Date.now();
    const totalDurationMs = Math.max(1, endTime - startTime);
    const outputTokens = ContextManager.estimateTokens(accumulatedText);
    const tokensPerSec = Number(((outputTokens / (totalDurationMs / 1000))).toFixed(2));
    const cost = CostEngine.calculateCost(request.modelId, inputTokens, outputTokens);

    onEvent({
      type: 'meta',
      ttftMs,
      totalDurationMs,
      tokensGenerated: outputTokens,
      tokensPerSec,
      inputTokens,
      outputTokens,
      estimatedCostUsd: cost.totalCostUsd,
      modelId: request.modelId,
    });

    onEvent({ type: 'done' });

    return {
      fullText: accumulatedText,
      inputTokens,
      outputTokens,
      ttftMs,
      totalDurationMs,
      tokensPerSec,
    };
  }

  private buildResponseText(query: string, tier: string): string {
    const q = query.toLowerCase();

    if (q.includes('spike') || q.includes('traffic') || q.includes('rate limit')) {
      return `### Distributed Rate Limiting & Surge Protection

Under high concurrent load, preventing cascading failure requires multi-tier defense:

1. **Edge Admission**: Clustered Redis sliding-window token buckets immediately reject excess traffic with HTTP 429.
2. **Circuit Breaking**: Dynamic state machines transition from \`CLOSED\` to \`OPEN\` on upstream model timeouts, diverting requests to healthy fallback models.
3. **Full Jitter Backoff**:
\`\`\`typescript
const delay = Math.floor(Math.random() * Math.min(maxDelay, baseDelay * Math.pow(2, attempt)));
\`\`\`
4. **Idempotency**: Requests carry deduplication keys to prevent duplicate billing during client retries.`;
    }

    return `### Architectural Response (${tier.toUpperCase()} Tier)

Regarding: **"${query.slice(0, 80)}"**

In our reference architecture for 1M users:
- **Ingress**: Authenticated and rate-checked at the API Gateway via Redis token buckets.
- **Context**: Budgeted via sliding window token management.
- **Inference**: Streamed via Server-Sent Events with continuous batching and prefix attention caching.
- **Observability**: Real-time Prometheus metrics and cost tracking recorded on stream completion.`;
  }
}
