import { describe, it, expect } from 'vitest';
import { ContextManager } from '../src/application/context/context-manager.js';
import { Message } from '../src/domain/types.js';

describe('ContextManager Token Budgeting Requirements', () => {
  it('estimates token count using character heuristic without external tokenizer', () => {
    const text = 'Explain how distributed systems handle traffic spikes and rate limiting.';
    const tokens = ContextManager.estimateTokens(text);
    expect(tokens).toBeGreaterThan(10);
    expect(tokens).toBeLessThan(30);
  });

  it('preserves system instructions when trimming conversational history', () => {
    const history: Message[] = Array.from({ length: 40 }, (_, i) => ({
      id: `msg_${i}`,
      conversationId: 'c1',
      userId: 'u1',
      role: (i % 2 === 0 ? 'user' : 'assistant') as any,
      content: `This is historical turn ${i} with substantial token context to fill up budget.`,
      tokenCount: 20,
      createdAt: new Date(Date.now() - (40 - i) * 1000),
    }));

    const result = ContextManager.prepareContext(
      'mock-fast',
      history,
      'What is our failover policy?',
      'You are a high-reliability distributed systems architect.',
      250 // Tight token budget
    );

    // System instruction must be preserved as message 0
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toBe('You are a high-reliability distributed systems architect.');
    // Latest query must be the final message
    expect(result.messages[result.messages.length - 1].content).toBe('What is our failover policy?');
    // Stale turns truncated
    expect(result.truncatedMessageCount).toBeGreaterThan(20);
    expect(result.prefixCacheKey).toBeDefined();
  });

  it('calculates deterministic prefix cache key for identical conversation histories', () => {
    const history: Message[] = [
      {
        id: '1',
        conversationId: 'c1',
        userId: 'u1',
        role: 'user',
        content: 'Hello',
        tokenCount: 2,
        createdAt: new Date(),
      },
    ];

    const res1 = ContextManager.prepareContext('mock-fast', history, 'Query A', 'System Prompt A');
    const res2 = ContextManager.prepareContext('mock-fast', history, 'Query B', 'System Prompt A');

    // Identical prefix (system prompt + first historical turn) produces matching prefix cache key
    expect(res1.prefixCacheKey).toBe(res2.prefixCacheKey);
  });
});
