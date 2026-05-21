import { describe, expect, test } from 'bun:test';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { proposeBacktestStrategies } from '@/router/services/vibe-trading';

// Resolve relative to this test file (not process.cwd()) so the suite passes when
// `bun test` is invoked from repo root or apps/api.
const here = dirname(fileURLToPath(import.meta.url));
const apiSrc = join(here, '..', '..');
const routeSource = readFileSync(join(apiSrc, 'router/routes/vibe-trading.ts'), 'utf8');
const serviceSource = readFileSync(join(apiSrc, 'router/services/vibe-trading.ts'), 'utf8');

describe('story 5.9.1 propose-multi route source checks', () => {
  test('count in [2,5] + required + bounded session_id schema exist', () => {
    expect(routeSource).toContain('ProposeMultiBacktestSchema');
    expect(routeSource).toContain('count: z.number().int().min(2).max(5).optional()');
    // session_id is required AND bounded (charset + max length) — was previously unbounded
    // `min(1)`. Story 5.9.1 review patch.
    expect(routeSource).toMatch(/session_id:\s*z\.string\(\)\.min\(1\)\.max\(128\)\.regex/);
  });

  test('no billing calls in propose route (proposal generation is free)', () => {
    const start = routeSource.indexOf("vibeTrading.post('/propose-multi'");
    const end = routeSource.indexOf("vibeTrading.get('/runs/:jobId'");
    const section = routeSource.slice(start, end > start ? end : undefined);
    expect(section).not.toContain('deductCreditsRepo');
    expect(section).not.toContain('deductToolCredits');
  });

  test('propose route does NOT 403 on tier (tier1 can propose for discoverability)', () => {
    const start = routeSource.indexOf("vibeTrading.post('/propose-multi'");
    const end = routeSource.indexOf("vibeTrading.get('/runs/:jobId'");
    const section = routeSource.slice(start, end > start ? end : undefined);
    // Propose route only resolves tier to populate caller_tier in response; no 403.
    expect(section).not.toMatch(/tier\s*!==\s*'tier2'/);
  });

  test('/backtest-multi route DOES tier-gate at server (defense in depth — Story 5.9.1 D2a)', () => {
    const start = routeSource.indexOf("vibeTrading.post('/backtest-multi'");
    const end = routeSource.indexOf("vibeTrading.post('/propose-multi'");
    const section = routeSource.slice(start, end > start ? end : undefined);
    expect(section).toContain("tier !== 'tier2' && tier !== 'tier3'");
    expect(section).toContain('Multi-strategy backtest requires Tier 2');
  });

  test('rate limit: window, max, 429+Retry-After, fallback key + Map eviction present', () => {
    expect(routeSource).toContain('const proposeRouteRateLimit = new Map<string, number[]>()');
    expect(routeSource).toContain('PROPOSE_RATE_LIMIT_WINDOW_MS = 60_000');
    expect(routeSource).toContain('PROPOSE_RATE_LIMIT_MAX = 10');
    expect(routeSource).toContain("c.header('Retry-After', '60')");
    expect(routeSource).toContain('}, 429)');
    // accountId→userId fallback prevents all web (Supabase-JWT) users from sharing one bucket.
    expect(routeSource).toContain('accountId || userId');
    // Map eviction prevents unbounded growth of stale keys.
    expect(routeSource).toContain('proposeRouteRateLimit.delete');
  });

  test('error path logs before returning generic 503', () => {
    // Bare `catch {}` previously masked template/schema bugs as "temporarily unavailable".
    // Patch ensures the real error is logged so ops can debug.
    expect(routeSource).toMatch(/catch\s*\(\s*err\s*\)\s*\{[\s\S]*?console\.error\([^)]*propose-multi/);
  });

  test('service branch for revise_tab_id behaviorally returns a SINGLE proposal', () => {
    // Source-presence assertion (cheap):
    expect(serviceSource).toContain('args.revise_tab_id');
    // Behavioral assertion (the actual contract):
    const result = proposeBacktestStrategies({
      asset: 'BTC-USDT',
      count: 3,
      hint: 'more conservative',
      revise_tab_id: 'strat-xyz',
      timeframe: '4h',
      caller_tier: 'tier2',
    });
    expect(result.proposals.length).toBe(1);
    expect(result.proposals[0].tab_id).toBe('strat-xyz');
  });
});
