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

// ─── OHLCV mock endpoint ─────────────────────────────────────────────────────

// Deterministic seeded PRNG so the same token returns the same chart bars
// across requests — required for `Cache-Control: max-age` correctness and
// reproducible tests/snapshots.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashToken(token: string): number {
  let h = 5381;
  for (let i = 0; i < token.length; i++) h = ((h << 5) + h + token.charCodeAt(i)) | 0;
  return h >>> 0;
}

interface OhlcvBar { time: number; open: number; high: number; low: number; close: number; volume: number }

function generateOhlcv(days: number, basePrice: number, seed: number): OhlcvBar[] {
  const rand = mulberry32(seed);
  const bars: OhlcvBar[] = [];
  let price = basePrice;
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;

  for (let i = days - 1; i >= 0; i--) {
    const open = price;
    const change = (rand() - 0.48) * price * 0.04;
    const close = Math.max(open + change, 0.0001);
    const hiRaw = Math.max(open, close) * (1 + rand() * 0.02);
    const loRaw = Math.min(open, close) * (1 - rand() * 0.02);
    const open4 = parseFloat(open.toFixed(4));
    const close4 = parseFloat(close.toFixed(4));
    const hi4 = parseFloat(hiRaw.toFixed(4));
    const lo4 = parseFloat(loRaw.toFixed(4));
    bars.push({
      time: now - i * DAY,
      open: open4,
      high: Math.max(open4, close4, hi4),
      low: Math.min(open4, close4, lo4),
      close: close4,
      volume: Math.floor(rand() * 1_000_000 + 100_000),
    });
    price = close;
  }
  return bars;
}

const TOKEN_PRICES: Record<string, number> = {
  btc: 65000, eth: 3200, sol: 150, bnb: 580, ada: 0.45,
  dot: 7.5, avax: 35, matic: 0.9, link: 14, uni: 9,
};

marketApp.get('/ohlcv/:token', (c) => {
  const token = c.req.param('token').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!token) return c.json({ error: 'invalid token' }, 400);

  const rawDays = Number(c.req.query('days'));
  const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(Math.floor(rawDays), 365) : 90;
  const basePrice = TOKEN_PRICES[token] ?? 1;
  const bars = generateOhlcv(days, basePrice, hashToken(token));
  c.header('Cache-Control', 'private, max-age=300');
  return c.json({ token, items: bars });
});

export { generateOhlcv, hashToken };

export { marketApp };
