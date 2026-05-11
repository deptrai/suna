import { chromium } from '@playwright/test';
import path from 'path';

async function run() {
  const extensionPath = path.join(__dirname, '../apps/extension/dist');
  // NOTE: manifest is in apps/extension, not dist!
  // Extension load path MUST point to the folder containing manifest.json!
  const extensionRoot = path.join(__dirname, '../apps/extension');
  console.log('Loading extension from:', extensionRoot);

  const context = await chromium.launchPersistentContext('', {
    headless: false, // new headless mode supports extensions
    args: [
      `--headless=new`,
      `--disable-extensions-except=${extensionRoot}`,
      `--load-extension=${extensionRoot}`,
    ]
  });

  const page = await context.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  console.log('Navigating to test page...');
  await page.goto('http://localhost:8080/test.html');
  
  console.log('Waiting for extension to highlight tokens...');
  
  // Wait for the injected span
  try {
    const highlightLocator = page.locator('.chainlens-token-highlight').first();
    await highlightLocator.waitFor({ state: 'visible', timeout: 5000 });
    
    console.log('Hovering over token...');
    await highlightLocator.hover();
    
    // Wait for tooltip to appear in shadow DOM
    console.log('Waiting for tooltip to show...');
    await page.waitForTimeout(1000); 
    
    const screenshotPath = path.join(__dirname, 'extension-test-screenshot.png');
    await page.screenshot({ path: screenshotPath });
    console.log('Screenshot saved to:', screenshotPath);
  } catch (err) {
    console.error('Test failed:', err);
    console.log('Page content:', await page.content());
  }
  
  await context.close();
}

run().catch(console.error);