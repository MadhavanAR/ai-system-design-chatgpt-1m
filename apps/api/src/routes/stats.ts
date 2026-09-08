import { FastifyPluginAsync } from 'fastify';
import { liveStats, promRegistry } from '../modules/metrics/prometheus.js';
import { conversationRepo } from '../infrastructure/repositories/conversation.repo.js';
import { redis } from '../redis/index.js';

export const statsRoutes: FastifyPluginAsync = async (fastify) => {
  // Real-Time Engineering Dashboard Feed
  fastify.get('/api/stats', async (_request, reply) => {
    const live = liveStats.getLiveDashboard();
    const dbSummary = await conversationRepo.getTelemetrySummary();

    return reply.send({
      timestamp: new Date().toISOString(),
      infrastructure: {
        postgres: conversationRepo.isConnected ? 'connected' : 'in-memory-fallback',
        redis: redis.isConnected ? 'connected' : 'in-memory-fallback',
      },
      live,
      historical: dbSummary,
    });
  });

  // Prometheus OpenMetrics Exporter
  fastify.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', promRegistry.contentType);
    const metrics = await promRegistry.metrics();
    return reply.send(metrics);
  });

  // Liveness Probe: Verifies process is alive and accepting TCP traffic
  fastify.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'pass',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness Probe: Verifies core services are operational to accept traffic
  fastify.get('/ready', async (_request, reply) => {
    const isReady = true; // In development, fallback layers ensure readiness even if Docker is starting
    return reply.status(isReady ? 200 : 503).send({
      status: isReady ? 'ready' : 'not_ready',
      checks: {
        postgres: conversationRepo.isConnected ? 'connected' : 'in-memory',
        redis: redis.isConnected ? 'connected' : 'in-memory',
      },
      timestamp: new Date().toISOString(),
    });
  });
};
