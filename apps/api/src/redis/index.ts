import { Redis } from 'ioredis';
import { config } from '../config/index.js';

interface MemoryCacheEntry {
  value: string;
  expiresAt: number | null;
}

class RedisCacheService {
  private client: Redis | null = null;
  public isConnected: boolean = false;
  private memoryCache = new Map<string, MemoryCacheEntry>();

  async init() {
    try {
      this.client = new Redis(config.REDIS_URL, {
        connectTimeout: 2000,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        retryStrategy: () => null, // Don't hang on connection failure
      });

      await this.client.connect();
      this.isConnected = true;
      console.log('✅ Redis connected successfully');
    } catch (err: any) {
      this.isConnected = false;
      console.warn(
        `⚠️  Redis connection unavailable (${err.message}). Using high-performance in-memory fallback layer.`
      );
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.get(key);
      } catch {
        // Fallback to memory
      }
    }

    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        if (ttlSeconds) {
          await this.client.set(key, value, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, value);
        }
        return;
      } catch {
        // Fallback
      }
    }

    this.memoryCache.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
        return;
      } catch {
        // Fallback
      }
    }
    this.memoryCache.delete(key);
  }

  async incrBy(key: string, amount: number, ttlSeconds: number = 60): Promise<number> {
    if (this.isConnected && this.client) {
      try {
        const val = await this.client.incrby(key, amount);
        if (val === amount) {
          await this.client.expire(key, ttlSeconds);
        }
        return val;
      } catch {
        // Fallback
      }
    }

    const current = await this.get(key);
    const newVal = (current ? parseInt(current, 10) : 0) + amount;
    await this.set(key, newVal.toString(), ttlSeconds);
    return newVal;
  }

  async flushAll(): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.flushall();
      } catch {}
    }
    this.memoryCache.clear();
  }
}

export const redis = new RedisCacheService();
