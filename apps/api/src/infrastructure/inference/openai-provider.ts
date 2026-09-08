import { LLMProvider, InferenceRequest, InferenceResult } from './types.js';
import { StreamEvent } from '../../domain/types.js';
import { config } from '../../config/index.js';
import { CostEngine } from '../../application/cost/pricing.js';
import { ContextManager } from '../../application/context/context-manager.js';
import { ModelUnavailableError } from '../../domain/errors.js';

export class OpenAICompatibleProvider implements LLMProvider {
  public name = 'OpenAICompatibleProvider';

  async streamCompletion(
    request: InferenceRequest,
    onEvent: (event: StreamEvent) => void
  ): Promise<InferenceResult> {
    const apiKey = config.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ModelUnavailableError('OPENAI_API_KEY is not configured in server environment');
    }

    const startTime = Date.now();
    let firstTokenTime: number | null = null;
    let accumulatedText = '';
    let tokensEmitted = 0;

    const response = await fetch(`${config.OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.modelId,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        stream: true,
      }),
      signal: request.abortSignal,
    });

    if (!response.ok || !response.body) {
      const errText = await response.text();
      throw new ModelUnavailableError(`Upstream provider error (${response.status}): ${errText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        if (trimmed === 'data: [DONE]') continue;

        try {
          const json = JSON.parse(trimmed.substring(6));
          const delta = json.choices?.[0]?.delta?.content || '';

          if (delta) {
            if (!firstTokenTime) {
              firstTokenTime = Date.now();
            }

            accumulatedText += delta;
            tokensEmitted += ContextManager.estimateTokens(delta);

            onEvent({
              type: 'token',
              content: delta,
              tokensGenerated: tokensEmitted,
              modelId: request.modelId,
            });
          }
        } catch {
          // Ignore incomplete JSON stream chunks
        }
      }
    }

    const endTime = Date.now();
    const totalDurationMs = Math.max(1, endTime - startTime);
    const ttftMs = firstTokenTime ? firstTokenTime - startTime : totalDurationMs;
    const inputTokens = ContextManager.estimateTokens(
      request.messages.map((m) => m.content).join('\n')
    );
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
}
