import { describe, test, expect } from 'bun:test';
import { calcMA, calcRSI, type OhlcvBar } from './chart-indicators';

function bar(time: number, close: number): OhlcvBar {
  return { time, open: close, high: close, low: close, close, volume: 0 };
}

describe('calcMA', () => {
  test('returns empty when bars shorter than period', () => {
    expect(calcMA([bar(1, 10), bar(2, 11)], 5)).toEqual([]);
  });

  test('first MA point starts at index period-1', () => {
    const bars = [1, 2, 3, 4, 5].map((c, i) => bar(i + 1, c));
    const ma = calcMA(bars, 3);
    expect(ma).toHaveLength(3);
    expect(ma[0]).toEqual({ time: 3, value: 2 } as never);
    expect(ma[1]).toEqual({ time: 4, value: 3 } as never);
    expect(ma[2]).toEqual({ time: 5, value: 4 } as never);
  });

  test('rejects zero / negative period', () => {
    expect(calcMA([bar(1, 1)], 0)).toEqual([]);
    expect(calcMA([bar(1, 1)], -1)).toEqual([]);
  });
});

describe('calcRSI', () => {
  test('returns empty when bars shorter than period+1', () => {
    expect(calcRSI([bar(1, 10)], 14)).toEqual([]);
  });

  test('flat market returns RSI = 50 (no NaN)', () => {
    const bars = Array.from({ length: 20 }, (_, i) => bar(i + 1, 100));
    const rsi = calcRSI(bars, 14);
    expect(rsi.length).toBeGreaterThan(0);
    for (const point of rsi) {
      expect(Number.isFinite(point.value as number)).toBe(true);
      expect(point.value).toBe(50);
    }
  });

  test('strictly rising market returns RSI = 100', () => {
    const bars = Array.from({ length: 20 }, (_, i) => bar(i + 1, 100 + i));
    const rsi = calcRSI(bars, 14);
    expect(rsi[0].value).toBe(100);
  });

  test('output values are bounded in [0,100]', () => {
    const bars = Array.from({ length: 30 }, (_, i) => bar(i + 1, 100 + Math.sin(i) * 5));
    const rsi = calcRSI(bars, 14);
    for (const p of rsi) {
      const v = p.value as number;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});
