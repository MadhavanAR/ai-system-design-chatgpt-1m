import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { conversationRepo } from '../infrastructure/repositories/conversation.repo.js';
import { ContextManager } from '../application/context/context-manager.js';
import { RateLimiter } from '../modules/ratelimit/rate-limiter.js';
import { modelRouter } from '../application/routing/model-router.js';
import { circuitBreakers } from '../application/resilience/circuit-breaker.js';
import { RetryPolicy } from '../application/resilience/retry.js';
import { CostEngine } from '../application/cost/pricing.js';
import { logger } from '../infrastructure/observability/logger.js';
import {
  liveStats,
  httpRequestCounter,
  requestDurationHistogram,
  ttftHistogram,
  tokenCounter,
  rateLimitCounter,
} from '../modules/metrics/prometheus.js';

const chatRequestSchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1, 'Message cannot be empty'),
  modelId: z.string().optional().default('mock-fast'),
  userId: z.string().optional().default('user_demo_1'),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  idempotencyKey: z.string().optional(),
});

export const chatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/chat', async (request, reply) => {
    const startTime = Date.now();
    const parseResult = chatRequestSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: parseResult.error.flatten(),
      });
    }

    const {
      conversationId: rawConvId,
      message,
      modelId: requestedModelId,
      userId,
      systemPrompt,
      temperature,
      idempotencyKey,
    } = parseResult.data;

    // 1. Idempotency Check
    if (idempotencyKey) {
      const isNew = await RetryPolicy.acquireIdempotencyLease(idempotencyKey, 60);
      if (!isNew) {
        return reply.status(409).send({
          error: 'Duplicate request detected with active idempotency key.',
          code: 'IDEMPOTENCY_CONFLICT',
        });
      }
    }

    // 2. Resolve or Initialize Conversation Thread
    let convId = rawConvId;
    if (!convId) {
      const newConv = await conversationRepo.createConversation({
        id: `conv_${uuidv4().substring(0, 12)}`,
        userId,
        title: message.slice(0, 40) || 'New Conversation',
        modelId: requestedModelId,
        systemPrompt,
      });
      convId = newConv.id;
    }

    // 3. Assemble Sliding Window Context
    const history = await conversationRepo.getMessages(convId);
    const preparedContext = ContextManager.prepareContext(
      requestedModelId,
      history,
      message,
      systemPrompt
    );

    // 4. Rate Limiting Check (RPM, TPM, Concurrency)
    const rateCheck = await RateLimiter.checkAndAcquire(
      userId,
      preparedContext.totalEstimatedTokens
    );

    if (!rateCheck.allowed) {
      rateLimitCounter.inc({ reason: rateCheck.reason || 'limit_exceeded' });
      liveStats.recordCompletion({
        durationMs: Date.now() - startTime,
        inputTokens: preparedContext.totalEstimatedTokens,
        outputTokens: 0,
        costUsd: 0,
        isRateLimit: true,
      });

      return reply.status(429).send({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        reason: rateCheck.reason,
        retryAfterSeconds: rateCheck.retryAfterSeconds,
        quotas: {
          currentRpm: rateCheck.currentRpm,
          maxRpm: rateCheck.maxRpm,
          activeConcurrent: rateCheck.activeConcurrent,
          maxConcurrent: rateCheck.maxConcurrent,
        },
      });
    }

    // 5. Model Routing & Explainable Decision
    const { decision, provider } = modelRouter.resolveRoute(
      requestedModelId,
      message,
      preparedContext.totalEstimatedTokens
    );
    const effectiveModelId = decision.selectedModelId;
    const cb = circuitBreakers[effectiveModelId] || circuitBreakers['mock-fast'];

    // Save User Turn
    const userMsgId = `msg_${uuidv4().substring(0, 12)}`;
    await conversationRepo.saveMessage({
      id: userMsgId,
      conversationId: convId,
      userId,
      role: 'user',
      content: message,
      tokenCount: ContextManager.estimateTokens(message),
      createdAt: new Date(),
    });

    // 6. Setup Server-Sent Events (SSE) Stream
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Conversation-Id': convId,
      'X-Selected-Model': effectiveModelId,
      'X-Model-Tier': decision.tier,
    });

    const requestId = `req_${uuidv4().substring(0, 12)}`;
    liveStats.recordStreamStart();

    // Emit initial stream start event
    reply.raw.write(
      `data: ${JSON.stringify({
        type: 'start',
        requestId,
        conversationId: convId,
        modelId: effectiveModelId,
        fallbackActivated: decision.isFallback,
        fallbackReason: decision.reason,
      })}\n\n`
    );

    const abortController = new AbortController();
    request.raw.on('close', () => {
      abortController.abort();
    });

    let tokensEmittedCount = 0;

    try {
      // 7. Execute Streaming Inference
      const result = await provider.streamCompletion(
        {
          requestId,
          conversationId: convId,
          userId,
          modelId: effectiveModelId,
          messages: preparedContext.messages,
          temperature,
          abortSignal: abortController.signal,
        },
        (event) => {
          if (event.type === 'token') {
            tokensEmittedCount++;
          }
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      );

      // Record Success on Circuit Breaker
      cb.recordSuccess();

      // 8. Persist Assistant Message
      const assistantMsgId = `msg_${uuidv4().substring(0, 12)}`;
      await conversationRepo.saveMessage({
        id: assistantMsgId,
        conversationId: convId,
        userId,
        role: 'assistant',
        content: result.fullText,
        tokenCount: result.outputTokens,
        modelId: effectiveModelId,
        ttftMs: result.ttftMs,
        totalDurationMs: result.totalDurationMs,
        createdAt: new Date(),
      });

      // 9. Calculate Financial Cost & Persist Telemetry
      const cost = CostEngine.calculateCost(
        effectiveModelId,
        result.inputTokens,
        result.outputTokens
      );

      await conversationRepo.recordModelRequest({
        requestId,
        userId,
        tenantId: 'default',
        conversationId: convId,
        modelId: effectiveModelId,
        provider: provider.name,
        status: 'success',
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        ttftMs: result.ttftMs,
        totalLatencyMs: result.totalDurationMs,
        tokensPerSec: result.tokensPerSec,
        estimatedCostUsd: cost.totalCostUsd,
        createdAt: new Date(),
      });

      // Update Prometheus Metrics
      httpRequestCounter.inc({ method: 'POST', route: '/api/chat', status: '200', model_id: effectiveModelId });
      requestDurationHistogram.observe({ route: '/api/chat', model_id: effectiveModelId }, result.totalDurationMs / 1000);
      ttftHistogram.observe({ model_id: effectiveModelId }, result.ttftMs / 1000);
      tokenCounter.inc({ type: 'input', model_id: effectiveModelId }, result.inputTokens);
      tokenCounter.inc({ type: 'output', model_id: effectiveModelId }, result.outputTokens);

      liveStats.recordCompletion({
        durationMs: result.totalDurationMs,
        ttftMs: result.ttftMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: cost.totalCostUsd,
      });

      logger.info({
        event: 'chat_stream_completed',
        requestId,
        conversationId: convId,
        modelId: effectiveModelId,
        durationMs: result.totalDurationMs,
        ttftMs: result.ttftMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: cost.totalCostUsd,
      });
    } catch (err: any) {
      const isAbort = abortController.signal.aborted;
      const durationMs = Date.now() - startTime;

      if (!isAbort) {
        cb.recordFailure();
        logger.error({
          event: 'chat_stream_error',
          requestId,
          modelId: effectiveModelId,
          tokensEmittedBeforeFailure: tokensEmittedCount,
          error: err.message,
        });

        reply.raw.write(
          `data: ${JSON.stringify({
            type: 'error',
            error: err.message || 'Inference execution failed',
            partialOutputEmitted: tokensEmittedCount > 0,
          })}\n\n`
        );

        httpRequestCounter.inc({ method: 'POST', route: '/api/chat', status: '500', model_id: effectiveModelId });
        liveStats.recordCompletion({
          durationMs,
          inputTokens: preparedContext.totalEstimatedTokens,
          outputTokens: 0,
          costUsd: 0,
          isError: true,
        });

        await conversationRepo.recordModelRequest({
          requestId,
          userId,
          tenantId: 'default',
          conversationId: convId,
          modelId: effectiveModelId,
          provider: provider.name,
          status: 'error',
          inputTokens: preparedContext.totalEstimatedTokens,
          outputTokens: 0,
          totalLatencyMs: durationMs,
          estimatedCostUsd: 0,
          errorMessage: err.message,
          createdAt: new Date(),
        });
      } else {
        logger.info({
          event: 'chat_stream_aborted',
          requestId,
          conversationId: convId,
          durationMs,
        });
      }
    } finally {
      liveStats.recordStreamEnd();
      await RateLimiter.releaseConcurrency(userId);
      reply.raw.end();
    }
  });
};
