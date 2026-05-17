import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest';
import smartMoneyFlowTool from './tools/smart_money_flow';
import * as getEnvModule from './tools/lib/get-env';

const VALID_EVM = '0x' + 'a'.repeat(40);

describe('smart_money_flow tool', () => {
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
    const result = await smartMoneyFlowTool.execute({ token_address: VALID_EVM }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('EPSILON_TOKEN');
  });

  test('[P0] rejects unsupported chain', async () => {
    const result = await smartMoneyFlowTool.execute(
      { chain: 'unobtanium', token_address: VALID_EVM },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Unsupported chain');
  });

  test('[P0] rejects missing token_address', async () => {
    const result = await smartMoneyFlowTool.execute({}, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('token_address is required');
  });

  test('[P0] rejects invalid EVM token address', async () => {
    const result = await smartMoneyFlowTool.execute(
      { chain: 'ethereum', token_address: 'not-evm' },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Invalid EVM token address');
  });

  test('[P0] rejects invalid Solana token address', async () => {
    const result = await smartMoneyFlowTool.execute(
      { chain: 'solana', token_address: 'short' },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Invalid Solana token address');
  });

  test('[P0] rejects invalid mode', async () => {
    const result = await smartMoneyFlowTool.execute(
      { chain: 'ethereum', token_address: VALID_EVM, mode: 'wat' },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Invalid mode');
  });

  test('[P0] calls /v1/router/smart-money-flow proxy URL with Bearer auth (no Nansen direct)', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    await smartMoneyFlowTool.execute(
      { chain: 'ethereum', token_address: VALID_EVM },
      {} as any,
    );
    const calledUrl = String((global.fetch as any).mock.calls[0][0]);
    expect(calledUrl).toContain('/v1/router/smart-money-flow');
    expect(calledUrl).not.toContain('nansen.ai');

    const init = (global.fetch as any).mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer test-token');
  });

  test('[P0] clamps lookback_hours to 1-168 range', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    await smartMoneyFlowTool.execute(
      { chain: 'ethereum', token_address: VALID_EVM, lookback_hours: '999' },
      {} as any,
    );
    const init = (global.fetch as any).mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.lookback_hours).toBe(168);
  });

  test('[P0] clamps limit to 1-100 range', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    await smartMoneyFlowTool.execute(
      { chain: 'ethereum', token_address: VALID_EVM, limit: '500' },
      {} as any,
    );
    const init = (global.fetch as any).mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.limit).toBe(100);
  });

  test('[P0] surfaces upstream HTTP errors with sanitized body', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    });
    const result = await smartMoneyFlowTool.execute(
      { chain: 'ethereum', token_address: VALID_EVM },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('HTTP 503');
  });

  test('[P0] surfaces TimeoutError as "Request timed out"', async () => {
    const timeoutErr = new Error('timeout');
    timeoutErr.name = 'TimeoutError';
    (global.fetch as any).mockRejectedValueOnce(timeoutErr);
    const result = await smartMoneyFlowTool.execute(
      { chain: 'ethereum', token_address: VALID_EVM },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Request timed out');
  });

  test('[P1] truncates session_id to 128 chars', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    const longSessionId = 'a'.repeat(500);
    await smartMoneyFlowTool.execute(
      { chain: 'ethereum', token_address: VALID_EVM, session_id: longSessionId },
      {} as any,
    );
    const init = (global.fetch as any).mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.session_id.length).toBe(128);
  });
});
