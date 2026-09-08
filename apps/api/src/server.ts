import { buildApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './infrastructure/observability/logger.js';

async function start() {
  try {
    const app = await buildApp();
    const address = await app.listen({
      port: config.PORT,
      host: '0.0.0.0',
    });

    logger.info({
      event: 'server_started',
      address,
      port: config.PORT,
      env: config.NODE_ENV,
      defaultProvider: config.DEFAULT_PROVIDER,
      endpoints: {
        health: `${config.API_BASE_URL}/health`,
        readiness: `${config.API_BASE_URL}/ready`,
        stats: `${config.API_BASE_URL}/api/stats`,
        metrics: `${config.API_BASE_URL}/metrics`,
      },
    }, `AI System Design: ChatGPT Gateway listening at ${address}`);
  } catch (err: any) {
    logger.fatal({ err }, 'Fatal error starting API server');
    process.exit(1);
  }
}

start();
