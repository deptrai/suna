import { describe, test, expect, mock } from 'bun:test';

// Mock dependencies of llm.ts service
mock.module('../../config', () => ({
  config: {
    OPENROUTER_API_URL: 'https://openrouter.ai/api/v1',
    OPENROUTER_API_KEY: 'or-test-key',
    FRONTEND_URL: 'https://test.epsilon.ai',
    ANTHROPIC_PROXY_URL: '',
    ANTHROPIC_PROXY_API_KEY: '',
  },
  EPSILON_MARKUP: 1.2,
}));

mock.module('../../router/config/models', () => ({
  getModel: (id: string) => ({
    id,
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    cacheReadPer1M: 0.3,
    cacheWritePer1M: 3.75,
  }),
  getAllModels: () => [],
  resolveOpenRouterId: (id: string) => `openrouter/${id}`,
}));

mock.module('../../router/config/claude-fallback', () => ({
  isClaudeFallbackModel: (id: string) => id.startsWith('claude-'),
  FALLBACK_HEADER: 'X-Fallback-Source',
}));

const { calculateCost, extractUsage } = await import('../../router/services/llm');

describe('extractUsage', () => {
  test('[P0] returns null when usage absent', () => {
    expect(extractUsage({})).toBeNull();
    expect(extractUsage({ usage: null })).toBeNull();
    expect(extractUsage(null)).toBeNull();
    expect(extractUsage(undefined)).toBeNull();
  });

  test('[P0] extracts prompt+completion tokens from usage object', () => {
    const usage = extractUsage({
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });
    expect(usage?.promptTokens).toBe(100);
    expect(usage?.completionTokens).toBe(50);
    expect(usage?.cachedTokens).toBe(0);
    expect(usage?.cacheWriteTokens).toBe(0);
  });

  test('[P0] extracts cache metrics from prompt_tokens_details', () => {
    const usage = extractUsage({
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 50,
        prompt_tokens_details: { cached_tokens: 800, cache_write_tokens: 100 },
      },
    });
    expect(usage?.cachedTokens).toBe(800);
    expect(usage?.cacheWriteTokens).toBe(100);
  });

  test('[P0] defaults to 0 when fields missing', () => {
    const usage = extractUsage({ usage: {} });
    expect(usage?.promptTokens).toBe(0);
    expect(usage?.completionTokens).toBe(0);
    expect(usage?.cachedTokens).toBe(0);
    expect(usage?.cacheWriteTokens).toBe(0);
  });
});

describe('calculateCost', () => {
  const baseModel = {
    id: 'gpt-4',
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    cacheReadPer1M: 0.3,
    cacheWritePer1M: 3.75,
  } as any;

  test('[P0] flat input + output cost when no cache', () => {
    // 1M input * $3 = $3, 1M output * $15 = $15, total $18 * 1.2 = $21.60
    const cost = calculateCost(baseModel, 1_000_000, 1_000_000, 0, 0);
    expect(cost).toBeCloseTo(21.6, 5);
  });

  test('[P0] applies markup multiplier (default 1.2)', () => {
    const cost = calculateCost(baseModel, 1_000_000, 0, 0, 0);
    expect(cost).toBeCloseTo(3.6, 5); // $3 * 1.2
  });

  test('[P0] applies custom markup when passed', () => {
    const cost = calculateCost(baseModel, 1_000_000, 0, 0, 0, 1.0);
    expect(cost).toBeCloseTo(3.0, 5); // no markup
  });

  test('[P0] uses differential pricing when cachedTokens > 0', () => {
    // 1000 prompt = 800 cached + 100 cacheWrite + 100 regular
    // regular: 100/1M * 3 = 0.0003
    // cacheRead: 800/1M * 0.3 = 0.00024
    // cacheWrite: 100/1M * 3.75 = 0.000375
    // output: 0
    // total = 0.000915 * 1.2 = 0.001098
    const cost = calculateCost(baseModel, 1000, 0, 800, 100);
    expect(cost).toBeCloseTo(0.001098, 6);
  });

  test('[P0] uses inputPer1M as cacheWritePer1M fallback when not set', () => {
    const noCacheWriteModel = { ...baseModel, cacheWritePer1M: undefined };
    const cost = calculateCost(noCacheWriteModel, 1000, 0, 0, 100);
    // regular: 900/1M * 3 = 0.0027
    // cacheWrite: 100/1M * 3 (fallback to inputPer1M) = 0.0003
    // total = 0.003 * 1.2 = 0.0036
    expect(cost).toBeCloseTo(0.0036, 6);
  });

  test('[P0] falls back to flat pricing when cacheReadPer1M is null', () => {
    const noCacheModel = { ...baseModel, cacheReadPer1M: null };
    const cost = calculateCost(noCacheModel, 1000, 0, 800, 100);
    // Should use flat: 1000/1M * 3 * 1.2 = 0.0036
    expect(cost).toBeCloseTo(0.0036, 6);
  });

  test('[P1] regularInputTokens never goes negative when cached+cacheWrite > prompt', () => {
    // Regression: prompt=500, cached=400, cacheWrite=200 → would be negative
    const cost = calculateCost(baseModel, 500, 0, 400, 200);
    expect(cost).toBeGreaterThanOrEqual(0);
  });

  test('[P1] zero tokens returns 0 cost', () => {
    expect(calculateCost(baseModel, 0, 0, 0, 0)).toBe(0);
  });
});
