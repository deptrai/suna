import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { getToolCost } from '../../config';
import { checkCredits, deductToolCredits } from '../services/billing';
import { cacheFirstOnchainFactCheck } from '../services/onchain-fact-check';
import { logger } from '../../lib/logger';
import type { AppContext } from '../../types';

const TOOL = 'onchain_fact_check';
const SESSION_ID = z
  .string()
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'session_id must be alphanumeric/dash/underscore')
  .optional();

const reqSchema = z.object({
  chain: z.string().max(32).default('ethereum'),
  token_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  token_symbol: z.string().max(32).optional(),
  discover_feed_id: z.string().uuid().optional(),
  article_title: z.string().max(500).optional(),
  article_sentiment: z.enum(['positive', 'neutral', 'negative', 'unknown']).optional(),
  force_refresh: z.boolean().optional().default(false),
  session_id: SESSION_ID,
});

export const onchainFactCheck = new Hono<{ Variables: AppContext }>();

onchainFactCheck.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (body === null) throw new HTTPException(400, { message: 'Invalid JSON body' });
  const parsed = reqSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: `Validation error: ${parsed.error.message}` });

  const accountId = c.get('accountId');
  const request = parsed.data;
  const chain = request.chain.toLowerCase();
  const tokenAddress = request.token_address.toLowerCase();
  let billable = false;
  if (request.force_refresh) {
    const credits = await checkCredits(accountId);
    if (!credits.hasCredits) throw new HTTPException(402, { message: credits.message || 'Insufficient credits' });
    billable = true;
  }

  const { cacheStatus, result } = await cacheFirstOnchainFactCheck({
    chain,
    tokenAddress,
    tokenSymbol: request.token_symbol,
    discoverFeedId: request.discover_feed_id,
    articleTitle: request.article_title,
    articleSentiment: request.article_sentiment,
    forceRefresh: request.force_refresh,
  });

  const cost = billable ? getToolCost(TOOL, 0) : 0;
  if (billable) {
    await deductToolCredits(
      accountId,
      TOOL,
      0,
      `On-chain fact check: ${tokenAddress} on ${chain}`,
      request.session_id,
    ).catch((e) => logger.warn('[onchain-fact-check] billing failure', { error: String(e) }));
  }

  return c.json({
    success: true,
    status: result.status,
    risk_level: result.riskLevel,
    risk_factors: result.riskFactors,
    net_outflow_pct: result.netOutflowPct,
    largest_wallet_outflow_pct: result.largestWalletOutflowPct,
    wallets_checked: result.walletsChecked,
    transfer_count: result.transferCount,
    source: result.source,
    checked_at: result.checkedAt,
    cache_status: cacheStatus,
    evidence: result.evidence,
    cost,
  });
});
