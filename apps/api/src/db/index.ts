import { Pool } from 'pg';
import { config } from '../config/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  tier: 'free' | 'pro' | 'enterprise';
  rpm_limit: number;
  tpm_limit: number;
  max_concurrent_requests: number;
  created_at: Date;
  updated_at: Date;
}

export interface Conversation {
  id: string;
  user_id: string;
  tenant_id: string;
  title: string;
  model_id: string;
  system_prompt?: string;
  context_token_count: number;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  token_count: number;
  model_id?: string;
  ttft_ms?: number;
  total_duration_ms?: number;
  created_at: Date;
}

export interface ModelRequestRecord {
  request_id: string;
  user_id: string;
  tenant_id: string;
  conversation_id?: string;
  model_id: string;
  provider: string;
  status: string;
  input_tokens: number;
  output_tokens: number;
  ttft_ms?: number;
  total_latency_ms: number;
  tokens_per_sec?: number;
  estimated_cost_usd: number;
  error_message?: string;
  created_at: Date;
}

// In-memory fallback stores for offline/local resilience
const memoryStore = {
  users: new Map<string, User>(),
  conversations: new Map<string, Conversation>(),
  messages: new Map<string, Message[]>(),
  modelRequests: new Map<string, ModelRequestRecord>(),
};

// Seed default demo user
const defaultUser: User = {
  id: 'user_demo_1',
  tenant_id: 'default',
  email: 'demo@engineer.internal',
  display_name: 'Lead AI Engineer',
  tier: 'pro',
  rpm_limit: 120,
  tpm_limit: 80000,
  max_concurrent_requests: 10,
  created_at: new Date(),
  updated_at: new Date(),
};
memoryStore.users.set(defaultUser.id, defaultUser);

class DatabaseClient {
  private pool: Pool | null = null;
  public isConnected: boolean = false;

