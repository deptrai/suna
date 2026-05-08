import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

const app = new Hono();

app.use('*', logger());

app.get('/', (c) => {
  return c.text('Chainlens MaaS Proxy Gateway is running!');
});

// Endpoint cho Chat Completions
app.post('/v1/chat/completions', async (c) => {
  try {
    const body = await c.req.json();
    const { model, messages, stream } = body;

    // Lấy API Key từ Header (Mô phỏng BYOK)
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Missing or invalid Authorization header' }, 401);
    }
    const apiKey = authHeader.replace('Bearer ', '');

    // Khởi tạo Provider động dựa trên BYOK
    const openai = createOpenAI({
      apiKey: apiKey,
      // Có thể cấu hình custom baseURL nếu dùng Local Node (Ollama)
      // baseURL: 'http://localhost:11434/v1', 
    });

    // Gọi LLM thông qua Vercel AI SDK
    const result = await streamText({
      model: openai(model || 'gpt-3.5-turbo'),
      messages: messages,
    });

    if (stream) {
      // Stream response
      return result.toTextStreamResponse();
    } else {
      // Non-stream response (MVP)
      const fullResponse = await result.text;
      return c.json({
        id: 'chatcmpl-' + crypto.randomUUID(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: fullResponse,
            },
            finish_reason: 'stop',
          },
        ],
      });
    }

  } catch (error: any) {
    console.error('Error in proxy:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default {
  port: 3000,
  fetch: app.fetch,
};
