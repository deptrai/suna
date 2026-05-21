import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync(
  join(process.cwd(), 'src/router/routes/vibe-trading.ts'),
  'utf8',
);
const serviceSource = readFileSync(
  join(process.cwd(), 'src/router/services/vibe-trading.ts'),
  'utf8',
);

describe('story 5.9.1 propose-multi route source checks', () => {
  test('count in [2,5] + required session_id schema exist', () => {
    expect(routeSource).toContain('ProposeMultiBacktestSchema');
    expect(routeSource).toContain('count: z.number().int().min(2).max(5).optional()');
    expect(routeSource).toContain('session_id: z.string().min(1)');
  });

  test('no tier 403 + no billing calls in propose route', () => {
    const start = routeSource.indexOf("vibeTrading.post('/propose-multi'");
    const end = routeSource.indexOf("vibeTrading.get('/runs/:jobId'");
    const section = routeSource.slice(start, end > start ? end : undefined);
    expect(section).not.toContain('Tier 2 required');
    expect(section).not.toContain('deductCreditsRepo');
    expect(section).not.toContain('deductToolCredits');
  });

  test('rate limit map + 60s + max 10 + 429 retry-after present', () => {
    expect(routeSource).toContain('const proposeRouteRateLimit = new Map<string, number[]>()');
    expect(routeSource).toContain('PROPOSE_RATE_LIMIT_WINDOW_MS = 60_000');
    expect(routeSource).toContain('PROPOSE_RATE_LIMIT_MAX = 10');
    expect(routeSource).toContain("c.header('Retry-After', '60')");
    expect(routeSource).toContain('}, 429)');
  });

  test('service branch for revise_tab_id exists', () => {
    expect(serviceSource).toContain('if (args.revise_tab_id)');
    expect(serviceSource).toContain('tab_id: args.revise_tab_id');
  });
});
