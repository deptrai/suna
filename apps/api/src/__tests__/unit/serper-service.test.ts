import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';

let _serperKey: string | undefined = 'serp-test-key';

mock.module('../../config', () => ({
  config: {
    get SERPER_API_KEY() { return _serperKey; },
    SERPER_API_URL: 'https://google.serper.dev',
  },
}));

const { imageSearchSerper } = await import('../../router/services/serper');

const originalFetch = globalThis.fetch;

function stubFetchOk(body: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
}

function stubFetchError(status: number, message: string) {
  globalThis.fetch = (async () =>
    new Response(message, { status })) as unknown as typeof fetch;
}

function captureFetch(): { calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ images: [] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls };
}

describe('imageSearchSerper', () => {
  beforeEach(() => {
    _serperKey = 'serp-test-key';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('[P0] throws when SERPER_API_KEY is missing', async () => {
    _serperKey = undefined;
    await expect(imageSearchSerper('cat', 5)).rejects.toThrow('SERPER_API_KEY not configured');
  });

  test('[P0] maps Serper response to ImageSearchResult shape', async () => {
    stubFetchOk({
      images: [
        {
          title: 'Cat 1',
          imageUrl: 'https://img/cat1.jpg',
          thumbnailUrl: 'https://thumb/cat1.jpg',
          link: 'https://source/cat1',
          imageWidth: 800,
          imageHeight: 600,
        },
        {
          title: 'Cat 2',
          imageUrl: 'https://img/cat2.jpg',
          link: 'https://source/cat2',
        },
      ],
    });

    const results = await imageSearchSerper('cat', 5);
    expect(results.length).toBe(2);
    expect(results[0]).toEqual({
      title: 'Cat 1',
      url: 'https://img/cat1.jpg',
      thumbnail_url: 'https://thumb/cat1.jpg',
      source_url: 'https://source/cat1',
      width: 800,
      height: 600,
    });
    expect(results[1].thumbnail_url).toBe('https://img/cat2.jpg');
    expect(results[1].width).toBeNull();
    expect(results[1].height).toBeNull();
  });

  test('[P0] throws on non-2xx response with status code', async () => {
    stubFetchError(403, 'forbidden');
    await expect(imageSearchSerper('cat', 5)).rejects.toThrow(/Serper API error: 403/);
  });

  test('[P1] clamps maxResults to 20', async () => {
    const { calls } = captureFetch();
    await imageSearchSerper('cat', 100);
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.num).toBe(20);
  });

  test('[P1] forwards safeSearch flag correctly', async () => {
    const { calls } = captureFetch();
    await imageSearchSerper('cat', 5, false);
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.safe).toBe('off');

    calls.length = 0;
    await imageSearchSerper('cat', 5, true);
    const body2 = JSON.parse(calls[0].init?.body as string);
    expect(body2.safe).toBe('active');
  });

  test('[P0] sends api key via X-API-KEY header (not URL)', async () => {
    const { calls } = captureFetch();
    await imageSearchSerper('cat', 5);
    expect(calls[0].url).not.toContain('serp-test-key');
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers['X-API-KEY']).toBe('serp-test-key');
  });

  test('[P1] handles missing images field gracefully', async () => {
    stubFetchOk({});
    const results = await imageSearchSerper('cat', 5);
    expect(results).toEqual([]);
  });
});
