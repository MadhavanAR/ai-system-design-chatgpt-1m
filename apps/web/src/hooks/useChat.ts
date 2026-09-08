'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  modelId?: string;
  ttftMs?: number;
  totalDurationMs?: number;
  tokensGenerated?: number;
  tokensPerSec?: number;
  estimatedCostUsd?: number;
  createdAt?: string;
}

export interface ConversationItem {
  id: string;
  title: string;
  model_id: string;
  context_token_count: number;
  created_at: string;
  updated_at: string;
}

export interface ModelItem {
  modelId: string;
  name: string;
  tier: 'simple' | 'standard' | 'reasoning';
  inputCostPer1M: number;
  outputCostPer1M: number;
  avgTtftMs: number;
  targetTokensPerSec: number;
  status: string;
  isAvailable: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function useChat() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('mock-fast');
  const [models, setModels] = useState<ModelItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentMetrics, setCurrentMetrics] = useState<{
    ttftMs?: number;
    tokensPerSec?: number;
    tokensGenerated?: number;
    estimatedCostUsd?: number;
    activeModel?: string;
  } | null>(null);
  const [rateLimitNotice, setRateLimitNotice] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Load available models
  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/models`);
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    }
  }, []);

  // Load user conversations
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/conversations`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  }, []);

  // Switch active conversation
  const selectConversation = useCallback(async (convId: string) => {
    setCurrentConvId(convId);
    setRateLimitNotice(null);
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(
          (data.messages || []).map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            modelId: m.model_id,
            ttftMs: m.ttft_ms,
            totalDurationMs: m.total_duration_ms,
            tokensGenerated: m.token_count,
            createdAt: m.created_at,
          }))
        );
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  }, []);

  // Create fresh conversation
  const startNewChat = useCallback(() => {
    setCurrentConvId(null);
    setMessages([]);
    setCurrentMetrics(null);
    setRateLimitNotice(null);
  }, []);

  // Delete conversation
  const deleteConversation = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await fetch(`${API_BASE}/api/conversations/${id}`, { method: 'DELETE' });
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (currentConvId === id) {
          startNewChat();
        }
      } catch (err) {
        console.error('Failed to delete conversation:', err);
      }
    },
    [currentConvId, startNewChat]
  );

  // Stop current streaming generation
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  }, []);

  // Send message with SSE streaming
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;
      setRateLimitNotice(null);

      const userMsg: ChatMessage = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: text.trim(),
        createdAt: new Date().toISOString(),
      };

      const assistantMsgId = `asst_${Date.now()}`;
      const placeholderAssistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        modelId: selectedModel,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg, placeholderAssistantMsg]);
      setIsStreaming(true);
      setCurrentMetrics({ activeModel: selectedModel, tokensGenerated: 0 });

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch(`${API_BASE}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: currentConvId || undefined,
            message: text.trim(),
            modelId: selectedModel,
          }),
          signal: controller.signal,
        });

        if (response.status === 429) {
          const rateData = await response.json();
          const notice = `Rate limit exceeded (${rateData.reason}). Please wait ${rateData.retryAfterSeconds || 10} seconds.`;
          setRateLimitNotice(notice);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: `⚠️ **Rate Limit Hit**: ${notice}` }
                : m
            )
          );
          setIsStreaming(false);
          return;
        }

        if (!response.ok || !response.body) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantContent = '';
        let assistantReasoning = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const jsonStr = trimmed.substring(6);

            try {
              const event = JSON.parse(jsonStr);

              if (event.type === 'start') {
                if (!currentConvId && event.conversationId) {
                  setCurrentConvId(event.conversationId);
                  fetchConversations();
                }
                setCurrentMetrics((prev) => ({
                  ...prev,
                  activeModel: event.modelId,
                }));
              } else if (event.type === 'token') {
                assistantContent += event.content || '';
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          content: assistantContent,
                          tokensGenerated: event.tokensGenerated,
                          modelId: event.modelId,
                        }
                      : m
                  )
                );
                setCurrentMetrics((prev) => ({
                  ...prev,
                  tokensGenerated: event.tokensGenerated,
                }));
              } else if (event.type === 'reasoning') {
                assistantReasoning += event.content || '';
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, reasoning: assistantReasoning }
                      : m
                  )
                );
              } else if (event.type === 'meta') {
                setCurrentMetrics({
                  ttftMs: event.ttftMs,
                  totalDurationMs: event.totalDurationMs,
                  tokensPerSec: event.tokensPerSec,
                  tokensGenerated: event.tokensGenerated,
                  estimatedCostUsd: event.estimatedCostUsd,
                  activeModel: event.modelId,
                } as any);

                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          ttftMs: event.ttftMs,
                          totalDurationMs: event.totalDurationMs,
                          tokensPerSec: event.tokensPerSec,
                          estimatedCostUsd: event.estimatedCostUsd,
                          modelId: event.modelId,
                        }
                      : m
                  )
                );
              } else if (event.type === 'error') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: `🚨 **Inference Error**: ${event.error}` }
                      : m
                  )
                );
              }
            } catch {
              // Ignore partial JSON
            }
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Streaming error:', err);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: `🚨 **Request Failed**: ${err.message}` }
                : m
            )
          );
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
        fetchConversations();
        fetchModels();
      }
    },
    [currentConvId, isStreaming, selectedModel, fetchConversations, fetchModels]
  );

  // Retry last turn
  const retryLast = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      sendMessage(lastUser.content);
    }
  }, [messages, sendMessage]);

  useEffect(() => {
    fetchModels();
    fetchConversations();
  }, [fetchModels, fetchConversations]);

  return {
    conversations,
    currentConvId,
    messages,
    selectedModel,
    setSelectedModel,
    models,
    isStreaming,
    currentMetrics,
    rateLimitNotice,
    selectConversation,
    startNewChat,
    deleteConversation,
    sendMessage,
    stopGeneration,
    retryLast,
    refreshModels: fetchModels,
  };
}
