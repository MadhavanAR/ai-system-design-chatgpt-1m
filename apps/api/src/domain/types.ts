export type ModelTier = 'fast' | 'standard' | 'reasoning';

export type Role = 'user' | 'assistant' | 'system';

export interface User {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  tier: 'free' | 'pro' | 'enterprise';
  rpmLimit: number;
  tpmLimit: number;
  maxConcurrentRequests: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  id: string;
  userId: string;
  tenantId: string;
  title: string;
  modelId: string;
  systemPrompt?: string;
  contextTokenCount: number;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  userId: string;
  role: Role;
  content: string;
  tokenCount: number;
  modelId?: string;
  ttftMs?: number;
  totalDurationMs?: number;
  createdAt: Date;
}

export interface RequestContext {
  requestId: string;
  userId: string;
  tenantId: string;
  conversationId?: string;
  idempotencyKey?: string;
  clientIp?: string;
  startTime: number;
}

export interface ModelDecision {
  requestedModelId: string;
  selectedModelId: string;
  tier: ModelTier;
  reason: string;
  circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  isFallback: boolean;
  fallbackCandidates: string[];
  estimatedInputTokens: number;
  estimatedCostUsd: number;
}

export interface ModelPricing {
  modelId: string;
  name: string;
  tier: ModelTier;
  inputCostPer1M: number;  // in USD
  outputCostPer1M: number; // in USD
  maxContextTokens: number;
  targetTtftMs: number;
  targetTokensPerSec: number;
}

export interface StreamEvent {
  type: 'start' | 'token' | 'reasoning' | 'meta' | 'error' | 'done';
  requestId?: string;
  conversationId?: string;
  content?: string;
  modelId?: string;
  tokensGenerated?: number;
  ttftMs?: number;
  totalDurationMs?: number;
  tokensPerSec?: number;
  estimatedCostUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
  fallbackActivated?: boolean;
  fallbackReason?: string;
}

export interface ModelRequestRecord {
  requestId: string;
  userId: string;
  tenantId: string;
  conversationId?: string;
  modelId: string;
  provider: string;
  status: 'success' | 'rate_limited' | 'circuit_open' | 'error' | 'timeout' | 'aborted';
  inputTokens: number;
  outputTokens: number;
  ttftMs?: number;
  totalLatencyMs: number;
  tokensPerSec?: number;
  estimatedCostUsd: number;
  errorMessage?: string;
  createdAt: Date;
}
