import { describe, test, expect } from 'bun:test';

const MOCK_ITEMS = [
  { time: 1700000000, open: 35000, high: 35200, low: 34800, close: 35100 },
  { time: 1700014400, open: 35100, high: 35500, low: 35000, close: 35400 },
];

const BACKEND_URL = 'http://localhost:8008/v1';

describe('fetchOhlcvServer', () => {
  test('success:true response → items array with correct shape', async () => {
    const savedFetch = global.fetch;
    const savedUrl = process.env.BACKEND_URL;
    process.env.BACKEND_URL = BACKEND_URL;
    global.fetch = async () =>
      new Response(
        JSON.stringify({ success: true, items: MOCK_ITEMS, days: 30, source: 'coingecko', last_updated: '' }),
        { status: 200 },
      );

    const { fetchOhlcvServer } = await import('../_components/ChartSection');
    const result = await fetchOhlcvServer('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', 'ethereum');

    global.fetch = savedFetch;
    process.env.BACKEND_URL = savedUrl;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.items).toHaveLength(2);
      expect(result.items[0].close).toBe(35100);
    }
  });

  test('success:false response → returns error string from upstream', async () => {
    const savedFetch = global.fetch;
    const savedUrl = process.env.BACKEND_URL;
    process.env.BACKEND_URL = BACKEND_URL;
    global.fetch = async () =>
      new Response(
        JSON.stringify({ success: false, error: 'token not indexed on CoinGecko' }),
        { status: 200 },
      );

    const { fetchOhlcvServer } = await import('../_components/ChartSection');
    const result = await fetchOhlcvServer('0x0000000000000000000000000000000000000001', 'ethereum');

    global.fetch = savedFetch;
    process.env.BACKEND_URL = savedUrl;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('token not indexed');
    }
  });

  test('network error → returns success:false', async () => {
    const savedFetch = global.fetch;
    const savedUrl = process.env.BACKEND_URL;
    process.env.BACKEND_URL = BACKEND_URL;
    global.fetch = async () => { throw new Error('Network timeout'); };

    const { fetchOhlcvServer } = await import('../_components/ChartSection');
    const result = await fetchOhlcvServer('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', 'ethereum');

    global.fetch = savedFetch;
    process.env.BACKEND_URL = savedUrl;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });

  test('BACKEND_URL missing → returns success:false without calling fetch', async () => {
    const savedFetch = global.fetch;
    const savedUrl = process.env.BACKEND_URL;
    const savedPublicUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    delete process.env.BACKEND_URL;
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    let fetchCalled = false;
    global.fetch = async () => { fetchCalled = true; return new Response('{}', { status: 200 }); };

    const { fetchOhlcvServer } = await import('../_components/ChartSection');
    const result = await fetchOhlcvServer('0x1234', 'ethereum');

    global.fetch = savedFetch;
    process.env.BACKEND_URL = savedUrl;
    process.env.NEXT_PUBLIC_BACKEND_URL = savedPublicUrl;

    expect(result.success).toBe(false);
    expect(fetchCalled).toBe(false);
  });

  test('upstream returns Hono HTTPException shape ({message: ...}) → success:false with message extracted', async () => {
    const savedFetch = global.fetch;
    const savedUrl = process.env.BACKEND_URL;
    process.env.BACKEND_URL = BACKEND_URL;
    global.fetch = async () =>
      new Response(JSON.stringify({ message: 'Validation error: chain is only valid with EVM address input' }), { status: 400 });

    const { fetchOhlcvServer } = await import('../_components/ChartSection');
    const result = await fetchOhlcvServer('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', 'ethereum');

    global.fetch = savedFetch;
    process.env.BACKEND_URL = savedUrl;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Validation error');
    }
  });
});

describe('ChartSection (Solana branch)', () => {
  test.each(['solana', 'sol', 'SOLANA', 'Sol'])(
    'chain=%s → renders "Chart coming soon (Solana)" without fetching',
    async (chain) => {
      const savedFetch = global.fetch;
      let fetchCalled = false;
      global.fetch = async () => { fetchCalled = true; return new Response('{}', { status: 200 }); };

      const { ChartSection } = await import('../_components/ChartSection');
      const node = await ChartSection({ address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', chain });

      global.fetch = savedFetch;

      // Solana branch must short-circuit BEFORE fetching
      expect(fetchCalled).toBe(false);
      // Crude shape check — Solana branch returns a JSX tree containing the heading text
      const serialized = JSON.stringify(node);
      expect(serialized).toContain('Chart coming soon (Solana)');
    },
  );
});
