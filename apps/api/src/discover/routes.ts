import { Hono } from 'hono';
import { desc } from 'drizzle-orm';
import { db } from '../shared/db';
import { discoverFeeds } from '@epsilon/db';
import { logger } from '../lib/logger';

const discoverApp = new Hono();

const PAGE_SIZE = 50;
const MAX_OFFSET = 1000;
const CACHE_MAX_AGE_SECONDS = 60;

function clampOffset(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_OFFSET);
}

discoverApp.get('/', async (c) => {
  try {
    const offset = clampOffset(c.req.query('offset'));

    const items = await db
      .select({
        id: discoverFeeds.id,
        title: discoverFeeds.title,
        summary: discoverFeeds.summary,
        timestamp: discoverFeeds.timestamp,
        isAnomaly: discoverFeeds.isAnomaly,
        warningLevel: discoverFeeds.warningLevel,
        sources: discoverFeeds.sources,
      })
      .from(discoverFeeds)
      .orderBy(desc(discoverFeeds.timestamp))
      .limit(PAGE_SIZE)
      .offset(offset);

    const nextOffset = items.length === PAGE_SIZE ? offset + PAGE_SIZE : null;

    c.header('Cache-Control', `public, max-age=${CACHE_MAX_AGE_SECONDS}`);
    return c.json({ items, pagination: { offset, limit: PAGE_SIZE, nextOffset } });
  } catch (err) {
    logger.error('[discover] feed query failed', { error: String(err) });
    return c.json({ error: 'feed_unavailable' }, 503);
  }
});

export { discoverApp };
