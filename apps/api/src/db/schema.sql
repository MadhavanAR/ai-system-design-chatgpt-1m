-- ============================================================================
-- SCHEMA: AI System Design - ChatGPT-like Architecture for 1M Users
-- Engine: PostgreSQL 16
-- Notes: Designed for tenant isolation, horizontal read scaling, and partitioning.
-- ============================================================================

-- Extensions for high-performance UUID generation & indexing
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. USERS & TENANTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    email VARCHAR(255) UNIQUE,
    display_name VARCHAR(128) NOT NULL DEFAULT 'User',
    tier VARCHAR(32) NOT NULL DEFAULT 'free', -- 'free', 'pro', 'enterprise'
    rpm_limit INT NOT NULL DEFAULT 60,
    tpm_limit INT NOT NULL DEFAULT 40000,
    max_concurrent_requests INT NOT NULL DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_tier ON users(tenant_id, tier);

-- ----------------------------------------------------------------------------
-- 2. API KEYS (For programmatic access & tenant authentication)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    key_hash VARCHAR(128) NOT NULL UNIQUE,
    key_prefix VARCHAR(16) NOT NULL,
    name VARCHAR(64) NOT NULL DEFAULT 'Default API Key',
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE is_active = true;

-- ----------------------------------------------------------------------------
-- 3. CONVERSATIONS (Logical thread container)
-- Read Scalability: Hot conversations cached in Redis; historical reads via Read Replicas.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    title VARCHAR(255) NOT NULL DEFAULT 'New Conversation',
    model_id VARCHAR(64) NOT NULL DEFAULT 'mock-fast',
    system_prompt TEXT,
    context_token_count INT NOT NULL DEFAULT 0,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 4. MESSAGES (Individual chat turns)
-- Partitioning Strategy: At 1M+ scale, partition range by created_at (Monthly).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(64) PRIMARY KEY,
    conversation_id VARCHAR(64) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL,
    role VARCHAR(16) NOT NULL, -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    token_count INT NOT NULL DEFAULT 0,
    model_id VARCHAR(64),
    ttft_ms INT,
    total_duration_ms INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at ASC);

-- ----------------------------------------------------------------------------
-- 5. MODEL REQUESTS (Inference telemetry & audit trail)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS model_requests (
    request_id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    conversation_id VARCHAR(64),
    model_id VARCHAR(64) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL, -- 'success', 'rate_limited', 'circuit_open', 'error', 'timeout'
    input_tokens INT NOT NULL DEFAULT 0,
    output_tokens INT NOT NULL DEFAULT 0,
    ttft_ms INT,
    total_latency_ms INT NOT NULL DEFAULT 0,
    tokens_per_sec NUMERIC(8, 2),
    estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_model_requests_user_created ON model_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_requests_model_status ON model_requests(model_id, status);

-- ----------------------------------------------------------------------------
-- 6. USAGE RECORDS (Aggregated billing & quota management)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_records (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'default',
    period_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_requests INT NOT NULL DEFAULT 0,
    total_input_tokens BIGINT NOT NULL DEFAULT 0,
    total_output_tokens BIGINT NOT NULL DEFAULT 0,
    total_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_period UNIQUE(user_id, period_date)
);

CREATE INDEX IF NOT EXISTS idx_usage_records_tenant_period ON usage_records(tenant_id, period_date);
