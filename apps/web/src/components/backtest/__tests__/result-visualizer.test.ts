import { describe, test, expect } from 'bun:test';
import {
  formatPercent,
  formatNumber,
  sentiment,
  buildEquityCurve,
  hasMetrics,
  hasBenchmark,
  classifyResultBranch,
} from '../result-visualizer.utils';
import type { RunResponse } from '@/lib/backtest-api';

// ── formatPercent ─────────────────────────────────────────────────────────────

describe('formatPercent', () => {
  test('positive number → "X.XX%"', () => {
    expect(formatPercent(0.1234)).toBe('12.34%');
  });
  test('zero → "0.00%"', () => {
    expect(formatPercent(0)).toBe('0.00%');
  });
  test('negative number formats with sign', () => {
    expect(formatPercent(-0.05)).toBe('-5.00%');
  });
  test('string-encoded number parsed', () => {
    expect(formatPercent('0.42')).toBe('42.00%');
  });
  test('undefined → "—"', () => {
    expect(formatPercent(undefined)).toBe('—');
  });
  test('null → "—"', () => {
    expect(formatPercent(null)).toBe('—');
  });
  test('unparseable string → "—"', () => {
    expect(formatPercent('not-a-number')).toBe('—');
  });
});

// ── formatNumber ──────────────────────────────────────────────────────────────

describe('formatNumber', () => {
  test('default 2 decimals', () => {
    expect(formatNumber(1.234567)).toBe('1.23');
  });
  test('custom decimals', () => {
    expect(formatNumber(1.234567, 4)).toBe('1.2346');
  });
  test('integer with default decimals', () => {
    expect(formatNumber(5)).toBe('5.00');
  });
  test('string number parsed', () => {
    expect(formatNumber('3.14')).toBe('3.14');
  });
  test('null → "—"', () => {
    expect(formatNumber(null)).toBe('—');
  });
  test('NaN string → "—"', () => {
    expect(formatNumber('abc')).toBe('—');
  });
});

// ── sentiment ────────────────────────────────────────────────────────────────

describe('sentiment', () => {
  test('positive number → "positive"', () => {
    expect(sentiment(1.5)).toBe('positive');
  });
  test('negative number → "negative"', () => {
    expect(sentiment(-0.3)).toBe('negative');
  });
  test('zero → "neutral"', () => {
    expect(sentiment(0)).toBe('neutral');
  });
  test('inverted: positive max_drawdown → "negative"', () => {
    // max_drawdown=0.15 is a 15% loss, which is bad — should sentiment as negative
    expect(sentiment(0.15, true)).toBe('negative');
  });
  test('inverted: negative max_drawdown → "positive"', () => {
    // synthetic case: negative DD means strategy never dropped — positive outcome
    expect(sentiment(-0.05, true)).toBe('positive');
  });
  test('inverted zero stays neutral', () => {
    expect(sentiment(0, true)).toBe('neutral');
  });
  test('undefined → "neutral"', () => {
    expect(sentiment(undefined)).toBe('neutral');
  });
  test('NaN string → "neutral"', () => {
    expect(sentiment('x')).toBe('neutral');
  });
  test('string-encoded positive → "positive"', () => {
    expect(sentiment('0.42')).toBe('positive');
  });
});

// ── buildEquityCurve ──────────────────────────────────────────────────────────

