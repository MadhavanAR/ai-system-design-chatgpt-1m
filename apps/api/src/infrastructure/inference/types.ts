import { ContextMessage } from '../../application/context/context-manager.js';
import { StreamEvent } from '../../domain/types.js';

export interface InferenceRequest {
  requestId: string;
  conversationId?: string;
  userId: string;
  modelId: string;
  messages: ContextMessage[];
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
}

export interface InferenceResult {
  fullText: string;
  inputTokens: number;
  outputTokens: number;
  ttftMs: number;
  totalDurationMs: number;
  tokensPerSec: number;
}

export interface LLMProvider {
  name: string;
  streamCompletion(
    request: InferenceRequest,
    onEvent: (event: StreamEvent) => void
  ): Promise<InferenceResult>;
}
