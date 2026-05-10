import { describe, test, expect, beforeEach } from 'bun:test';
import {
  widgetCacheKey,
  cacheGet,
  cacheSet,
  cacheGetStale,
  _clearWidgetCacheForTests,
} from '../../router/services/widget-cache';

beforeEach(() => {
  _clearWidgetCacheForTests();
});

describe('widgetCacheKey', () => {
  test('generates consistent key for same args', () => {
    const k1 = widgetCacheKey('token_info', 'bitcoin');
    const k2 = widgetCacheKey('token_info', 'bitcoin');
    expect(k1).toBe(k2);
  });

  test('preserves primary arg case (callers must normalize per chain)', () => {
    // EVM addresses are case-insensitive — caller lowercases before passing.
    // Solana base58 addresses are case-sensitive — caller passes original casing.
    expect(widgetCacheKey('token_info', 'BITCOIN')).toBe('token_info:BITCOIN');
    expect(widgetCacheKey('token_info', 'bitcoin')).toBe('token_info:bitcoin');
  });

  test('sorts secondary args', () => {
    const k1 = widgetCacheKey('contract_risk', '0x1234', 'ethereum', 'extra');
    const k2 = widgetCacheKey('contract_risk', '0x1234', 'extra', 'ethereum');
    expect(k1).toBe(k2);
  });
});

describe('cacheGet / cacheSet', () => {
  test('returns null for missing key', () => {
    expect(cacheGet('missing')).toBeNull();
  });

  test('returns data after set', () => {
    cacheSet('k1', { price: 100 }, 60_000);
    const entry = cacheGet('k1');
    expect(entry).not.toBeNull();
    expect(entry?.data).toEqual({ price: 100 });
  });

  test('returns null after TTL expires', async () => {
    cacheSet('k2', { price: 200 }, 1);
    await new Promise((r) => setTimeout(r, 10));
    expect(cacheGet('k2')).toBeNull();
  });

  test('cacheGetStale returns data after TTL', async () => {
    cacheSet('k3', { price: 300 }, 1);
    await new Promise((r) => setTimeout(r, 10));
    const stale = cacheGetStale('k3');
    expect(stale).not.toBeNull();
    expect(stale?.data).toEqual({ price: 300 });
  });

  test('overwrites existing entry', () => {
    cacheSet('k4', { a: 1 }, 60_000);
    cacheSet('k4', { b: 2 }, 60_000);
    expect(cacheGet('k4')?.data).toEqual({ b: 2 });
  });
});
