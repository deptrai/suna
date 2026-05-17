import { describe, test, expect, mock } from 'bun:test';

mock.module('../lib/get-env', () => ({ getEnv: (k: string) => (k === 'EPSILON_TOKEN' ? 'token' : k === 'EPSILON_API_URL' ? 'http://epsilon-api:8008' : undefined) }));
mock.module('../lib/sanitize', () => ({ sanitizeUpstreamErr: (s: string) => s }));

import protocolValuation from '../protocol_valuation';

describe('protocol_valuation tool', () => {
  test('calls internal API endpoint', async () => {
    let calledUrl = '';
    globalThis.fetch = mock(async (url: string) => {
      calledUrl = url;
      return new Response(JSON.stringify({ success: true, cache_status: 'cache_fresh', cost: 0 }), { status: 200 });
    }) as any;

    const out = JSON.parse(await protocolValuation.execute({ mode: 'project_snapshot', project_id: 'uniswap' } as any, {} as never));
    expect(calledUrl).toContain('/v1/router/protocol-valuation');
    expect(out.success).toBe(true);
  });
});
