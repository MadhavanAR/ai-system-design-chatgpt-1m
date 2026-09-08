import { FastifyPluginAsync } from 'fastify';
import { circuitBreakers } from '../application/resilience/circuit-breaker.js';
import { modelRouter } from '../application/routing/model-router.js';
import { redis } from '../redis/index.js';
import { z } from 'zod';

const simulateSchema = z.object({
  action: z.enum([
    'trip_circuit',
    'reset_circuits',
    'enable_model_error',
    'disable_model_error',
    'enable_model_timeout',
    'disable_model_timeout',
    'enable_partial_error',
    'disable_partial_error',
    'flush_cache',
  ]),
  targetModel: z.string().optional().default('mock-fast'),
});

export const simulateRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/simulate-failure', async (request, reply) => {
    const parse = simulateSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid simulation payload' });
    }

    const { action, targetModel } = parse.data;
    const mockProvider = modelRouter.getMockProvider();

    switch (action) {
      case 'trip_circuit': {
        const cb = circuitBreakers[targetModel] || circuitBreakers['mock-fast'];
        cb.forceOpen();
        return reply.send({
          success: true,
          message: `[LOCAL DEMO] Circuit breaker for [${targetModel}] manually forced to OPEN state.`,
          circuitState: cb.getState(),
        });
      }

      case 'reset_circuits': {
        Object.values(circuitBreakers).forEach((cb) => cb.reset());
        mockProvider.forceError = false;
        mockProvider.forceTimeout = false;
        mockProvider.forcePartialError = false;
        return reply.send({
          success: true,
          message: '[LOCAL DEMO] All circuit breakers and fault injection flags restored to normal.',
        });
      }

      case 'enable_model_error': {
        mockProvider.forceError = true;
        return reply.send({
          success: true,
          message: '[LOCAL DEMO] Injected 503 Provider Unavailable on Mock LLM.',
        });
      }

      case 'disable_model_error': {
        mockProvider.forceError = false;
        return reply.send({
          success: true,
          message: '[LOCAL DEMO] Fault injection disabled.',
        });
      }

      case 'enable_model_timeout': {
        mockProvider.forceTimeout = true;
        return reply.send({
          success: true,
          message: '[LOCAL DEMO] Injected 30s upstream timeout.',
        });
      }

      case 'disable_model_timeout': {
        mockProvider.forceTimeout = false;
        return reply.send({
          success: true,
          message: '[LOCAL DEMO] Upstream timeouts disabled.',
        });
      }

      case 'enable_partial_error': {
        mockProvider.forcePartialError = true;
        return reply.send({
          success: true,
          message: '[LOCAL DEMO] Injected mid-stream connection drop after partial token generation.',
        });
      }

      case 'disable_partial_error': {
        mockProvider.forcePartialError = false;
        return reply.send({
          success: true,
          message: '[LOCAL DEMO] Partial errors disabled.',
        });
      }

      case 'flush_cache': {
        await redis.flushAll();
        return reply.send({
          success: true,
          message: '[LOCAL DEMO] Redis cache and rate limiter counters flushed.',
        });
      }

      default:
        return reply.status(400).send({ error: 'Unknown simulation action' });
    }
  });
};
