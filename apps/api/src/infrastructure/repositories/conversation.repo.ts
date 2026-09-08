import { Pool } from 'pg';
import { User, Conversation, Message, ModelRequestRecord } from '../../domain/types.js';
import { config } from '../../config/index.js';
import { logger } from '../observability/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface IConversationRepository {
  getUser(id: string): Promise<User | null>;
  createConversation(data: Partial<Conversation> & { id: string; userId: string; title: string; modelId: string }): Promise<Conversation>;
  listConversations(userId: string): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;
  deleteConversation(id: string): Promise<boolean>;
  saveMessage(msg: Message): Promise<Message>;
  getMessages(conversationId: string): Promise<Message[]>;
  recordModelRequest(record: ModelRequestRecord): Promise<void>;
  getTelemetrySummary(): Promise<{
    totalRequests: number;
    successfulRequests: number;
    rateLimitedRequests: number;
    failedRequests: number;
    totalTokens: number;
    totalCostUsd: number;
  }>;
}

export class PostgresConversationRepository implements IConversationRepository {
  private pool: Pool | null = null;
  public isConnected = false;

  // In-memory fallback layer for offline local development & isolated tests
  private memUsers = new Map<string, User>();
  private memConversations = new Map<string, Conversation>();
  private memMessages = new Map<string, Message[]>();
  private memRequests = new Map<string, ModelRequestRecord>();

