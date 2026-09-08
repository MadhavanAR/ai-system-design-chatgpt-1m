import { FastifyPluginAsync } from 'fastify';
import { conversationRepo } from '../infrastructure/repositories/conversation.repo.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const createConvSchema = z.object({
  title: z.string().optional().default('New Conversation'),
  modelId: z.string().optional().default('mock-fast'),
  userId: z.string().optional().default('user_demo_1'),
  systemPrompt: z.string().optional(),
});

export const conversationRoutes: FastifyPluginAsync = async (fastify) => {
  // List user conversations
  fastify.get('/api/conversations', async (request, reply) => {
    const userId = (request.query as any)?.userId || 'user_demo_1';
    const convs = await conversationRepo.listConversations(userId);
    return reply.send({ conversations: convs });
  });

  // Create new conversation
  fastify.post('/api/conversations', async (request, reply) => {
    const data = createConvSchema.parse(request.body || {});
    const conv = await conversationRepo.createConversation({
      id: `conv_${uuidv4().substring(0, 12)}`,
      userId: data.userId,
      title: data.title,
      modelId: data.modelId,
      systemPrompt: data.systemPrompt,
    });
    return reply.status(201).send({ conversation: conv });
  });

  // Fetch conversation with historical turns
  fastify.get('/api/conversations/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const conv = await conversationRepo.getConversation(id);
    if (!conv) {
      return reply.status(404).send({ error: 'Conversation not found', code: 'NOT_FOUND' });
    }
    const messages = await conversationRepo.getMessages(id);
    return reply.send({ conversation: conv, messages });
  });

  // Delete conversation
  fastify.delete('/api/conversations/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await conversationRepo.deleteConversation(id);
    return reply.send({ success: true, id });
  });
};
