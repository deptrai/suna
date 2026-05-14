import { Hono } from 'hono';
import { config } from '../config';
import { apiKeyAuth, combinedAuth } from '../middleware/auth';
import { webSearch } from './routes/search-web';
import { imageSearch } from './routes/search-image';
import { deepResearch } from './routes/deep-research';
import { jitSync } from './routes/jit-sync';
import { narratives } from './routes/narratives';
import { codeValidator } from './routes/code-validator';
import { tokenInfo } from './routes/token-info';
import { contractRisk } from './routes/contract-risk';
import { txSimulator } from './routes/tx-simulator';
import { tokenHolders } from './routes/token-holders';
import { tokenTransactions } from './routes/token-transactions';
import { tokenSearch } from './routes/token-search';
import { tokenOhlcv } from './routes/token-ohlcv';
import { vibeTrading } from './routes/vibe-trading';
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
router.use('/code-validator/*', apiKeyAuth);
router.use('/token-info/*', combinedAuth);
router.use('/contract-risk/*', combinedAuth);
router.use('/tx-simulator/*', combinedAuth);
router.use('/token-holders/*', combinedAuth);
router.use('/token-transactions/*', combinedAuth);
router.use('/token-search/*', combinedAuth);
router.use('/token-ohlcv/*', combinedAuth);
router.use('/vibe-trading/*', combinedAuth);
router.route('/web-search', webSearch);
router.route('/image-search', imageSearch);
router.route('/deep-research', deepResearch);
router.route('/jit-sync', jitSync);
router.route('/code-validator', codeValidator);
router.route('/token-info', tokenInfo);
router.route('/contract-risk', contractRisk);
router.route('/tx-simulator', txSimulator);
router.route('/token-holders', tokenHolders);
router.route('/token-transactions', tokenTransactions);
router.route('/token-search', tokenSearch);
router.route('/token-ohlcv', tokenOhlcv);
router.route('/vibe-trading', vibeTrading);

// Public routes (no auth — FR5: discover feed public for all tiers)
router.route('/narratives', narratives);

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
