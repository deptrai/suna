import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { EVM_ADDRESS } from '@epsilon/shared';
import { db } from '../../shared/db';
import { entityWalletLabels, tokenHolderEntityRisks } from '@epsilon/db';
import { eq, and } from 'drizzle-orm';
import { widgetCacheKey, cacheGet, cacheSet } from '../services/widget-cache';
import { checkCredits, deductToolCredits } from '../services/billing';
import { riskScoreToLevel } from '../services/arkham';
import { getToolCost, config } from '../../config';
import { getEntityWalletQueue } from '../../queue';
import { logger } from '../../lib/logger';
import type { AppContext } from '../../types';

const TOOL = 'entity_wallet_risk';
const TTL_MS = 3_600_000; // 1h in-memory cache on top of DB

const SESSION_ID = z
  .string()
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'session_id must be alphanumeric/dash/underscore')
  .optional();

const EntityWalletRiskRequestSchema = z.object({
  mode: z.enum(['wallet', 'token_holders']).default('wallet'),
  chain: z.string().max(32).default('ethereum'),
  address: z.string().min(1).max(255).optional(),
  token_address: z.string().min(1).max(255).optional(),
  session_id: SESSION_ID,
});

export const entityWalletRisk = new Hono<{ Variables: AppContext }>();

entityWalletRisk.post('/', async (c) => {
  const accountId = c.get('accountId');

  const body = await c.req.json().catch(() => null);
  if (body === null) throw new HTTPException(400, { message: 'Invalid JSON body' });

  const parseResult = EntityWalletRiskRequestSchema.safeParse(body);
  if (!parseResult.success) {
    throw new HTTPException(400, { message: `Validation error: ${parseResult.error.message}` });
  }

  const { mode, chain, address, token_address, session_id } = parseResult.data;

  if (mode === 'wallet') {
    if (!address) throw new HTTPException(400, { message: 'address is required for wallet mode' });
    if (!EVM_ADDRESS.test(address)) throw new HTTPException(400, { message: 'Invalid EVM address format' });
  } else {
    if (!token_address) throw new HTTPException(400, { message: 'token_address is required for token_holders mode' });
    if (!EVM_ADDRESS.test(token_address)) throw new HTTPException(400, { message: 'Invalid token_address EVM format' });
  }

  const creditCheck = await checkCredits(accountId);
  if (!creditCheck.hasCredits) throw new HTTPException(402, { message: 'Insufficient credits' });

  const lookupAddr = mode === 'wallet' ? address!.toLowerCase() : token_address!.toLowerCase();
  const cacheKey = widgetCacheKey(TOOL, lookupAddr, chain, mode);
  const cached = cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) {
    return c.json({ success: true, stale: false, cache_status: 'cache_fresh', cost: 0, ...cached.data });
  }

  // ─── DB lookup (source of truth) ─────────────────────────────────────────

  if (mode === 'wallet') {
    const rows = await db
      .select()
      .from(entityWalletLabels)
      .where(and(eq(entityWalletLabels.chain, chain), eq(entityWalletLabels.address, lookupAddr)))
      .limit(10);

    if (rows.length > 0) {
      const best = rows.reduce((prev, curr) =>
        (curr.riskScore ?? 0) > (prev.riskScore ?? 0) ? curr : prev,
      );
      const payload = {
        mode: 'wallet',
        chain,
        address: lookupAddr,
        risk_level: riskScoreToLevel(best.riskScore ?? 0),
        risk_score: best.riskScore ?? 0,
        entities: rows.map((r) => ({
          source: r.source,
          entity_id: r.entityId,
          entity_name: r.entityName,
          entity_type: r.entityType,
          tags: r.tags ?? [],
          risk_category: r.riskCategory,
          risk_score: r.riskScore ?? 0,
          fetched_at: r.fetchedAt?.toISOString() ?? null,
        })),
        risk_factors: [],
        source: 'db' as const,
        cache_status: 'db_hit',
        stale: false,
        checked_at: new Date().toISOString(),
      };
      cacheSet(cacheKey, payload, TTL_MS);
      const cost = getToolCost(TOOL, 0);
      await deductToolCredits(accountId, TOOL, 0, `Entity wallet risk: ${lookupAddr} on ${chain}`, session_id).catch((e) =>
        logger.warn('[entity-wallet-risk] billing failure', { error: String(e) }),
      );
      return c.json({ success: true, cost, ...payload });
    }
  } else {
    const [risk] = await db
      .select()
      .from(tokenHolderEntityRisks)
      .where(and(eq(tokenHolderEntityRisks.chain, chain), eq(tokenHolderEntityRisks.tokenAddress, lookupAddr)))
      .limit(1);

    if (risk) {
      const payload = {
        mode: 'token_holders',
        chain,
        token_address: lookupAddr,
        risk_level: risk.riskLevel ?? 'none',
        risk_score: risk.riskScore ?? 0,
        entities: Array.isArray(risk.topEntities) ? risk.topEntities : [],
        risk_factors: Array.isArray(risk.riskFactors) ? risk.riskFactors : [],
        holder_count: risk.holderCount,
        labeled_holder_count: risk.labeledHolderCount,
        risky_holder_count: risk.riskyHolderCount,
        analysis_status: risk.analysisStatus,
        source: 'db' as const,
        cache_status: 'db_hit',
        stale: false,
        checked_at: new Date().toISOString(),
      };
      cacheSet(cacheKey, payload, TTL_MS);
      const cost = getToolCost(TOOL, 0);
      await deductToolCredits(accountId, TOOL, 0, `Token holder risk: ${lookupAddr} on ${chain}`, session_id).catch((e) =>
        logger.warn('[entity-wallet-risk] billing failure', { error: String(e) }),
      );
      return c.json({ success: true, cost, ...payload });
    }
  }

  // ─── Live provider path: enqueue worker job ───────────────────────────────

  const hasDuneFallback = Boolean(config.DUNE_API_KEY && config.DUNE_TOKEN_HOLDERS_QUERY_ID);
  const hasProvider = Boolean(config.ARKHAM_API_KEY) || hasDuneFallback;
  if (!config.ARKHAM_WORKER_ENABLED || !hasProvider) {
    const payload = {
      mode,
      chain,
      ...(mode === 'wallet' ? { address: lookupAddr } : { token_address: lookupAddr }),
      risk_level: 'none' as const,
      risk_score: 0,
      entities: [],
      risk_factors: [],
      source: 'db' as const,
      cache_status: 'unconfigured',
      stale: false,
      checked_at: new Date().toISOString(),
      unconfigured: true,
    };
    return c.json({ success: true, cost: 0, ...payload });
  }

  if (mode === 'token_holders') {
    try {
      const queue = getEntityWalletQueue();
      await queue.add(
        'analyze-token-holders',
        { chain, tokenAddress: lookupAddr },
        { attempts: 2, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: 100 },
      );
    } catch (e) {
      logger.warn('[entity-wallet-risk] enqueue failed', { error: String(e) });
    }
  }

  const pendingPayload = {
    mode,
    chain,
    ...(mode === 'wallet' ? { address: lookupAddr } : { token_address: lookupAddr }),
    risk_level: 'none' as const,
    risk_score: 0,
    entities: [],
    risk_factors: [],
    source: 'db' as const,
    cache_status: mode === 'wallet' ? 'not_indexed' : 'pending',
    stale: false,
    checked_at: new Date().toISOString(),
  };
  return c.json({ success: true, cost: 0, ...pendingPayload });
});
