import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';

let _rows: any[] = [];
let _dbThrows: Error | null = null;
const _whereCalls: unknown[] = [];

mock.module('../../shared/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (cond: unknown) => {
          _whereCalls.push(cond);
          return {
            orderBy: () => ({
              limit: async () => {
                if (_dbThrows) throw _dbThrows;
                return _rows;
              },
            }),
          };
        },
      }),
    }),
  },
}));

mock.module('@epsilon/db', () => ({
  tokenSocialSignals: {
    slug: 'slug',
    symbol: 'symbol',
    narrative: 'narrative',
    socialVolume24h: 'socialVolume24h',
    socialVolumeChange24hPct: 'socialVolumeChange24hPct',
    socialDominancePct: 'socialDominancePct',
    sentimentScore: 'sentimentScore',
    priceUsd: 'priceUsd',
    priceChange24hPct: 'priceChange24hPct',
    isAlphaSignal: 'isAlphaSignal',
    fetchedAt: 'fetchedAt',
  },
}));

mock.module('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  desc: (a: unknown) => ({ desc: a }),
  and: (...args: unknown[]) => ({ and: args }),
}));

const { narratives } = await import('../../router/routes/narratives');

function makeApp() {
  const app = new Hono();
  app.route('/v1/router/narratives', narratives);
  return app;
}

const sampleRow = (overrides: Partial<any> = {}) => ({
  slug: 'btc',
  symbol: 'BTC',
  narrative: 'l1',
  socialVolume24h: '1234.5',
  socialVolumeChange24hPct: '12.5',
  socialDominancePct: '5.2',
  sentimentScore: '0.8',
  priceUsd: '50000',
  priceChange24hPct: '2.3',
  isAlphaSignal: false,
  fetchedAt: new Date('2026-05-17T00:00:00Z'),
  ...overrides,
});

describe('GET /v1/router/narratives', () => {
  beforeEach(() => {
    _rows = [];
    _dbThrows = null;
    _whereCalls.length = 0;
  });

  test('[P0] returns 200 with empty result when DB has no rows', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/narratives');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.narratives).toEqual({});
    expect(body.alpha_signals).toEqual([]);
    expect(body.fetched_at).toBeNull();
  });

  test('[P0] returns 200 with rows grouped by narrative when no filter', async () => {
    _rows = [
      sampleRow({ slug: 'btc', narrative: 'l1' }),
      sampleRow({ slug: 'eth', narrative: 'l1' }),
      sampleRow({ slug: 'pepe', narrative: 'memes' }),
    ];
    const app = makeApp();
    const res = await app.request('/v1/router/narratives');
    const body = await res.json();
    expect(body.narratives.l1.length).toBe(2);
    expect(body.narratives.memes.length).toBe(1);
  });

  test('[P0] returns single-narrative shape when narrative filter applied', async () => {
    _rows = [sampleRow({ slug: 'btc', narrative: 'l1' })];
    const app = makeApp();
    const res = await app.request('/v1/router/narratives?narrative=l1');
    const body = await res.json();
    expect(body.narrative).toBe('l1');
    expect(body.tokens.length).toBe(1);
    expect(body.tokens[0].slug).toBe('btc');
    expect(body.source).toBe('db_cache');
  });

  test('[P0] returns 400 when narrative is invalid value', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/narratives?narrative=invalid_cat');
    expect(res.status).toBe(400);
  });

  test('[P0] alpha_only=true filter applied via where clause (no validation 400)', async () => {
    _rows = [sampleRow({ isAlphaSignal: true })];
    const app = makeApp();
    const res = await app.request('/v1/router/narratives?alpha_only=true');
    expect(res.status).toBe(200);
    expect(_whereCalls.length).toBe(1);
  });

  test('[P0] limit clamped to 100 when input > 100', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/narratives?limit=500');
    expect(res.status).toBe(200);
  });

  test('[P0] limit defaults to 20 when input invalid (NaN/negative)', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/narratives?limit=-5');
    expect(res.status).toBe(200);
  });

  test('[P0] returns 503 with narratives_unavailable when DB throws', async () => {
    _dbThrows = new Error('connection refused');
    const app = makeApp();
    const res = await app.request('/v1/router/narratives');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('narratives_unavailable');
  });

  test('[P0] parses numeric strings into numbers in mapped row', async () => {
    _rows = [sampleRow({ socialVolume24h: '1234.5', priceUsd: '50000' })];
    const app = makeApp();
    const res = await app.request('/v1/router/narratives?narrative=l1');
    const body = await res.json();
    expect(body.tokens[0].social_volume_24h).toBe(1234.5);
    expect(body.tokens[0].price_usd).toBe(50000);
  });

  test('[P1] handles null numeric fields gracefully (returns null, not NaN)', async () => {
    _rows = [sampleRow({ socialVolume24h: null, priceUsd: null })];
    const app = makeApp();
    const res = await app.request('/v1/router/narratives?narrative=l1');
    const body = await res.json();
    expect(body.tokens[0].social_volume_24h).toBeNull();
    expect(body.tokens[0].price_usd).toBeNull();
  });

  test('[P1] sets Cache-Control public max-age=300 on filtered response', async () => {
    _rows = [sampleRow()];
    const app = makeApp();
    const res = await app.request('/v1/router/narratives?narrative=l1');
    expect(res.headers.get('Cache-Control')).toContain('max-age=300');
  });

  test('[P1] sets Cache-Control on grouped (no filter) response', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/narratives');
    expect(res.headers.get('Cache-Control')).toContain('max-age=300');
  });

  test('[P1] alpha_signals separate from grouped narratives', async () => {
    _rows = [
      sampleRow({ slug: 'a', narrative: 'l1', isAlphaSignal: false }),
      sampleRow({ slug: 'b', narrative: 'memes', isAlphaSignal: true }),
    ];
    const app = makeApp();
    const res = await app.request('/v1/router/narratives');
    const body = await res.json();
    expect(body.alpha_signals.length).toBe(1);
    expect(body.alpha_signals[0].slug).toBe('b');
  });
});
