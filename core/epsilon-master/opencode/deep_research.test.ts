import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest';
import deepResearchTool from './tools/deep_research';
import * as getEnvModule from './tools/lib/get-env';

describe('deep_research tool', () => {
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

  test('[P0] returns string error when EPSILON_TOKEN missing', async () => {
    vi.spyOn(getEnvModule, 'getEnv').mockImplementation((key) =>
      key === 'EPSILON_API_URL' ? 'https://api.epsilon.ai' : undefined,
    );
    const result = await deepResearchTool.execute({ query: 'btc' }, {} as any);
    expect(String(result)).toContain('EPSILON_TOKEN');
  });

  test('[P0] returns string error when EPSILON_API_URL missing', async () => {
    vi.spyOn(getEnvModule, 'getEnv').mockImplementation((key) =>
      key === 'EPSILON_TOKEN' ? 'test-token' : undefined,
    );
    const result = await deepResearchTool.execute({ query: 'btc' }, {} as any);
    expect(String(result)).toContain('EPSILON_API_URL');
  });

  test('[P0] rejects EPSILON_API_URL without http:// prefix', async () => {
    vi.spyOn(getEnvModule, 'getEnv').mockImplementation((key) => {
      if (key === 'EPSILON_TOKEN') return 'test-token';
      if (key === 'EPSILON_API_URL') return 'api.epsilon.ai';
      return undefined;
    });
    const result = await deepResearchTool.execute({ query: 'btc' }, {} as any);
    expect(String(result)).toContain('http://');
  });

  test('[P0] rejects empty query', async () => {
    const result = await deepResearchTool.execute({ query: '   ' }, {} as any);
    expect(String(result)).toContain('empty query');
  });

  test('[P0] calls /v1/router/deep-research with Bearer auth (proxy URL, not Perplexity directly)', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        query: 'btc',
        answer: 'BTC is a cryptocurrency',
        citations: [],
        reasoning_effort: 'medium',
        search_queries_count: 1,
        cost: 0.1,
      }),
    });
    await deepResearchTool.execute({ query: 'btc' }, {} as any);

    const calledUrl = String((global.fetch as any).mock.calls[0][0]);
    expect(calledUrl).toContain('/v1/router/deep-research');
    expect(calledUrl).not.toContain('perplexity.ai');

    const init = (global.fetch as any).mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer test-token');
  });

  test('[P0] surfaces 402 as "Insufficient credits"', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => 'no credits',
    });
    const result = await deepResearchTool.execute({ query: 'btc' }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Insufficient credits');
  });

  test('[P0] surfaces upstream HTTP errors with Proxy error message', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'perplexity down',
    });
    const result = await deepResearchTool.execute({ query: 'btc' }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Proxy error 500');
  });

  test('[P0] surfaces network failures as Network error', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('socket hang up'));
    const result = await deepResearchTool.execute({ query: 'btc' }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Network error');
  });

  test('[P0] returns success:true with answer + citations on success', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        query: 'btc',
        answer: 'BTC is a decentralized cryptocurrency',
        citations: [{ title: 'Wiki', url: 'https://en.wikipedia.org', snippet: 'snip' }],
        reasoning_effort: 'medium',
        search_queries_count: 3,
        cost: 0.5,
      }),
    });
    const result = await deepResearchTool.execute({ query: 'btc' }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(true);
    expect(parsed.answer).toContain('BTC');
    expect(parsed.citations.length).toBe(1);
    expect(parsed.search_queries_count).toBe(3);
  });

  test('[P0] success:false when both answer and citations are empty', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        query: 'rare',
        answer: '',
        citations: [],
        reasoning_effort: 'medium',
        search_queries_count: 0,
        cost: 0.5,
      }),
    });
    const result = await deepResearchTool.execute({ query: 'rare' }, {} as any);
    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
  });

  test('[P1] forwards reasoning_effort and max_tokens and recency_filter', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ query: 'q', answer: 'a', citations: [], reasoning_effort: 'high', search_queries_count: 1, cost: 1 }),
    });
    await deepResearchTool.execute(
      { query: 'q', reasoning_effort: 'high', max_tokens: 3000, search_recency_filter: 'week' },
      {} as any,
    );
    const init = (global.fetch as any).mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.reasoning_effort).toBe('high');
    expect(body.max_tokens).toBe(3000);
    expect(body.search_recency_filter).toBe('week');
  });

  test('[P1] defaults reasoning_effort to "medium" when omitted', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ query: 'q', answer: 'a', citations: [], reasoning_effort: 'medium', search_queries_count: 1, cost: 1 }),
    });
    await deepResearchTool.execute({ query: 'q' }, {} as any);
    const init = (global.fetch as any).mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.reasoning_effort).toBe('medium');
  });
});
