import { FastifyPluginAsync } from 'fastify';
import { MODEL_CATALOG } from '../config/index.js';
import { circuitBreakers } from '../application/resilience/circuit-breaker.js';

export const modelRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/models', async (_request, reply) => {
    const models = Object.values(MODEL_CATALOG).map((m) => {
      const cb = circuitBreakers[m.modelId];
      const state = cb ? cb.getState() : 'CLOSED';
      return {
        ...m,
        status: state,
        isAvailable: state !== 'OPEN',
      };
    });

    return reply.send({ models });
  });
};
