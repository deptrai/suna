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

  test('atomic pre-deduct happens BEFORE Promise.allSettled (matches spec AC2 + Story 5.5 parity)', () => {
    // Route uses deductCreditsRepo (alias for deductCredits from repositories/credits)
    // pre-deduct must execute before the fan-out so concurrent multi-backtests cannot
    // both pass the snapshot gate.
    const deductIdx = multiSection.indexOf('await deductCreditsRepo(');
    const settleIdx = multiSection.indexOf('await Promise.allSettled');
    expect(deductIdx).toBeGreaterThan(-1);
    expect(settleIdx).toBeGreaterThan(-1);
    expect(deductIdx).toBeLessThan(settleIdx);
    expect(multiSection).toContain('Multi-strategy backtest: ${count}');
  });

  test('refunds via refundCreditsRepo on all-fail (close the billing-orphan loophole)', () => {
    expect(multiSection).toContain('if (successCount === 0)');
    expect(multiSection).toContain('await refundCreditsRepo(');
    expect(multiSection).toContain('billing-orphan');
  });

  test('returns submit_failed for per-strategy failures without aborting siblings', () => {
    expect(routeSource).toContain("status: 'submit_failed' as const");
    expect(routeSource).toContain("item.reason instanceof Error ? item.reason.message : 'Submit failed'");
  });

  test('sanitizes tab_id before echoing into 400 error message (no log/header injection)', () => {
    // tab_id is user-supplied; the error path strips control chars and clamps length.
    expect(multiSection).toContain("replace(/[\\r\\n\\t]/g, ' ')");
    expect(multiSection).toContain('.slice(0, 64)');
  });
});
