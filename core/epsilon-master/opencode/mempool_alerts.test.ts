import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest';
import mempoolAlertsTool from './tools/mempool_alerts';
import * as getEnvModule from './tools/lib/get-env';

describe('mempool_alerts tool', () => {
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

  test('fails when env vars missing', async () => {
    vi.spyOn(getEnvModule, 'getEnv').mockReturnValue(undefined);
    const result = await mempoolAlertsTool.execute({}, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
  });

  test('calls internal mempool route', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, alerts: [], count: 0, source: 'db' }),
    });

    const result = await mempoolAlertsTool.execute(
      { chain: 'ethereum', limit: 999, since_minutes: 2000 },
      {} as any,
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/router/mempool-alerts?'),
      expect.objectContaining({ method: 'GET' }),
    );
    const calledUrl = String((global.fetch as any).mock.calls[0][0]);
    expect(calledUrl).toContain('limit=100');
    expect(calledUrl).toContain('since_minutes=1440');
  });
});
