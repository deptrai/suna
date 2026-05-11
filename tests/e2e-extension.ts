import { chromium, expect } from '@playwright/test';
import path from 'path';

async function run() {
  const extensionRoot = path.join(__dirname, '../apps/extension');
  console.log('Loading extension from:', extensionRoot);

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--headless=new`,
      `--disable-extensions-except=${extensionRoot}`,
      `--load-extension=${extensionRoot}`,
    ]
  });

  const page = await context.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  try {
    console.log('Navigating to test page...');
    // Serve test.html via a local static server before running (e.g. `bunx serve apps/extension -p 8080`)
    await page.goto('http://localhost:8080/test.html');

    console.log('Waiting for extension to highlight tokens...');
    const highlightLocator = page.locator('.chainlens-token-highlight').first();
    await highlightLocator.waitFor({ state: 'visible', timeout: 5000 });

    const count = await page.locator('.chainlens-token-highlight').count();
    expect(count).toBeGreaterThan(0);
    console.log(`Found ${count} highlighted token(s)`);

    console.log('Hovering over token...');
    await highlightLocator.hover();

    // Wait for tooltip to appear inside shadow DOM
    await page.waitForFunction(() => {
      const host = document.getElementById('chainlens-shadow-host');
      const shadow = host?.shadowRoot;
      const container = shadow?.getElementById('chainlens-tooltip-container');
      return container && container.style.display !== 'none' && container.children.length > 0;
    }, { timeout: 5000 });

    const tooltipVisible = await page.evaluate(() => {
      const host = document.getElementById('chainlens-shadow-host');
      const container = host?.shadowRoot?.getElementById('chainlens-tooltip-container');
      return container ? container.style.display !== 'none' : false;
    });
    expect(tooltipVisible).toBe(true);
    console.log('Tooltip is visible');

    const screenshotPath = path.join(__dirname, 'extension-test-screenshot.png');
    await page.screenshot({ path: screenshotPath });
    console.log('Screenshot saved to:', screenshotPath);
  } catch (err) {
    console.error('Test failed:', err);
    console.log('Page content:', await page.content());
    throw err;
  } finally {
    await context.close();
  }
}

run().catch(console.error);
