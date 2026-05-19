import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routeSource = readFileSync(
  join(process.cwd(), 'src/router/routes/vibe-trading.ts'),
  'utf8',
);
const multiSection = routeSource.slice(routeSource.indexOf("vibeTrading.post('/backtest-multi'"));

describe('story 5.9 backtest-multi route source checks', () => {
  test('validates strategies.length within [2, 5] returning 400', () => {
    expect(routeSource).toContain('between 2 and 5 strategies required');
    expect(routeSource).toContain('if (count < 2 || count > 5)');
  });

  test('uses Promise.allSettled for fan-out', () => {
    expect(routeSource).toContain('Promise.allSettled');
    expect(routeSource).not.toContain('Promise.all(');
  });

  test('returns 402 with needed/have credits before any VT call', () => {
    expect(routeSource).toContain('Insufficient credits for ${count} strategies (need ${totalCost}, have ${available})');
    const checkIdx = routeSource.indexOf('const credit = await checkCredits(accountId);');
    const settleIdx = routeSource.indexOf('const settled = await Promise.allSettled');
    expect(checkIdx).toBeGreaterThan(-1);
    expect(settleIdx).toBeGreaterThan(-1);
    expect(checkIdx).toBeLessThan(settleIdx);
  });

  test('deducts credits after at least one successful submit', () => {
    const guardIdx = multiSection.indexOf('if (successCount === 0)');
    const deductIdx = multiSection.indexOf('await deductToolCredits(');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(deductIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(deductIdx);
    expect(multiSection).toContain('Multi-strategy backtest: ${count}');
  });

  test('returns submit_failed for per-strategy failures without aborting siblings', () => {
    expect(routeSource).toContain("status: 'submit_failed' as const");
    expect(routeSource).toContain("item.reason instanceof Error ? item.reason.message : 'Submit failed'");
  });
});
