import { test, expect } from '@playwright/test';

test.describe('Sandbox Execution E2E User Journey', () => {
  test('[P0] should execute code in sandbox and return output', async ({ page }) => {
    await page.route('**/api/sandbox/execute', async route => {
      await route.fulfill({ status: 200, json: { output: 'Hello World', status: 'success' } });
    });
    
    await page.goto('/sandbox');
    await page.getByRole('textbox', { name: /code editor/i }).fill('console.log("Hello World");');
    await page.getByRole('button', { name: /run/i }).click();
    
    await expect(page.getByText('Hello World')).toBeVisible();
  });

  test('[P1] should display sandbox timeout error', async ({ page }) => {
    await page.route('**/api/sandbox/execute', async route => {
      await route.fulfill({ status: 408, json: { error: 'Execution timeout' } });
    });
    
    await page.goto('/sandbox');
    await page.getByRole('textbox', { name: /code editor/i }).fill('while(true) {}');
    await page.getByRole('button', { name: /run/i }).click();
    
    await expect(page.getByText('Execution timeout')).toBeVisible();
  });
});