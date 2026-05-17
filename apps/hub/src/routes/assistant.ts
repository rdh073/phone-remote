import type { FastifyInstance } from 'fastify';
import type { UIMessage } from 'ai';

import { AssistantChatBodySchema } from '@phone-remote/protocol';
import { assistantCatalog, isAssistantConfigured, runAssistantChat } from '../assistant.js';

export function registerAssistantRoutes(app: FastifyInstance): void {
  app.get('/api/assistant/catalog', async () => assistantCatalog());

  app.post('/api/assistant/chat', async (req, reply) => {
    if (!isAssistantConfigured()) {
      return reply.code(503).send({
        error: 'assistant disabled',
        detail:
          'No provider is configured. Enable one of: Claude OAuth (run `claude` once), ' +
          'ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, DEEPSEEK_API_KEY, ' +
          'a running Ollama daemon, or OPENAI_COMPATIBLE_BASE_URL.',
      });
    }

    const parsed = AssistantChatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid body', detail: parsed.error.message });
    }

    let result;
    try {
      result = await runAssistantChat({
        messages: parsed.data.messages as UIMessage[],
        provider: parsed.data.provider,
        model: parsed.data.model,
      });
    } catch (err) {
      return reply.code(503).send({
        error: 'assistant unavailable',
        detail: (err as Error).message,
      });
    }

    // Hand the underlying Node response to the SDK so it can write the UI message
    // stream (SSE-style frames) directly — Fastify must not post-process after this.
    reply.hijack();
    result.pipeUIMessageStreamToResponse(reply.raw);
  });
}
