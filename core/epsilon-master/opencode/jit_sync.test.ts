import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest';
import jitSyncTool from './jit_sync';
import * as getEnvModule from './lib/get-env';

describe('jit_sync tool', () => {
  beforeEach(() => {
    vi.spyOn(getEnvModule, 'getEnv').mockImplementation((key) => {
      if (key === 'EPSILON_TOKEN') return 'test-token';
      if (key === 'EPSILON_API_URL') return 'https://api.epsilon.ai';
      return undefined;
    });
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('fails if env vars are missing', async () => {
    vi.spyOn(getEnvModule, 'getEnv').mockReturnValue(undefined);
    const res = await jitSyncTool.execute({ protocol_slug: 'aave' }, {} as any);
    expect(res).toContain('Error: EPSILON_TOKEN not set');
  });

  test('validates protocol_slug', async () => {
    const res = await jitSyncTool.execute({ protocol_slug: 'invalid_slug_!' }, {} as any);
    const parsed = JSON.parse(res as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('lowercase letters/numbers/dashes');
  });

  test('fetches from proxy correctly', async () => {
    const mockProxyRes = {
      slug: 'aave',
      success: true,
      snapshot: 'Formatted snapshot',
      stale: false,
      source: 'live',
      fetched_at: '2023-01-01T00:00:00Z',
      cost: 1
    };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockProxyRes
    });
    const res = await jitSyncTool.execute({ protocol_slug: 'aave' }, {} as any);
    const parsed = JSON.parse(res as string);
    expect(parsed.success).toBe(true);
    expect(parsed.snapshot).toBe('Formatted snapshot');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.epsilon.ai/v1/router/jit-sync',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String) // JSON.stringify({ protocol_slug: 'aave' })
      })
    );
  });
});
