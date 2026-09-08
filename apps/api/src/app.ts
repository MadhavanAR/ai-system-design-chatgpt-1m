import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { conversationRepo } from './infrastructure/repositories/conversation.repo.js';
import { redis } from './redis/index.js';
import { chatRoutes } from './routes/chat.js';
import { conversationRoutes } from './routes/conversations.js';
import { modelRoutes } from './routes/models.js';
import { statsRoutes } from './routes/stats.js';
import { simulateRoutes } from './routes/simulate.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // Managed through our structured logger
    disableRequestLogging: true,
  });

  // Security & Utility Plugins
  await app.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(sensible);

  // Initialize infrastructure repositories & cache
  await conversationRepo.init();
  await redis.init();

  // Register API Routes
  await app.register(chatRoutes);
  await app.register(conversationRoutes);
  await app.register(modelRoutes);
  await app.register(statsRoutes);
  await app.register(simulateRoutes);

  return app;
}