describe('buildEquityCurve', () => {
  test('empty/missing input → []', () => {
    expect(buildEquityCurve(null)).toEqual([]);
    expect(buildEquityCurve(undefined)).toEqual([]);
    expect(buildEquityCurve([])).toEqual([]);
  });

  test('canonical shape: timestamp + value', () => {
    const out = buildEquityCurve([
      { timestamp: '2026-01-01T00:00:00Z', value: 10000, benchmark: 9500 },
      { timestamp: '2026-02-01T00:00:00Z', value: 10500, benchmark: 9700 },
    ]);
    expect(out).toEqual([
      { date: '2026-01-01', strategy: 10000, benchmark: 9500 },
      { date: '2026-02-01', strategy: 10500, benchmark: 9700 },
    ]);
  });

  test('legacy alias: strategy + benchmark (no `value`)', () => {
    const out = buildEquityCurve([
      { timestamp: '2026-01-01', strategy: 1000, benchmark: 950 },
    ]);
    expect(out[0]).toEqual({ date: '2026-01-01', strategy: 1000, benchmark: 950 });
  });

  test('legacy alias: equity (no `value` or `strategy`)', () => {
    const out = buildEquityCurve([{ timestamp: '2026-01-01', equity: 500 }]);
    expect(out[0]).toEqual({ date: '2026-01-01', strategy: 500, benchmark: 0 });
  });

  test('alternate timestamp aliases: date and time', () => {
    expect(buildEquityCurve([{ date: '2026-03-01', value: 1 }])[0].date).toBe('2026-03-01');
    expect(buildEquityCurve([{ time: '2026-04-01', value: 1 }])[0].date).toBe('2026-04-01');
  });

  test('missing benchmark → 0', () => {
    const out = buildEquityCurve([{ timestamp: '2026-01-01', value: 100 }]);
    expect(out[0].benchmark).toBe(0);
  });

  test('string-encoded numerics parsed', () => {
    const out = buildEquityCurve([{ timestamp: '2026-01-01', value: '1500.5', benchmark: '1400' }]);
    expect(out[0]).toEqual({ date: '2026-01-01', strategy: 1500.5, benchmark: 1400 });
  });

  test('NaN-producing input degrades to 0 (no crash)', () => {
    const out = buildEquityCurve([{ timestamp: '2026-01-01', value: 'oops', benchmark: 'oops' }]);
    expect(out[0]).toEqual({ date: '2026-01-01', strategy: 0, benchmark: 0 });
  });

  test('non-object items degrade gracefully', () => {
    const out = buildEquityCurve([null as unknown as Record<string, unknown>, 42 as unknown as Record<string, unknown>]);
    expect(out).toEqual([
      { date: '', strategy: 0, benchmark: 0 },
      { date: '', strategy: 0, benchmark: 0 },
    ]);
  });

  test('truncates ISO timestamp to YYYY-MM-DD', () => {
    const out = buildEquityCurve([{ timestamp: '2026-01-15T12:34:56.789Z', value: 1 }]);
    expect(out[0].date).toBe('2026-01-15');
  });

  test('numeric epoch seconds → YYYY-MM-DD', () => {
    // 1735689600 = 2025-01-01T00:00:00Z
    const out = buildEquityCurve([{ time: 1735689600, value: 100 }]);
    expect(out[0].date).toBe('2025-01-01');
  });

  test('numeric epoch milliseconds → YYYY-MM-DD', () => {
    // 1735689600000 = 2025-01-01T00:00:00Z
    const out = buildEquityCurve([{ time: 1735689600000, value: 100 }]);
    expect(out[0].date).toBe('2025-01-01');
  });

  test('non-finite numeric timestamp degrades to empty date', () => {
    const out = buildEquityCurve([{ time: NaN, value: 100 }]);
    expect(out[0].date).toBe('');
  });
});

// ── hasMetrics ────────────────────────────────────────────────────────────────

describe('hasMetrics', () => {
  test('non-empty object → true', () => {
    expect(hasMetrics({ sharpe: 1.2 })).toBe(true);
  });
  test('empty object → false', () => {
    expect(hasMetrics({})).toBe(false);
  });
  test('null → false', () => {
    expect(hasMetrics(null)).toBe(false);
  });
  test('undefined → false', () => {
    expect(hasMetrics(undefined)).toBe(false);
  });
});

// ── hasBenchmark ─────────────────────────────────────────────────────────────

describe('hasBenchmark', () => {
  test('empty curve → false', () => {
    expect(hasBenchmark([])).toBe(false);
  });
  test('all zero benchmarks → false', () => {
    expect(
      hasBenchmark([
        { date: 'd', strategy: 1, benchmark: 0 },
        { date: 'd', strategy: 1, benchmark: 0 },
      ]),
    ).toBe(false);
  });
  test('any positive benchmark → true', () => {
    expect(
      hasBenchmark([
        { date: 'd', strategy: 1, benchmark: 0 },
        { date: 'd', strategy: 1, benchmark: 100 },
      ]),
    ).toBe(true);
  });
});

// ── classifyResultBranch ─────────────────────────────────────────────────────

describe('classifyResultBranch', () => {
  const base: Pick<RunResponse, 'success' | 'run_id'> = { success: true, run_id: 'r1' };

  test('status=failed → "failed"', () => {
    expect(classifyResultBranch({ ...base, status: 'failed' })).toBe('failed');
  });

  test('metrics present → "phase-b"', () => {
    expect(
      classifyResultBranch({
        ...base,
        status: 'success',
        metrics: { sharpe: 1.2 },
      }),
    ).toBe('phase-b');
  });

  test('equity_curve present → "phase-b" even without metrics', () => {
    expect(
      classifyResultBranch({
        ...base,
        status: 'success',
        equity_curve: [{ timestamp: '2026-01-01', value: 100 }],
      }),
    ).toBe('phase-b');
  });

  test('only data_summary → "phase-a"', () => {
    expect(
      classifyResultBranch({
        ...base,
        status: 'unknown',
        data_summary: { 'BTC-USDT': { rows_fetched: 540 } },
      }),
    ).toBe('phase-a');
  });

  test('nothing → "empty"', () => {
    expect(classifyResultBranch({ ...base, status: 'unknown' })).toBe('empty');
  });

  test('failed takes precedence over metrics', () => {
    // If somehow both are set, failed wins (UI shows error, not partial chart)
    expect(
      classifyResultBranch({
        ...base,
        status: 'failed',
        metrics: { sharpe: 1.2 },
      }),
    ).toBe('failed');
  });
});
