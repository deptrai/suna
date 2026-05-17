import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { and, desc, gte, eq } from 'drizzle-orm';
import { db } from '../../shared/db';
import { mempoolAlerts } from '@epsilon/db';
import { checkCredits, deductToolCredits } from '../services/billing';
import { getToolCost } from '../../config';
import type { AppContext } from '../../types';

const TOOL = 'mempool_alerts';

// Alert type enum mirrors the classifier output (see services/mempool.ts).
const ALERT_TYPES = ['large_swap', 'sandwich_suspect', 'frontrun_suspect', 'unknown_large_tx'] as const;

const querySchema = z.object({
  chain: z.string().min(1).max(32).optional(),
  alert_type: z.enum(ALERT_TYPES).optional(),
  // .finite() rejects "Infinity" / "NaN" which otherwise coerce successfully and
  // produce a misleading zero-row filter against Postgres numeric.
  min_value_usd: z.coerce.number().finite().min(0).optional(),
  limit: z.coerce.number().int().min(1).optional().default(50),
  since_minutes: z.coerce.number().int().min(1).optional().default(60),
  session_id: z.string().max(128).regex(/^[A-Za-z0-9_-]+$/).optional(),
});

export const mempoolAlertsRoute = new Hono<{ Variables: AppContext }>();

mempoolAlertsRoute.get('/', async (c) => {
  const accountId = c.get('accountId');
  const parsed = querySchema.safeParse(c.req.query());
  if (!parsed.success) {
    // .flatten() returns a cleaner, single-line-friendly error shape than `.message`.
    return c.json({ success: false, error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { chain, alert_type, min_value_usd, limit, since_minutes, session_id } = parsed.data;

  // NFR8: atomic check-before-deduct billing parity with token-* routes (D1 resolution).
  const creditCheck = await checkCredits(accountId);
  if (!creditCheck.hasCredits) throw new HTTPException(402, { message: 'Insufficient credits' });

  const safeSinceMinutes = Math.min(since_minutes, 1440);
  const since = new Date(Date.now() - safeSinceMinutes * 60_000);

  const filters = [gte(mempoolAlerts.detectedAt, since)];
  if (chain) filters.push(eq(mempoolAlerts.chain, chain.toLowerCase()));
  // alert_type comes from a strict enum — lowercase normalisation is implicit, but
  // still guard via Zod enum constraint above.
  if (alert_type) filters.push(eq(mempoolAlerts.alertType, alert_type));
  if (typeof min_value_usd === 'number') {
    filters.push(gte(mempoolAlerts.estimatedValueUsd, String(min_value_usd)));
  }

  const rows = await db
    .select({
      id: mempoolAlerts.id,
      chain: mempoolAlerts.chain,
      provider: mempoolAlerts.provider,
      txHash: mempoolAlerts.txHash,
      fromAddress: mempoolAlerts.fromAddress,
      toAddress: mempoolAlerts.toAddress,
      routerAddress: mempoolAlerts.routerAddress,
      methodSelector: mempoolAlerts.methodSelector,
      alertType: mempoolAlerts.alertType,
      estimatedValueUsd: mempoolAlerts.estimatedValueUsd,
      nativeValueWei: mempoolAlerts.nativeValueWei,
      gasLimit: mempoolAlerts.gasLimit,
      chainId: mempoolAlerts.chainIdHex,
      gasPriceWei: mempoolAlerts.gasPriceWei,
      status: mempoolAlerts.status,
      detectedAt: mempoolAlerts.detectedAt,
      updatedAt: mempoolAlerts.updatedAt,
    })
    .from(mempoolAlerts)
    .where(and(...filters))
    .orderBy(desc(mempoolAlerts.detectedAt))
    .limit(Math.min(limit, 100));

  const cost = getToolCost(TOOL, rows.length);
  try {
    await deductToolCredits(accountId, TOOL, rows.length, `Mempool alerts query: ${rows.length} rows`, session_id);
  } catch (e) {
    console.warn(`[EPSILON][billing-failure] tool=${TOOL} account=${accountId} err=${e instanceof Error ? e.message : String(e)}`);
  }

  return c.json({
    success: true,
    cost,
    alerts: rows.map((r) => ({
      ...r,
      // Defensive: detectedAt/updatedAt are NOT NULL in schema, but guard against
      // a future migration regression rather than crashing the entire route.
      detectedAt: r.detectedAt ? r.detectedAt.toISOString() : null,
      updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    })),
    count: rows.length,
    source: 'db',
  });
});
