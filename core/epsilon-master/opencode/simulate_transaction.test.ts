import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest';
import simulateTxTool from './tools/simulate_transaction';
import * as getEnvModule from './tools/lib/get-env';

const VALID_FROM = '0x' + 'a'.repeat(40);
const VALID_TO = '0x' + 'b'.repeat(40);

describe('simulate_transaction tool', () => {
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
    const result = await simulateTxTool.execute({ from: VALID_FROM, to: VALID_TO }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('EPSILON_TOKEN');
  });

  test('[P0] rejects invalid from address', async () => {
    const result = await simulateTxTool.execute({ from: 'bad', to: VALID_TO }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('from address');
  });

  test('[P0] rejects invalid to address', async () => {
    const result = await simulateTxTool.execute({ from: VALID_FROM, to: 'bad' }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('to address');
  });

  test('[P0] rejects non-hex calldata', async () => {
    const result = await simulateTxTool.execute(
      { from: VALID_FROM, to: VALID_TO, data: 'not-hex' },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('hex');
  });

  test('[P0] calls /v1/router/tx-simulator proxy URL with Bearer auth', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, gasUsed: '0x5208' }),
    });
    await simulateTxTool.execute({ from: VALID_FROM, to: VALID_TO }, {} as any);

    const calledUrl = String((global.fetch as any).mock.calls[0][0]);
    expect(calledUrl).toContain('/v1/router/tx-simulator');
    expect(calledUrl).not.toContain('tenderly');

    const init = (global.fetch as any).mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(init.method).toBe('POST');
  });

  test('[P0] defaults data to "0x" when omitted', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    await simulateTxTool.execute({ from: VALID_FROM, to: VALID_TO }, {} as any);
    const init = (global.fetch as any).mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.data).toBe('0x');
  });

  test('[P0] surfaces 402 as "Insufficient credits"', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => 'no credits',
    });
    const result = await simulateTxTool.execute(
      { from: VALID_FROM, to: VALID_TO },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Insufficient credits');
  });

  test('[P0] surfaces upstream HTTP errors with sanitized body', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'simulator down',
    });
    const result = await simulateTxTool.execute(
      { from: VALID_FROM, to: VALID_TO },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Proxy error 500');
  });

  test('[P0] surfaces network failures as Network error', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('socket hang up'));
    const result = await simulateTxTool.execute(
      { from: VALID_FROM, to: VALID_TO },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Network error');
  });

  test('[P0] returns parsed proxy response JSON on success', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, gasUsed: '0x5208', status: 'success' }),
    });
    const result = await simulateTxTool.execute(
      { from: VALID_FROM, to: VALID_TO },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.gasUsed).toBe('0x5208');
    expect(parsed.status).toBe('success');
  });

  test('[P1] forwards optional value, chain, action, session_id in body', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    await simulateTxTool.execute(
      {
        from: VALID_FROM,
        to: VALID_TO,
        value: '0xDE0B6B3A7640000',
        chain: 'arbitrum',
        action: 'Swap ETH for USDC',
        session_id: 'sess-1',
      },
      {} as any,
    );
    const init = (global.fetch as any).mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.value).toBe('0xDE0B6B3A7640000');
    expect(body.chain).toBe('arbitrum');
    expect(body.action).toBe('Swap ETH for USDC');
    expect(body.session_id).toBe('sess-1');
  });
});
