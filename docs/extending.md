# Developer Extension Guide

This guide explains how to modify, extend, and adapt the reference implementation for new capabilities, custom model providers, vector retrieval, authentication, and distributed deployment topologies.

---

## Extension Matrix Overview

| Extension Goal | Primary Code Locations | Complexity | ADR Recommended? |
| :--- | :--- | :--- | :--- |
| **1. Add New Model Provider** | `apps/api/src/services/providers/` | Low | No |
| **2. Add New Model Tier / Catalog Entry** | `apps/api/src/config/models.ts` | Low | No |
| **3. Add Custom Routing Heuristics** | `apps/api/src/services/model-router.ts` | Low | Yes |
| **4. Implement JWT / OAuth2 Auth Gateway** | `apps/api/src/plugins/auth.ts`, `apps/api/src/app.ts` | Medium | Yes |
| **5. Add Semantic Prompt Caching** | `apps/api/src/services/semantic-cache.ts`, `routes/chat.ts` | Medium | Yes |
| **6. Integrate Vector Search / RAG** | `apps/api/src/services/retrieval.ts`, `services/context-manager.ts` | Medium | Yes |
| **7. Connect Real Self-Hosted GPU Cluster (vLLM / TGI)** | `apps/api/src/services/providers/vllm.ts` | Medium | Yes |
| **8. Export Distributed Tracing (OpenTelemetry)** | `apps/api/src/plugins/tracing.ts`, `apps/api/src/server.ts` | Low | No |

---

## 1. Adding a New LLM Provider (e.g. Anthropic, Cohere, Local vLLM)

All inference providers implement the `ModelProvider` interface defined in `apps/api/src/services/providers/types.ts`:

```typescript
export interface ModelProvider {
  readonly id: string;
  readonly name: string;
  streamCompletion(
    messages: ChatMessage[],
    options: CompletionOptions,
    abortSignal?: AbortSignal
  ): AsyncIterable<StreamChunk>;
}
```

### Steps to implement:
1. Create a new provider file: `apps/api/src/services/providers/anthropic.ts`.
2. Implement `AsyncIterable<StreamChunk>` yielding tokens and usage metadata.
3. Handle `abortSignal` to terminate upstream HTTP streams on client disconnect.
4. Register the new provider factory in `apps/api/src/services/providers/index.ts`.

---

## 2. Adding a Model Tier or Changing Pricing Catalog

Model metadata, token limits, pricing per million tokens, and default latency targets are configured in `apps/api/src/config/models.ts`.

### Steps to modify:
1. Open `apps/api/src/config/models.ts`.
2. Add or modify an entry in `MODEL_CATALOG`:
   ```typescript
   export const MODEL_CATALOG: Record<string, ModelConfig> = {
     'my-custom-model': {
       id: 'my-custom-model',
       name: 'Custom Enterprise LLM',
       tier: 'BALANCED', // 'FAST' | 'BALANCED' | 'REASONING'
       provider: 'openai-compatible',
       contextWindowTokens: 32768,
       inputCostPer1M: 0.50,
       outputCostPer1M: 1.50,
       targetLatencyMs: 350,
     },
   };
   ```
3. Update the frontend model dropdown in `apps/web/src/components/ModelSelector.tsx` if customized labeling is required.

---

## 3. Adding Custom Routing Heuristics

The intelligent router evaluates request characteristics before model execution in `apps/api/src/services/model-router.ts`.

### Where to change:
- **Function**: `routeRequest(message: string, userTier: UserTier, requestedModel?: string): RoutingDecision`
- **Code Location**: `apps/api/src/services/model-router.ts`

### Example: Adding Code Detection & Complexity Heuristics
```typescript
// Inside apps/api/src/services/model-router.ts
const containsCodeBlock = /```[\s\S]*?```/.test(message) || /(def |function |class |import )/.test(message);
if (containsCodeBlock && circuitBreaker.isOpen('mock-reasoning') === false) {
  return {
    selectedModel: 'mock-reasoning',
    reason: 'Code synthesis heuristic detected; routed to high-capacity reasoning model',
    estimatedTokens: estimateTokens(message),
    circuitState: 'CLOSED',
    fallbackActivated: false,
  };
}
```

---

## 4. Integrating Production Authentication (JWT / OIDC)

In the reference implementation, user identity is extracted via `req.headers['x-user-id']` or defaulted to `anonymous`.

### How to upgrade to JWT / OAuth2:
1. Install `@fastify/jwt`:
   ```bash
   pnpm --filter @ai-chat/api add @fastify/jwt
   ```
2. Create `apps/api/src/plugins/auth.ts`:
   ```typescript
   import fp from 'fastify-plugin';
   import fastifyJwt from '@fastify/jwt';

   export default fp(async (fastify) => {
     fastify.register(fastifyJwt, {
       secret: process.env.JWT_SECRET || 'dev-secret-replace-in-prod',
     });

     fastify.decorate('authenticate', async (request, reply) => {
       try {
         await request.jwtVerify();
       } catch (err) {
         reply.status(401).send({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
       }
     });
   });
   ```
3. Add `onRequest: [fastify.authenticate]` to protected routes in `apps/api/src/routes/chat.ts` and `conversations.ts`.

---

## 5. Adding Semantic Prompt Caching

Semantic caching checks whether an incoming prompt has a sufficiently high cosine similarity to a recently answered prompt, bypassing LLM inference entirely.

### How to insert:
1. Create `apps/api/src/services/semantic-cache.ts`.
2. In `apps/api/src/routes/chat.ts`, check the cache before invoking `modelRouter.routeRequest()`:
   ```typescript
   const cachedResponse = await semanticCache.get(parsedBody.message);
   if (cachedResponse) {
     // Stream cached tokens immediately via SSE with cacheHit: true
     return streamCachedResponse(reply, cachedResponse);
   }
   ```
3. Store the completed assistant turn in the cache upon `done` event.

---

## 6. Connecting a Real Self-Hosted GPU Cluster (vLLM / TGI)

To replace mock inference with a dedicated vLLM instance running Mistral, Llama 3, or DeepSeek:

1. Deploy vLLM with OpenAI-compatible endpoint:
   ```bash
   python3 -m vllm.entrypoints.openai.api_server \
     --model meta-llama/Meta-Llama-3-8B-Instruct \
     --port 8000
   ```
2. Set the following in `.env`:
   ```env
   LLM_PROVIDER=openai-compatible
   OPENAI_BASE_URL=http://localhost:8000/v1
   OPENAI_API_KEY=dummy-token
   DEFAULT_MODEL=meta-llama/Meta-Llama-3-8B-Instruct
   ```
3. The existing `OpenAiCompatibleProvider` (`apps/api/src/services/providers/openai-compatible.ts`) will immediately stream completions from your local or remote GPU cluster.

---

## 7. Adding Distributed Tracing (OpenTelemetry)

To trace requests across client -> gateway -> router -> Redis -> Postgres -> LLM:

1. Install OpenTelemetry SDKs:
   ```bash
   pnpm --filter @ai-chat/api add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http
   ```
2. Initialize tracing before Fastify boots in `apps/api/src/tracer.ts` and import it as the first line in `apps/api/src/server.ts`.
3. Traces will export standard W3C `traceparent` headers through SSE connections and downstream RPCs.