  constructor() {
    // Seed default developer account in memory
    const defaultUser: User = {
      id: 'user_demo_1',
      tenantId: 'default',
      email: 'engineer@platform.internal',
      displayName: 'Staff AI Engineer',
      tier: 'pro',
      rpmLimit: config.RATE_LIMIT_REQUESTS_PER_MIN,
      tpmLimit: config.RATE_LIMIT_TOKENS_PER_MIN,
      maxConcurrentRequests: config.RATE_LIMIT_MAX_CONCURRENT,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.memUsers.set(defaultUser.id, defaultUser);
  }

  async init(): Promise<void> {
    try {
      this.pool = new Pool({
        connectionString: config.DATABASE_URL,
        connectionTimeoutMillis: 2000,
        max: config.PG_MAX_CONNECTIONS,
      });

      const client = await this.pool.connect();
      this.isConnected = true;
      logger.info({ event: 'db_connected', database: config.PGDATABASE }, 'PostgreSQL connection established');

      // Auto-migrate schema if exists
      const schemaPath = path.resolve(__dirname, '../../db/schema.sql');
      if (fs.existsSync(schemaPath)) {
        const sql = fs.readFileSync(schemaPath, 'utf8');
        await client.query(sql);
      }

      // Ensure seed user exists
      await client.query(
        `INSERT INTO users (id, tenant_id, email, display_name, tier, rpm_limit, tpm_limit, max_concurrent_requests)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          'user_demo_1',
          'default',
          'engineer@platform.internal',
          'Staff AI Engineer',
          'pro',
          config.RATE_LIMIT_REQUESTS_PER_MIN,
          config.RATE_LIMIT_TOKENS_PER_MIN,
          config.RATE_LIMIT_MAX_CONCURRENT,
        ]
      );

      client.release();
    } catch (err: any) {
      this.isConnected = false;
      logger.warn(
        { event: 'db_fallback', reason: err.message },
        'PostgreSQL offline. Operating via in-memory repository fallback (Local Dev Only).'
      );
    }
  }

  async getUser(id: string): Promise<User | null> {
    if (this.isConnected && this.pool) {
      try {
        const res = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
        if (res.rows[0]) {
          const r = res.rows[0];
          return {
            id: r.id,
            tenantId: r.tenant_id,
            email: r.email,
            displayName: r.display_name,
            tier: r.tier,
            rpmLimit: r.rpm_limit,
            tpmLimit: r.tpm_limit,
            maxConcurrentRequests: r.max_concurrent_requests,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          };
        }
      } catch (err) {
        logger.error({ err }, 'PG error reading user');
      }
    }
    return this.memUsers.get(id) || this.memUsers.get('user_demo_1') || null;
  }

  async createConversation(data: Partial<Conversation> & { id: string; userId: string; title: string; modelId: string }): Promise<Conversation> {
    const conv: Conversation = {
      id: data.id,
      userId: data.userId,
      tenantId: data.tenantId || 'default',
      title: data.title,
      modelId: data.modelId,
      systemPrompt: data.systemPrompt,
      contextTokenCount: 0,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.isConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO conversations (id, user_id, tenant_id, title, model_id, system_prompt, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [conv.id, conv.userId, conv.tenantId, conv.title, conv.modelId, conv.systemPrompt || null, conv.createdAt, conv.updatedAt]
        );
      } catch (err) {
        logger.error({ err }, 'PG error creating conversation');
      }
    }

    this.memConversations.set(conv.id, conv);
    this.memMessages.set(conv.id, []);
    return conv;
  }

  async listConversations(userId: string): Promise<Conversation[]> {
    if (this.isConnected && this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM conversations WHERE user_id = $1 AND is_archived = false ORDER BY updated_at DESC LIMIT 50',
          [userId]
        );
        return res.rows.map((r: any) => ({
          id: r.id,
          userId: r.user_id,
          tenantId: r.tenant_id,
          title: r.title,
          modelId: r.model_id,
          systemPrompt: r.system_prompt,
          contextTokenCount: r.context_token_count,
          isArchived: r.is_archived,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));
      } catch (err) {
        logger.error({ err }, 'PG error listing conversations');
      }
    }

    return Array.from(this.memConversations.values())
      .filter((c) => c.userId === userId && !c.isArchived)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getConversation(id: string): Promise<Conversation | null> {
    if (this.isConnected && this.pool) {
      try {
        const res = await this.pool.query('SELECT * FROM conversations WHERE id = $1', [id]);
        if (res.rows[0]) {
          const r = res.rows[0];
          return {
            id: r.id,
            userId: r.user_id,
            tenantId: r.tenant_id,
            title: r.title,
            modelId: r.model_id,
            systemPrompt: r.system_prompt,
            contextTokenCount: r.context_token_count,
            isArchived: r.is_archived,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          };
        }
      } catch (err) {
        logger.error({ err }, 'PG error fetching conversation');
      }
    }
    return this.memConversations.get(id) || null;
  }

  async deleteConversation(id: string): Promise<boolean> {
    if (this.isConnected && this.pool) {
      try {
        await this.pool.query('DELETE FROM conversations WHERE id = $1', [id]);
      } catch (err) {
        logger.error({ err }, 'PG error deleting conversation');
      }
    }
    this.memConversations.delete(id);
    this.memMessages.delete(id);
    return true;
  }

  async saveMessage(msg: Message): Promise<Message> {
    if (this.isConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO messages (id, conversation_id, user_id, role, content, token_count, model_id, ttft_ms, total_duration_ms, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [msg.id, msg.conversationId, msg.userId, msg.role, msg.content, msg.tokenCount, msg.modelId || null, msg.ttftMs || null, msg.totalDurationMs || null, msg.createdAt]
        );

        await this.pool.query(
          `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, context_token_count = context_token_count + $1 WHERE id = $2`,
          [msg.tokenCount, msg.conversationId]
        );
      } catch (err) {
        logger.error({ err }, 'PG error saving message');
      }
    }

    const msgs = this.memMessages.get(msg.conversationId) || [];
    msgs.push(msg);
    this.memMessages.set(msg.conversationId, msgs);

    const conv = this.memConversations.get(msg.conversationId);
    if (conv) {
      conv.updatedAt = new Date();
      conv.contextTokenCount += msg.tokenCount;
    }

    return msg;
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    if (this.isConnected && this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
          [conversationId]
        );
        return res.rows.map((r: any) => ({
          id: r.id,
          conversationId: r.conversation_id,
          userId: r.user_id,
          role: r.role,
          content: r.content,
          tokenCount: r.token_count,
          modelId: r.model_id,
          ttftMs: r.ttft_ms,
          totalDurationMs: r.total_duration_ms,
          createdAt: r.created_at,
        }));
      } catch (err) {
        logger.error({ err }, 'PG error fetching messages');
      }
    }
    return this.memMessages.get(conversationId) || [];
  }

  async recordModelRequest(record: ModelRequestRecord): Promise<void> {
    if (this.isConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO model_requests 
           (request_id, user_id, tenant_id, conversation_id, model_id, provider, status, input_tokens, output_tokens, ttft_ms, total_latency_ms, tokens_per_sec, estimated_cost_usd, error_message, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            record.requestId,
            record.userId,
            record.tenantId,
            record.conversationId || null,
            record.modelId,
            record.provider,
            record.status,
            record.inputTokens,
            record.outputTokens,
            record.ttftMs || null,
            record.totalLatencyMs,
            record.tokensPerSec || null,
            record.estimatedCostUsd,
            record.errorMessage || null,
            record.createdAt,
          ]
        );
      } catch (err) {
        logger.error({ err }, 'PG error recording model request');
      }
    }
    this.memRequests.set(record.requestId, record);
  }

  async getTelemetrySummary(): Promise<{
    totalRequests: number;
    successfulRequests: number;
    rateLimitedRequests: number;
    failedRequests: number;
    totalTokens: number;
    totalCostUsd: number;
  }> {
    let totalReqs = 0;
    let successReqs = 0;
    let rateLimitedReqs = 0;
    let failedReqs = 0;
    let totalTokens = 0;
    let totalCost = 0;

    for (const req of this.memRequests.values()) {
      totalReqs++;
      if (req.status === 'success') successReqs++;
      else if (req.status === 'rate_limited') rateLimitedReqs++;
      else failedReqs++;

      totalTokens += req.inputTokens + req.outputTokens;
      totalCost += req.estimatedCostUsd || 0;
    }

    return {
      totalRequests: totalReqs,
      successfulRequests: successReqs,
      rateLimitedRequests: rateLimitedReqs,
      failedRequests: failedReqs,
      totalTokens,
      totalCostUsd: Number(totalCost.toFixed(6)),
    };
  }
}

export const conversationRepo = new PostgresConversationRepository();
