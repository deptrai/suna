import { chromium, expect } from '@playwright/test';
import path from 'path';

const DEX_URL = 'https://www.dexscreener.com/ethereum/0x1234567890123456789012345678901234567890';
const CMC_URL = 'https://www.coinmarketcap.com/currencies/bitcoin/';

const DEX_HTML = `<!doctype html><html><body><main><h1><span>WETH</span></h1><div role="heading">WETH / USDC</div></main></body></html>`;
const CMC_HTML = `<!doctype html><html><body><main><h1><span>BTC</span></h1><div aria-label="token price header">BTC Price Live Data</div></main></body></html>`;

async function waitForTooltip(page: any) {
  await page.waitForFunction(() => {
    const host = document.getElementById('chainlens-shadow-host');
    const shadow = host?.shadowRoot;
    const container = shadow?.getElementById('chainlens-tooltip-container');
    return container && container.style.display !== 'none' && container.children.length > 0;
  }, { timeout: 8000 });
}

async function run() {
  const extensionRoot = path.join(__dirname, '../apps/extension');
  const contentBundlePath = path.join(extensionRoot, 'dist/index.js');
  console.log('Loading content bundle from:', contentBundlePath);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  const page = await context.newPage();
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

  await page.addInitScript(() => {
    const riskPayload = {
      risk: {
        level: 'Low',
        liquidity: '$10M',
        contractInfo: 'Mocked contract',
        price: '$1.23',
        change24h: '+1.2%',
      },
    };

    const origFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/v1/advisory/risk')) {
        return new Response(JSON.stringify(riskPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return origFetch(input, init);
    };
  });

  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(DEX_URL)) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: DEX_HTML });
      return;
    }
    if (url.startsWith(CMC_URL)) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: CMC_HTML });
      return;
    }
    await route.continue();
  });

  try {
    // DexScreener scenario
    await page.goto(DEX_URL);
    await page.addScriptTag({ path: contentBundlePath });
    const dexHighlight = page.locator('.chainlens-token-highlight').first();
    await dexHighlight.waitFor({ state: 'visible', timeout: 10000 });
    await dexHighlight.hover();
    await waitForTooltip(page);
    const dexCount = await page.locator('.chainlens-token-highlight').count();
    expect(dexCount).toBeGreaterThan(0);

    // CoinMarketCap scenario
    await page.goto(CMC_URL);
    await page.addScriptTag({ path: contentBundlePath });
    const cmcHighlight = page.locator('.chainlens-token-highlight').first();
    await cmcHighlight.waitFor({ state: 'visible', timeout: 10000 });
    await cmcHighlight.hover();
    await waitForTooltip(page);
    const cmcCount = await page.locator('.chainlens-token-highlight').count();
    expect(cmcCount).toBeGreaterThan(0);

    // Idempotency scenario: soft route mutation should not create duplicate highlights.
    const before = await page.locator('.chainlens-token-highlight').count();
    await page.evaluate(() => {
      history.pushState({}, '', '/currencies/bitcoin/?tab=markets');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await page.waitForTimeout(800);
    const after = await page.locator('.chainlens-token-highlight').count();
    expect(after).toBe(before);

    const screenshotPath = path.join(__dirname, 'extension-test-screenshot.png');
    await page.screenshot({ path: screenshotPath });
    console.log('Extension domain parser E2E passed. Screenshot:', screenshotPath);
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((err) => {
  console.error('E2E extension test failed:', err);
  process.exit(1);
});
