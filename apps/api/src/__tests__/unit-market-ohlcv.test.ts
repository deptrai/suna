import { describe, test, expect } from 'bun:test';
import { generateOhlcv, hashToken } from '../market/routes';

describe('generateOhlcv', () => {
  test('returns exactly N bars for days=N', () => {
    const bars = generateOhlcv(90, 100, hashToken('btc'));
    expect(bars).toHaveLength(90);
  });

  test('is deterministic for same seed', () => {
    const a = generateOhlcv(30, 100, hashToken('eth'));
    const b = generateOhlcv(30, 100, hashToken('eth'));
    expect(a).toEqual(b);
  });

  test('different tokens produce different bars', () => {
    const a = generateOhlcv(30, 100, hashToken('btc'));
    const b = generateOhlcv(30, 100, hashToken('sol'));
    expect(a).not.toEqual(b);
  });

  test('OHLC invariant low <= open, close <= high', () => {
    const bars = generateOhlcv(180, 65000, hashToken('btc'));
    for (const b of bars) {
      expect(b.low).toBeLessThanOrEqual(b.open);
      expect(b.low).toBeLessThanOrEqual(b.close);
      expect(b.high).toBeGreaterThanOrEqual(b.open);
      expect(b.high).toBeGreaterThanOrEqual(b.close);
    }
  });

  test('time series is strictly increasing in 86400-second steps', () => {
    const bars = generateOhlcv(10, 100, hashToken('test'));
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].time - bars[i - 1].time).toBe(86400);
    }
  });

  test('every bar carries the six required numeric fields', () => {
    const bars = generateOhlcv(5, 1, hashToken('test'));
    for (const b of bars) {
      for (const k of ['time', 'open', 'high', 'low', 'close', 'volume'] as const) {
        expect(typeof b[k]).toBe('number');
        expect(Number.isFinite(b[k])).toBe(true);
      }
    }
  });

  test('volume is a positive integer', () => {
    const bars = generateOhlcv(20, 100, hashToken('vol'));
    for (const b of bars) {
      expect(Number.isInteger(b.volume)).toBe(true);
      expect(b.volume).toBeGreaterThan(0);
    }
  });
});

describe('hashToken', () => {
  test('is deterministic', () => {
    expect(hashToken('btc')).toBe(hashToken('btc'));
  });

  test('different inputs hash to different values', () => {
    expect(hashToken('btc')).not.toBe(hashToken('eth'));
  });

  test('returns a non-negative 32-bit unsigned integer', () => {
    const h = hashToken('any-token-string');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(h)).toBe(true);
  });
});
