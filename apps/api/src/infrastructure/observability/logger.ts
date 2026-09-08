import pino from 'pino';
import { config } from '../../config/index.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: ['req.headers.authorization', 'req.headers["x-api-key"]', 'headers.authorization', 'password', 'apiKey'],
    censor: '[REDACTED]',
  },
  transport:
    config.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});
