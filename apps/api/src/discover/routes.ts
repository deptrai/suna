import { Hono } from 'hono';
import { desc } from 'drizzle-orm';
import { db } from '../shared/db';
import { discoverFeeds } from '@epsilon/db';
import { logger } from '../lib/logger';

const discoverApp = new Hono();

const FEED_LIMIT = 50;
const CACHE_MAX_AGE_SECONDS = 60;

discoverApp.get('/', async (c) => {
  try {
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
      .limit(FEED_LIMIT);

    c.header('Cache-Control', `public, max-age=${CACHE_MAX_AGE_SECONDS}`);
    return c.json({ items });
  } catch (err) {
    logger.error('[discover] feed query failed', { error: String(err) });
    return c.json({ error: 'feed_unavailable' }, 503);
  }
});

export { discoverApp };
