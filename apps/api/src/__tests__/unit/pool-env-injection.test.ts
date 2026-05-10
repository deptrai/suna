import { describe, test, expect, mock } from 'bun:test';

mock.module('../../config', () => ({
  config: {
    EPSILON_URL: 'http://epsilon-api:8008',
    EPSILON_YOLO_URL: 'https://api-yolo.epsilon.com/v1',
    JUSTAVPS_PROXY_DOMAIN: 'epsilon.cloud',
    VIBE_TRADING_API_KEY: 'test-vt-key-abc123',
    VIBE_TRADING_INTERNAL_URL: 'http://vibe-trading:8899',
  },
  SANDBOX_VERSION: 'test-version',
}));

describe('pool env injection — VIBE_TRADING_* vars', () => {
  test('inject() POSTs with VIBE_TRADING_API_KEY in env payload when key is configured', async () => {
    const capturedBodies: unknown[] = [];

    const origFetch = global.fetch;
    global.fetch = mock(async (_url: string, opts?: RequestInit) => {
      if (opts?.body) capturedBodies.push(JSON.parse(opts.body as string));
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const { inject } = await import('../../pool/env-injector');
      await inject(
        {
          baseUrl: 'http://8000--test-sandbox.epsilon.cloud',
          metadata: {},
          externalId: 'test-sandbox-01',
        },
        'service-key-xyz',
      );
    } finally {
      global.fetch = origFetch;
    }

    expect(capturedBodies.length).toBeGreaterThan(0);
    const envKeys = (capturedBodies[0] as { keys?: Record<string, string> })?.keys ?? {};
    expect(envKeys['VIBE_TRADING_API_KEY']).toBe('test-vt-key-abc123');
    expect(envKeys['VIBE_TRADING_INTERNAL_URL']).toBe('http://vibe-trading:8899');
  });

  test('inject() includes VIBE_TRADING_INTERNAL_URL even when API key is empty', async () => {
    mock.module('../../config', () => ({
      config: {
        EPSILON_URL: 'http://epsilon-api:8008',
        EPSILON_YOLO_URL: 'https://api-yolo.epsilon.com/v1',
        JUSTAVPS_PROXY_DOMAIN: 'epsilon.cloud',
        VIBE_TRADING_API_KEY: '',
        VIBE_TRADING_INTERNAL_URL: 'http://vibe-trading:8899',
      },
      SANDBOX_VERSION: 'test-version',
    }));

    const capturedBodies: unknown[] = [];
    const origFetch = global.fetch;
    global.fetch = mock(async (_url: string, opts?: RequestInit) => {
      if (opts?.body) capturedBodies.push(JSON.parse(opts.body as string));
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const { inject } = await import('../../pool/env-injector');
      await inject(
        {
          baseUrl: 'http://8000--test-sandbox.epsilon.cloud',
          metadata: {},
          externalId: 'test-sandbox-02',
        },
        'service-key-xyz',
      );
    } finally {
      global.fetch = origFetch;
    }

    expect(capturedBodies.length).toBeGreaterThan(0);
    const envKeys = (capturedBodies[0] as { keys?: Record<string, string> })?.keys ?? {};
    // VIBE_TRADING_INTERNAL_URL should always be present
    expect(envKeys['VIBE_TRADING_INTERNAL_URL']).toBe('http://vibe-trading:8899');
    // Empty API key should not be injected
    expect(envKeys['VIBE_TRADING_API_KEY']).toBeUndefined();
  });

  test('inject() still includes EPSILON_TOKEN and EPSILON_API_URL alongside new VT vars', async () => {
    mock.module('../../config', () => ({
      config: {
        EPSILON_URL: 'http://epsilon-api:8008',
        EPSILON_YOLO_URL: 'https://api-yolo.epsilon.com/v1',
        JUSTAVPS_PROXY_DOMAIN: 'epsilon.cloud',
        VIBE_TRADING_API_KEY: 'vt-key',
        VIBE_TRADING_INTERNAL_URL: 'http://vibe-trading:8899',
      },
      SANDBOX_VERSION: 'v42',
    }));

    const capturedBodies: unknown[] = [];
    const origFetch = global.fetch;
    global.fetch = mock(async (_url: string, opts?: RequestInit) => {
      if (opts?.body) capturedBodies.push(JSON.parse(opts.body as string));
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    try {
      const { inject } = await import('../../pool/env-injector');
      await inject(
        {
          baseUrl: 'http://8000--test-sandbox.epsilon.cloud',
          metadata: {},
          externalId: 'test-sandbox-03',
        },
        'my-service-key',
      );
    } finally {
      global.fetch = origFetch;
    }

    const envKeys = (capturedBodies[0] as { keys?: Record<string, string> })?.keys ?? {};
    expect(envKeys['EPSILON_TOKEN']).toBe('my-service-key');
    expect(envKeys['EPSILON_API_URL']).toBeTruthy();
    expect(envKeys['VIBE_TRADING_API_KEY']).toBe('vt-key');
    expect(envKeys['VIBE_TRADING_INTERNAL_URL']).toBe('http://vibe-trading:8899');
  });
});
