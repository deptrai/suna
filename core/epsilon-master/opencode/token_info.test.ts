import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest';
import tokenInfoTool from './tools/token_info';
import * as getEnvModule from './tools/lib/get-env';

describe('token_info tool', () => {
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

  test('[P0] fails when EPSILON_TOKEN missing', async () => {
    vi.spyOn(getEnvModule, 'getEnv').mockImplementation((key) =>
      key === 'EPSILON_API_URL' ? 'https://api.epsilon.ai' : undefined,
    );
    const result = await tokenInfoTool.execute({ slug: 'bitcoin' }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('EPSILON_TOKEN');
  });

  test('[P0] rejects EPSILON_API_URL without http:// prefix', async () => {
    vi.spyOn(getEnvModule, 'getEnv').mockImplementation((key) => {
      if (key === 'EPSILON_TOKEN') return 'test-token';
      if (key === 'EPSILON_API_URL') return 'api.epsilon.ai';
      return undefined;
    });
    const result = await tokenInfoTool.execute({ slug: 'bitcoin' }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('http://');
  });

  test('[P0] rejects empty slug', async () => {
    const result = await tokenInfoTool.execute({ slug: '   ' }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('slug is required');
  });

  test('[P0] calls /v1/router/token-info proxy URL with Bearer auth (not coingecko directly)', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, price: 50000 }),
    });
    await tokenInfoTool.execute({ slug: 'bitcoin' }, {} as any);

    const calledUrl = String((global.fetch as any).mock.calls[0][0]);
    expect(calledUrl).toContain('/v1/router/token-info');
    expect(calledUrl).not.toContain('coingecko.com');

    const init = (global.fetch as any).mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer test-token');
  });

  test('[P0] lowercases slug before sending', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    await tokenInfoTool.execute({ slug: 'BITCOIN' }, {} as any);
    const init = (global.fetch as any).mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.slug).toBe('bitcoin');
  });

  test('[P0] surfaces 402 as "Insufficient credits"', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => 'no credits',
    });
    const result = await tokenInfoTool.execute({ slug: 'bitcoin' }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Insufficient credits');
  });

  test('[P0] surfaces network failures as Network error', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('ECONNRESET'));
    const result = await tokenInfoTool.execute({ slug: 'bitcoin' }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Network error');
  });

  test('[P1] returns parsed proxy response on success', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, price: 50000, market_cap: 1e12 }),
    });
    const result = await tokenInfoTool.execute({ slug: 'bitcoin' }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.price).toBe(50000);
    expect(parsed.market_cap).toBe(1e12);
  });

  test('[P1] forwards session_id when provided', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    await tokenInfoTool.execute(
      { slug: 'bitcoin', session_id: 'sess-x' },
      {} as any,
    );
    const init = (global.fetch as any).mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.session_id).toBe('sess-x');
  });
});
