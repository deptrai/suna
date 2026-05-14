import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../../shared/db';
import { tokenSocialSignals } from '@epsilon/db';
import { eq, desc, and } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

const narratives = new Hono();

const VALID_NARRATIVES = ['ai', 'rwa', 'memes', 'depin', 'gaming', 'l1', 'l2', 'defi', 'privacy', 'other'] as const;
type NarrativeCategory = typeof VALID_NARRATIVES[number];

const QuerySchema = z.object({
  narrative: z.enum(VALID_NARRATIVES).optional(),
  alpha_only: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  limit: z.string().optional().transform((v) => {
    if (!v) return 20;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 20;
  }),
});

narratives.get('/', async (c) => {
  const raw = {
    narrative: c.req.query('narrative'),
    alpha_only: c.req.query('alpha_only'),
    limit: c.req.query('limit'),
  };

  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: `Validation error: ${parsed.error.message}` });
  }

  const { narrative, alpha_only, limit } = parsed.data;

  try {
    const conditions = [];
    if (narrative) conditions.push(eq(tokenSocialSignals.narrative, narrative));
    if (alpha_only) conditions.push(eq(tokenSocialSignals.isAlphaSignal, true));

    const rows = await db
      .select()
      .from(tokenSocialSignals)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tokenSocialSignals.socialVolumeChange24hPct))
      .limit(limit);

    const mapRow = (row: typeof rows[number]) => ({
      slug: row.slug,
      symbol: row.symbol,
      narrative: row.narrative,
      social_volume_24h: row.socialVolume24h != null ? parseFloat(row.socialVolume24h) : null,
      social_volume_change_24h_pct: row.socialVolumeChange24hPct != null ? parseFloat(row.socialVolumeChange24hPct) : null,
      social_dominance_pct: row.socialDominancePct != null ? parseFloat(row.socialDominancePct) : null,
      sentiment_score: row.sentimentScore != null ? parseFloat(row.sentimentScore) : null,
      price_usd: row.priceUsd != null ? parseFloat(row.priceUsd) : null,
      price_change_24h_pct: row.priceChange24hPct != null ? parseFloat(row.priceChange24hPct) : null,
      is_alpha_signal: row.isAlphaSignal,
      fetched_at: row.fetchedAt,
    });

    const fetched_at = rows.length > 0 ? rows[0]!.fetchedAt : null;

    if (narrative) {
      c.header('Cache-Control', 'public, max-age=300');
      return c.json({
        narrative,
        tokens: rows.map(mapRow),
        source: 'db_cache',
        fetched_at,
      });
    }

    // Group by narrative when no filter
    const grouped: Partial<Record<NarrativeCategory, ReturnType<typeof mapRow>[]>> = {};
    const alpha_signals: ReturnType<typeof mapRow>[] = [];

    for (const row of rows) {
      const mapped = mapRow(row);
      const cat = row.narrative as NarrativeCategory;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat]!.push(mapped);
      if (row.isAlphaSignal) alpha_signals.push(mapped);
    }

    c.header('Cache-Control', 'public, max-age=300');
    return c.json({
      narratives: grouped,
      alpha_signals,
      source: 'db_cache',
      fetched_at,
    });
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    return c.json({ success: false, error: 'narratives_unavailable' }, 503);
  }
});

export { narratives };