  async init() {
    try {
      this.pool = new Pool({
        connectionString: config.DATABASE_URL,
        connectionTimeoutMillis: 2000,
      });

      // Test connection
      const client = await this.pool.connect();
      this.isConnected = true;
      console.log('✅ PostgreSQL connected successfully');

      // Initialize schema
      const schemaPath = path.join(__dirname, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const sql = fs.readFileSync(schemaPath, 'utf8');
        await client.query(sql);
        console.log('✅ PostgreSQL schema initialized');
      }

      // Seed default user if not exists
      await client.query(
        `INSERT INTO users (id, tenant_id, email, display_name, tier, rpm_limit, tpm_limit, max_concurrent_requests)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          defaultUser.id,
          defaultUser.tenant_id,
          defaultUser.email,
          defaultUser.display_name,
          defaultUser.tier,
          defaultUser.rpm_limit,
          defaultUser.tpm_limit,
          defaultUser.max_concurrent_requests,
        ]
      );

      client.release();
    } catch (err: any) {
      this.isConnected = false;
      console.warn(
        `⚠️  PostgreSQL connection unavailable (${err.message}). Using high-performance in-memory fallback layer.`
      );
    }
  }

  async getUser(id: string): Promise<User | null> {
    if (this.isConnected && this.pool) {
      try {
        const res = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
        return res.rows[0] || null;
      } catch (e) {
        console.error('PG query error, fallback to memory', e);
      }
    }
    return memoryStore.users.get(id) || defaultUser;
  }

  async createConversation(data: {
    id: string;
    user_id: string;
    tenant_id?: string;
    title: string;
    model_id: string;
    system_prompt?: string;
  }): Promise<Conversation> {
    const conv: Conversation = {
      id: data.id,
      user_id: data.user_id,
      tenant_id: data.tenant_id || 'default',
      title: data.title,
      model_id: data.model_id,
      system_prompt: data.system_prompt,
      context_token_count: 0,
      is_archived: false,
      created_at: new Date(),
      updated_at: new Date(),
    };

    if (this.isConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO conversations (id, user_id, tenant_id, title, model_id, system_prompt, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            conv.id,
            conv.user_id,
            conv.tenant_id,
            conv.title,
            conv.model_id,
            conv.system_prompt || null,
            conv.created_at,
            conv.updated_at,
          ]
        );
      } catch (e) {
        console.error('PG error creating conversation', e);
      }
    }

    memoryStore.conversations.set(conv.id, conv);
    memoryStore.messages.set(conv.id, []);
    return conv;
  }

  async listConversations(userId: string): Promise<Conversation[]> {
    if (this.isConnected && this.pool) {
      try {
        const res = await this.pool.query(
          'SELECT * FROM conversations WHERE user_id = $1 AND is_archived = false ORDER BY updated_at DESC LIMIT 50',
          [userId]
        );
        return res.rows;
      } catch (e) {
        console.error('PG error listing conversations', e);
      }
    }

    return Array.from(memoryStore.conversations.values())
      .filter((c) => c.user_id === userId && !c.is_archived)
      .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
  }

  async getConversation(id: string): Promise<Conversation | null> {
    if (this.isConnected && this.pool) {
      try {
        const res = await this.pool.query('SELECT * FROM conversations WHERE id = $1', [id]);
        return res.rows[0] || null;
      } catch (e) {
        console.error('PG error fetching conversation', e);
      }
    }
    return memoryStore.conversations.get(id) || null;
  }

  async deleteConversation(id: string): Promise<boolean> {
    if (this.isConnected && this.pool) {
      try {
        await this.pool.query('DELETE FROM conversations WHERE id = $1', [id]);
      } catch (e) {
        console.error('PG error deleting conversation', e);
      }
    }
    memoryStore.conversations.delete(id);
    memoryStore.messages.delete(id);
    return true;
  }

  async saveMessage(msg: Message): Promise<Message> {
    if (this.isConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO messages (id, conversation_id, user_id, role, content, token_count, model_id, ttft_ms, total_duration_ms, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            msg.id,
            msg.conversation_id,
            msg.user_id,
            msg.role,
            msg.content,
            msg.token_count,
            msg.model_id || null,
            msg.ttft_ms || null,
            msg.total_duration_ms || null,
            msg.created_at,
          ]
        );

        // Update conversation updated_at and context token count
        await this.pool.query(
          `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, context_token_count = context_token_count + $1 WHERE id = $2`,
          [msg.token_count, msg.conversation_id]
        );
      } catch (e) {
        console.error('PG error saving message', e);
      }
    }

    const currentMsgs = memoryStore.messages.get(msg.conversation_id) || [];
    currentMsgs.push(msg);
    memoryStore.messages.set(msg.conversation_id, currentMsgs);

    const conv = memoryStore.conversations.get(msg.conversation_id);
    if (conv) {
      conv.updated_at = new Date();
      conv.context_token_count += msg.token_count;
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
        return res.rows;
      } catch (e) {
        console.error('PG error fetching messages', e);
      }
    }
    return memoryStore.messages.get(conversationId) || [];
  }

  async recordModelRequest(record: ModelRequestRecord): Promise<void> {
    if (this.isConnected && this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO model_requests 
           (request_id, user_id, tenant_id, conversation_id, model_id, provider, status, input_tokens, output_tokens, ttft_ms, total_latency_ms, tokens_per_sec, estimated_cost_usd, error_message, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            record.request_id,
            record.user_id,
            record.tenant_id,
            record.conversation_id || null,
            record.model_id,
            record.provider,
            record.status,
            record.input_tokens,
            record.output_tokens,
            record.ttft_ms || null,
            record.total_latency_ms,
            record.tokens_per_sec || null,
            record.estimated_cost_usd,
            record.error_message || null,
            record.created_at,
          ]
        );
      } catch (e) {
        console.error('PG error recording model request', e);
      }
    }
    memoryStore.modelRequests.set(record.request_id, record);
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

    const allRequests = Array.from(memoryStore.modelRequests.values());
    for (const req of allRequests) {
      totalReqs++;
      if (req.status === 'success') successReqs++;
      else if (req.status === 'rate_limited') rateLimitedReqs++;
      else failedReqs++;

      totalTokens += req.input_tokens + req.output_tokens;
      totalCost += Number(req.estimated_cost_usd) || 0;
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

export const db = new DatabaseClient();
