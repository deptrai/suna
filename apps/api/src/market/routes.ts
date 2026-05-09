import { Hono } from 'hono';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../shared/db';
import { onChainDataIndex } from '@epsilon/db';
import { logger } from '../lib/logger';
import type { ProtocolMetrics, SmartMoneyMovement } from '@epsilon/shared';
import { z } from 'zod';

const marketApp = new Hono();

const ProtocolMetricsSchema = z.object({
  id: z.string(),
  name: z.string(),
  symbol: z.string(),
  tvl: z.number(),
  apy7d: z.number(),
  apy30d: z.number(),
  chain: z.string(),
  change24h: z.number(),
  sparkline7d: z.array(z.number()),
});

const SmartMoneyMovementSchema = z.object({
  id: z.string(),
  walletAddress: z.string(),
  tokenAddress: z.string().nullish(),
  tokenSymbol: z.string(),
  amount: z.number(),
  amountUsd: z.number(),
  direction: z.enum(['inflow', 'outflow']),
  timestamp: z.string(),
});

const CACHE_MAX_AGE_SECONDS = 60;
const PROTOCOLS_LIMIT = 50;
const SMART_MONEY_LIMIT = 50;

marketApp.get('/protocols', async (c) => {
  try {
    // DISTINCT ON ((metric_value->>'id')) to dedupe per-protocol — keep latest tick per protocol
    // ordered by timestamp desc.
    const items = await db
      .select({
        id: onChainDataIndex.id,
        metricValue: onChainDataIndex.metricValue,
      })
      .from(onChainDataIndex)
      .where(eq(onChainDataIndex.metricName, 'protocol_metrics'))
      .orderBy(
        sql`(${onChainDataIndex.metricValue}->>'id')`,
        desc(onChainDataIndex.timestamp),
      )
      .limit(PROTOCOLS_LIMIT * 4);

    const seen = new Set<string>();
    const protocols: ProtocolMetrics[] = [];
    let dropped = 0;

    for (const item of items) {
      const parsed = ProtocolMetricsSchema.safeParse(item.metricValue);
      if (!parsed.success) {
        dropped += 1;
        continue;
      }
      if (seen.has(parsed.data.id)) continue;
      seen.add(parsed.data.id);
      protocols.push(parsed.data);
      if (protocols.length >= PROTOCOLS_LIMIT) break;
    }

    if (dropped > 0) {
      logger.warn('[market] protocols schema-drift rows dropped', { dropped, total: items.length });
    }

    c.header('Cache-Control', `private, max-age=${CACHE_MAX_AGE_SECONDS}`);
    return c.json({ items: protocols });
  } catch (err) {
    logger.error('[market] protocols query failed', { error: String(err) });
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

marketApp.get('/smart-money', async (c) => {
  try {
    const items = await db
      .select({
        id: onChainDataIndex.id,
        metricValue: onChainDataIndex.metricValue,
      })
      .from(onChainDataIndex)
      .where(eq(onChainDataIndex.metricName, 'smart_money_movement'))
      .orderBy(desc(onChainDataIndex.timestamp))
      .limit(SMART_MONEY_LIMIT);

    const movements: SmartMoneyMovement[] = [];
    let dropped = 0;

    for (const item of items) {
      const parsed = SmartMoneyMovementSchema.safeParse(item.metricValue);
      if (!parsed.success) {
        dropped += 1;
        continue;
      }
      movements.push(parsed.data);
    }

    if (dropped > 0) {
      logger.warn('[market] smart-money schema-drift rows dropped', { dropped, total: items.length });
    }

    c.header('Cache-Control', `private, max-age=${CACHE_MAX_AGE_SECONDS}`);
    return c.json({ items: movements });
  } catch (err) {
    logger.error('[market] smart-money query failed', { error: String(err) });
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});

export { marketApp };
