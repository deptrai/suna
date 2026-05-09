import { Hono } from 'hono';
import { config } from '../config';
import { apiKeyAuth } from '../middleware/auth';
import { webSearch } from './routes/search-web';
import { imageSearch } from './routes/search-image';
import { deepResearch } from './routes/deep-research';
import { jitSync } from './routes/jit-sync';
import { llm } from './routes/llm';
import { proxy } from './routes/proxy';
import { anthropic } from './routes/anthropic';

const router = new Hono();

// Health checks (no auth)
router.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'epsilon-router',
    timestamp: new Date().toISOString(),
    env: config.ENV_MODE,
    uptime: process.uptime(),
  });
});

// Search routes (apiKeyAuth)
router.use('/web-search/*', apiKeyAuth);
router.use('/image-search/*', apiKeyAuth);
router.use('/deep-research/*', apiKeyAuth);
router.use('/jit-sync/*', apiKeyAuth);
router.route('/web-search', webSearch);
router.route('/image-search', imageSearch);
router.route('/deep-research', deepResearch);
router.route('/jit-sync', jitSync);

// LLM routes (apiKeyAuth)
router.use('/chat/*', apiKeyAuth);
router.use('/messages', apiKeyAuth);
router.use('/models', apiKeyAuth);
router.use('/models/*', apiKeyAuth);
router.route('/', llm);
router.route('/', anthropic);

// Proxy routes (auth handled internally — dual mode)
router.route('/', proxy);

export { router };
