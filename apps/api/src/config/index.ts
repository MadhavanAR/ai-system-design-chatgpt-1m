import dotenv from 'dotenv';
import { z } from 'zod';
import { ModelPricing } from '../domain/types.js';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_BASE_URL: z.string().default('http://localhost:4000'),

  // PostgreSQL Configuration
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/aichat_db'),
  PGHOST: z.string().default('localhost'),
  PGPORT: z.coerce.number().default(5432),
  PGUSER: z.string().default('postgres'),
  PGPASSWORD: z.string().default('postgres'),
  PGDATABASE: z.string().default('aichat_db'),
  PG_MAX_CONNECTIONS: z.coerce.number().default(20),

  // Redis Configuration
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // LLM Provider Configuration
  DEFAULT_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),

  // Default Rate Limiting Thresholds (Per User)
  RATE_LIMIT_REQUESTS_PER_MIN: z.coerce.number().default(60),
  RATE_LIMIT_TOKENS_PER_MIN: z.coerce.number().default(40000),
  RATE_LIMIT_MAX_CONCURRENT: z.coerce.number().default(5),

  // Resilience & Circuit Breaker Defaults
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().default(5),
  CIRCUIT_BREAKER_RESET_TIMEOUT_MS: z.coerce.number().default(10000),
  REQUEST_TIMEOUT_MS: z.coerce.number().default(30000),

  // Observability
  ENABLE_METRICS: z.coerce.boolean().default(true),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
  console.error('❌ Invalid environment configuration:', parsedEnv.error.format());
  throw new Error('Invalid environment configuration');
}

export const config = parsedEnv.data;

export const MODEL_CATALOG: Record<string, ModelPricing> = {
  'mock-fast': {
    modelId: 'mock-fast',
    name: 'Fast Model (Simulated 8B)',
    tier: 'fast',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    maxContextTokens: 8192,
    targetTtftMs: 120,
    targetTokensPerSec: 75,
  },
  'mock-standard': {
    modelId: 'mock-standard',
    name: 'Standard Model (Simulated 70B)',
    tier: 'standard',
    inputCostPer1M: 0.80,
    outputCostPer1M: 2.40,
    maxContextTokens: 32768,
    targetTtftMs: 280,
    targetTokensPerSec: 45,
  },
  'mock-reasoning': {
    modelId: 'mock-reasoning',
    name: 'Reasoning Model (Simulated DeepThink)',
    tier: 'reasoning',
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.00,
    maxContextTokens: 65536,
    targetTtftMs: 650,
    targetTokensPerSec: 30,
  },
  'gpt-4o-mini': {
    modelId: 'gpt-4o-mini',
    name: 'GPT-4o Mini (Live OpenAI)',
    tier: 'fast',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    maxContextTokens: 128000,
    targetTtftMs: 250,
    targetTokensPerSec: 60,
  },
  'gpt-4o': {
    modelId: 'gpt-4o',
    name: 'GPT-4o (Live OpenAI)',
    tier: 'standard',
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.00,
    maxContextTokens: 128000,
    targetTtftMs: 400,
    targetTokensPerSec: 40,
  },
};
