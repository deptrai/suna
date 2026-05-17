import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';

let _perplexityKey: string | undefined = 'pplx-test-key';

mock.module('../../config', () => ({
  config: {
    get PERPLEXITY_API_KEY() { return _perplexityKey; },
    PERPLEXITY_API_URL: 'https://api.perplexity.ai',
  },
}));

const { deepResearchPerplexity } = await import('../../router/services/perplexity');

const originalFetch = globalThis.fetch;

function stubFetchOk(body: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
}

function captureFetch(): { calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({
      id: 'pplx-1',
      choices: [{ message: { role: 'assistant', content: 'Answer' } }],
      citations: [],
    }), { status: 200 });
  }) as typeof fetch;
  return { calls };
}

describe('deepResearchPerplexity', () => {
  beforeEach(() => {
    _perplexityKey = 'pplx-test-key';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('[P0] throws when PERPLEXITY_API_KEY is missing', async () => {
    _perplexityKey = undefined;
    await expect(deepResearchPerplexity('btc')).rejects.toThrow('PERPLEXITY_API_KEY not configured');
  });

  test('[P0] returns answer + citations from successful response', async () => {
    stubFetchOk({
      id: 'pplx-1',
      choices: [{ message: { role: 'assistant', content: 'BTC is a cryptocurrency' } }],
      citations: ['https://example.com/btc'],
      usage: { prompt_tokens: 10, completion_tokens: 5, num_search_queries: 3 },
    });
    const result = await deepResearchPerplexity('btc');
    expect(result.answer).toBe('BTC is a cryptocurrency');
    expect(result.citations.length).toBe(1);
    expect(result.citations[0].url).toBe('https://example.com/btc');
    expect(result.citations[0].title).toBe('example.com');
    expect(result.search_queries_count).toBe(3);
  });

  test('[P0] handles object-form citations with title+snippet', async () => {
    stubFetchOk({
      choices: [{ message: { role: 'assistant', content: 'X' } }],
      citations: [
        { title: 'Custom Title', url: 'https://a.com', snippet: 'Some snippet' },
        { url: 'https://b.com' },
      ],
    });
    const result = await deepResearchPerplexity('q');
    expect(result.citations.length).toBe(2);
    expect(result.citations[0].title).toBe('Custom Title');
    expect(result.citations[0].snippet).toBe('Some snippet');
    expect(result.citations[1].title).toBe('b.com');
  });

  test('[P0] filters out citations without URL', async () => {
    stubFetchOk({
      choices: [{ message: { role: 'assistant', content: 'X' } }],
      citations: [
        '',
        { title: 'No url' } as any,
        'https://valid.com',
      ],
    });
    const result = await deepResearchPerplexity('q');
    expect(result.citations.length).toBe(1);
    expect(result.citations[0].url).toBe('https://valid.com');
  });

  test('[P0] throws "Perplexity API error: <status>" on non-2xx', async () => {
    globalThis.fetch = (async () => new Response('rate limit hit', { status: 429 })) as typeof fetch;
    await expect(deepResearchPerplexity('q')).rejects.toThrow(/Perplexity API error: 429/);
  });

  test('[P0] wraps fetch network errors', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNRESET');
    }) as typeof fetch;
    await expect(deepResearchPerplexity('q')).rejects.toThrow(/Perplexity API request failed/);
  });

  test('[P1] sends Bearer auth header (not in URL)', async () => {
    const { calls } = captureFetch();
    await deepResearchPerplexity('q');
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer pplx-test-key');
    expect(calls[0].url).not.toContain('pplx-test-key');
  });

  test('[P1] forwards reasoning_effort, max_tokens, recency filter', async () => {
    const { calls } = captureFetch();
    await deepResearchPerplexity('q', {
      reasoning_effort: 'high',
      max_tokens: 5000,
      search_recency_filter: 'week',
    });
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.reasoning_effort).toBe('high');
    expect(body.max_tokens).toBe(5000);
    expect(body.search_recency_filter).toBe('week');
  });

  test('[P1] uses defaults when options omitted (medium effort, 2000 max_tokens)', async () => {
    const { calls } = captureFetch();
    await deepResearchPerplexity('q');
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.reasoning_effort).toBe('medium');
    expect(body.max_tokens).toBe(2000);
    expect(body.search_recency_filter).toBeUndefined();
  });

  test('[P1] safeHostname falls back to raw URL when invalid', async () => {
    stubFetchOk({
      choices: [{ message: { role: 'assistant', content: 'X' } }],
      citations: ['not-a-url'],
    });
    const result = await deepResearchPerplexity('q');
    expect(result.citations[0].title).toBe('not-a-url');
  });

  test('[P1] handles empty choices array gracefully', async () => {
    stubFetchOk({ choices: [], citations: [] });
    const result = await deepResearchPerplexity('q');
    expect(result.answer).toBe('');
    expect(result.citations).toEqual([]);
  });
});
