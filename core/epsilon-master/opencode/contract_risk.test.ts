import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest';
import contractRiskTool from './tools/contract_risk';
import * as getEnvModule from './tools/lib/get-env';

describe('contract_risk tool', () => {
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
    vi.spyOn(getEnvModule, 'getEnv').mockImplementation((key) => {
      if (key === 'EPSILON_API_URL') return 'https://api.epsilon.ai';
      return undefined;
    });
    const result = await contractRiskTool.execute({ address: '0x' + 'a'.repeat(40) }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('EPSILON_TOKEN');
  });

  test('[P0] fails when EPSILON_API_URL missing', async () => {
    vi.spyOn(getEnvModule, 'getEnv').mockImplementation((key) => {
      if (key === 'EPSILON_TOKEN') return 'test-token';
      return undefined;
    });
    const result = await contractRiskTool.execute({ address: '0x' + 'a'.repeat(40) }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('EPSILON_API_URL');
  });

  test('[P0] rejects empty address', async () => {
    const result = await contractRiskTool.execute({ address: '' }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('address is required');
  });

  test('[P0] rejects invalid EVM address', async () => {
    const result = await contractRiskTool.execute({ address: 'not-an-address', chain: 'ethereum' }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Invalid EVM address');
  });

  test('[P0] rejects invalid Solana address', async () => {
    const result = await contractRiskTool.execute({ address: 'short', chain: 'solana' }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Invalid Solana address');
  });

  test('[P0] calls /v1/router/contract-risk with Bearer auth (proxy URL, not GoPlus directly)', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, risk_level: 'LOW' }),
    });
    const evmAddr = '0x' + 'a'.repeat(40);
    await contractRiskTool.execute({ address: evmAddr, chain: 'ethereum' }, {} as any);

    const calledUrl = String((global.fetch as any).mock.calls[0][0]);
    expect(calledUrl).toContain('/v1/router/contract-risk');
    expect(calledUrl).not.toContain('goplus');
    expect(calledUrl).not.toContain('rugcheck');

    const init = (global.fetch as any).mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(init.method).toBe('POST');
  });

  test('[P0] surfaces 402 as "Insufficient credits"', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => 'no credits',
    });
    const result = await contractRiskTool.execute({ address: '0x' + 'a'.repeat(40) }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Insufficient credits');
  });

  test('[P0] surfaces upstream HTTP errors with sanitized body', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    });
    const result = await contractRiskTool.execute({ address: '0x' + 'a'.repeat(40) }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Proxy error 503');
  });

  test('[P0] surfaces network failures as Network error', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('socket hang up'));
    const result = await contractRiskTool.execute({ address: '0x' + 'a'.repeat(40) }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Network error');
  });

  test('[P1] returns parsed proxy response on success', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        risk_level: 'MEDIUM',
        risk_score: 50,
        risk_factors: ['Honeypot suspect', 'Low liquidity'],
      }),
    });
    const result = await contractRiskTool.execute({ address: '0x' + 'a'.repeat(40) }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.risk_level).toBe('MEDIUM');
    expect(parsed.risk_factors.length).toBe(2);
  });

  test('[P1] forwards session_id in request body', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    await contractRiskTool.execute(
      { address: '0x' + 'a'.repeat(40), session_id: 'sess-123' },
      {} as any,
    );
    const init = (global.fetch as any).mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.session_id).toBe('sess-123');
  });
});
