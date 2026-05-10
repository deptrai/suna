import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';

// Helper to mock config + reload module fresh. Bun's `mock.module` mutates
// the global module cache; once `env-injector` is imported it captures the
// CURRENT config object reference. To make per-test config changes effective,
// we must re-mock config BEFORE re-importing env-injector each time.
//
// `mock.module` provides a `Symbol.dispose`-compatible cleanup that restores
// previous module state. Combined with bun's `--inspect-brk`-friendly module
// cache invalidation, calling `mock.module` again replaces the cached module.
async function withConfig<T>(
  cfg: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  mock.module('../../config', () => ({
    config: {
      EPSILON_URL: 'http://epsilon-api:8008',
      EPSILON_YOLO_URL: 'https://api-yolo.epsilon.com/v1',
      JUSTAVPS_PROXY_DOMAIN: 'epsilon.cloud',
      ...cfg,
    },
    SANDBOX_VERSION: cfg.SANDBOX_VERSION ?? 'test-version',
  }));
  // Force a fresh import — bun's mock.module replaces the cache entry, but
  // a previously imported binding still points at the old config. We use
  // a cache-busting query string to force re-evaluation.
  const mod = await import(`../../pool/env-injector?t=${Date.now()}-${Math.random()}`);
  return fn.call({ inject: mod.inject });
}

describe('pool env injection — VIBE_TRADING_* vars', () => {
  let capturedBodies: unknown[] = [];
  let origFetch: typeof fetch;

  beforeEach(() => {
    capturedBodies = [];
    origFetch = global.fetch;
    global.fetch = mock(async (_url: string, opts?: RequestInit) => {
      if (opts?.body) capturedBodies.push(JSON.parse(opts.body as string));
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = origFetch;
  });

  test('inject() POSTs with VIBE_TRADING_* env payload when API key is configured', async () => {
    await withConfig(
      {
        VIBE_TRADING_API_KEY: 'test-vt-key-abc123',
        VIBE_TRADING_INTERNAL_URL: 'http://vibe-trading:8899',
      },
      async function (this: { inject: (a: unknown, b: string) => Promise<unknown> }) {
        await this.inject(
          {
            baseUrl: 'http://8000--test-sandbox.epsilon.cloud',
            metadata: {},
            externalId: 'test-sandbox-01',
          },
          'service-key-xyz',
        );
      },
    );

    expect(capturedBodies.length).toBeGreaterThan(0);
    const envKeys = (capturedBodies[0] as { keys?: Record<string, string> })?.keys ?? {};
    expect(envKeys['VIBE_TRADING_API_KEY']).toBe('test-vt-key-abc123');
    expect(envKeys['VIBE_TRADING_INTERNAL_URL']).toBe('http://vibe-trading:8899');
  });

  test('inject() OMITS both VIBE_TRADING vars when API key is empty (feature disabled)', async () => {
    // Symmetric behavior: missing key ⇒ feature disabled ⇒ neither var injected.
    // Avoids confusing tools with URL-but-no-credential.
    await withConfig(
      {
        VIBE_TRADING_API_KEY: '',
        VIBE_TRADING_INTERNAL_URL: 'http://vibe-trading:8899',
      },
      async function (this: { inject: (a: unknown, b: string) => Promise<unknown> }) {
        await this.inject(
          {
            baseUrl: 'http://8000--test-sandbox.epsilon.cloud',
            metadata: {},
            externalId: 'test-sandbox-02',
          },
          'service-key-xyz',
        );
      },
    );

    expect(capturedBodies.length).toBeGreaterThan(0);
    const envKeys = (capturedBodies[0] as { keys?: Record<string, string> })?.keys ?? {};
    expect(envKeys['VIBE_TRADING_API_KEY']).toBeUndefined();
    expect(envKeys['VIBE_TRADING_INTERNAL_URL']).toBeUndefined();
  });

  test('inject() still includes EPSILON_TOKEN and EPSILON_API_URL alongside new VT vars', async () => {
    await withConfig(
      {
        VIBE_TRADING_API_KEY: 'vt-key',
        VIBE_TRADING_INTERNAL_URL: 'http://vibe-trading:8899',
        SANDBOX_VERSION: 'v42',
      },
      async function (this: { inject: (a: unknown, b: string) => Promise<unknown> }) {
        await this.inject(
          {
            baseUrl: 'http://8000--test-sandbox.epsilon.cloud',
            metadata: {},
            externalId: 'test-sandbox-03',
          },
          'my-service-key',
        );
      },
    );

    const envKeys = (capturedBodies[0] as { keys?: Record<string, string> })?.keys ?? {};
    expect(envKeys['EPSILON_TOKEN']).toBe('my-service-key');
    expect(envKeys['EPSILON_API_URL']).toBeTruthy();
    expect(envKeys['VIBE_TRADING_API_KEY']).toBe('vt-key');
    expect(envKeys['VIBE_TRADING_INTERNAL_URL']).toBe('http://vibe-trading:8899');
  });
});
