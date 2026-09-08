import { Message } from '../../domain/types.js';
import { CostEngine } from '../cost/pricing.js';

export interface ContextMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PreparedContext {
  messages: ContextMessage[];
  totalEstimatedTokens: number;
  truncatedMessageCount: number;
  prefixCacheKey: string;
}

export class ContextManager {
  /**
   * Character-based heuristic for token estimation (~3.8 chars per token for English & code).
   */
  static estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / 3.8));
  }

  /**
   * Assembles the optimized conversation context adhering to token budgets.
   * Preserves system prompt, sliding window of recent history, and reserves 25% output headroom.
   */
  static prepareContext(
    modelId: string,
    history: Message[],
    newPrompt: string,
    systemPrompt?: string,
    maxBudgetTokens?: number
  ): PreparedContext {
    const pricing = CostEngine.getPricing(modelId);
    const contextLimit = maxBudgetTokens || Math.min(pricing.maxContextTokens, 8192);

    // Reserve 25% of context window for generation output headroom
    const maxInputBudget = Math.floor(contextLimit * 0.75);

    const defaultSystem =
      systemPrompt ||
      'You are a high-performance, senior AI assistant designed to provide direct, accurate, and deeply technical architectural insights.';

    const systemTokens = this.estimateTokens(defaultSystem);
    const newPromptTokens = this.estimateTokens(newPrompt);

    let currentTokens = systemTokens + newPromptTokens;
    const selectedHistory: ContextMessage[] = [];
    let truncatedCount = 0;

    // Traverse history from newest to oldest
    const reversedHistory = [...history].reverse();

    for (const msg of reversedHistory) {
      const msgTokens = msg.tokenCount || this.estimateTokens(msg.content);

      if (currentTokens + msgTokens <= maxInputBudget) {
        selectedHistory.unshift({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        });
        currentTokens += msgTokens;
      } else {
        truncatedCount++;
      }
    }

    const messages: ContextMessage[] = [
      { role: 'system', content: defaultSystem },
      ...selectedHistory,
      { role: 'user', content: newPrompt },
    ];

    // Deterministic prefix hash key
    const prefixString = `${defaultSystem}::${selectedHistory.slice(0, 2).map((m) => m.content).join('::')}`;
    const prefixCacheKey = `prefix_${Buffer.from(prefixString).toString('base64').substring(0, 32)}`;

    return {
      messages,
      totalEstimatedTokens: currentTokens,
      truncatedMessageCount: truncatedCount,
      prefixCacheKey,
    };
  }
}
