import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest';
import { cacheKey, getCached, getCachedAny, setCache, formatSnapshot } from '../../src/router/services/jit-cache';

// Mock _clearCacheForTests if it existed, but since we didn't add it in the implementation, 
// we will just use cache keys uniquely or rely on the natural state.
// We'll write a clean version of the test that works with the actual implementation provided earlier.

describe('jit-cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const mockSnapshot = {
    slug: 'aave',
    name: 'AAVE',
    tvl_usd: 1000000,
    tvl_change_24h_pct: 5,
    apy_avg: 10,
    chains: ['ethereum']
  };

  test('cacheKey formats correctly', () => {
    expect(cacheKey('AAVE')).toBe('aave:all:all');
    expect(cacheKey('Aave', 'Ethereum')).toBe('aave:ethereum:all');
    expect(cacheKey('Aave', undefined, ['tvl', 'apy'])).toBe('aave:all:apy,tvl');
  });

  test('setCache and getCached respect TTL', () => {
    setCache('aave:test:all', mockSnapshot);
    expect(getCached('aave:test:all')).not.toBeNull();
    
    // Advance beyond 5 mins
    vi.advanceTimersByTime(6 * 60 * 1000);
    expect(getCached('aave:test:all')).toBeNull(); // Should be considered stale/expired
    expect(getCachedAny('aave:test:all')).not.toBeNull(); // But still in memory for stale fallback
    
    // Advance a lot
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    // Note: getCachedAny will still return it because our cache doesn't auto-evict on time, only on capacity
    expect(getCachedAny('aave:test:all')).not.toBeNull(); 
  });

  test('setCache enforces CACHE_MAX_ENTRIES', () => {
    for (let i = 0; i < 1005; i++) {
      setCache(`key:${i}`, { ...mockSnapshot, slug: `key:${i}` });
    }
    // Since MAX_CACHE_SIZE is 1000 and we add 1005, the first 100 get evicted when it hits 1000.
    // So key:0 should be gone, but key:1004 should be there.
    expect(getCached('key:0')).toBeNull();
    expect(getCached('key:1004')).not.toBeNull();
  });

  test('formatSnapshot formats correctly', () => {
    const formatted = formatSnapshot(mockSnapshot, false, '2023-01-01T00:00:00Z');
    expect(formatted).toContain('**AAVE** (ethereum)');
    expect(formatted).toContain('TVL $1.00M');
    expect(formatted).toContain('+5.00% 24h');
    expect(formatted).toContain('Avg APY 10.00%');
  });

  test('formatSnapshot formats stale warning correctly', () => {
    const formatted = formatSnapshot(mockSnapshot, true, '2023-01-01T00:00:00Z');
    expect(formatted).toContain('⚠️ STALE DATA (cached): ');
  });
});
