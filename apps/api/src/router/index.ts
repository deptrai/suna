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
import { vibeTradingMcp } from './routes/vibe-trading-mcp';
import { mempoolAlertsRoute } from './routes/mempool-alerts';
import { entityWalletRisk } from './routes/entity-wallet-risk';
import { onchainFactCheck } from './routes/onchain-fact-check';
import { smartMoneyFlow } from './routes/smart-money-flow';
import { protocolValuation } from './routes/protocol-valuation';
import { llm } from './routes/llm';
import { validatePoolConfig } from './services/model-pool';
import { proxy } from './routes/proxy';
import { anthropic } from './routes/anthropic';
import { memory } from './routes/memory';

const router = new Hono();

// F13/F14: Validate think-mode pool config at startup (logs warnings, doesn't throw)
validatePoolConfig();

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
router.use('/vibe-trading-mcp/*', combinedAuth);
router.use('/mempool-alerts/*', combinedAuth);
router.use('/entity-wallet-risk/*', combinedAuth);
router.use('/onchain-fact-check/*', combinedAuth);
router.use('/smart-money-flow/*', combinedAuth);
router.use('/protocol-valuation/*', combinedAuth);
// F12: /render + /extract are service-to-service (plugin → backend) with
// `epsilon_*` Bearer token via apiKeyAuth. /memory + /memory/:id are user-facing
// (Settings UI) via combinedAuth (Supabase JWT). Wildcard /memory/* would
// double-match /render and /extract — explicit per-path mounts avoid that.
router.use('/memory/render', apiKeyAuth);
router.use('/memory/extract', apiKeyAuth);
router.use('/memory', combinedAuth);
router.use('/memory/:id', combinedAuth);
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
router.route('/vibe-trading-mcp', vibeTradingMcp);
router.route('/mempool-alerts', mempoolAlertsRoute);
router.route('/entity-wallet-risk', entityWalletRisk);
router.route('/onchain-fact-check', onchainFactCheck);
router.route('/smart-money-flow', smartMoneyFlow);
router.route('/protocol-valuation', protocolValuation);
router.route('/memory', memory);

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
