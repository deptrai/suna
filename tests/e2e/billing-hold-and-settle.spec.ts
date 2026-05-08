import { test, expect } from '@playwright/test';

test.describe('Billing Hold-and-Settle E2E User Journey', () => {
  test('[P0] should authorize a hold and settle funds', async ({ page }) => {
    await page.route('**/api/billing/hold', async route => {
      await route.fulfill({ status: 200, json: { holdId: 'hold_123', status: 'authorized' } });
    });
    await page.route('**/api/billing/settle', async route => {
      await route.fulfill({ status: 200, json: { holdId: 'hold_123', status: 'settled' } });
    });
    
    await page.goto('/billing');
    await page.getByRole('button', { name: /start trial/i }).click();
    await expect(page.getByText('Hold authorized')).toBeVisible();
    
    await page.getByRole('button', { name: /confirm purchase/i }).click();
    await expect(page.getByText('Funds settled successfully')).toBeVisible();
  });

  test('[P1] should handle failed hold authorization', async ({ page }) => {
    await page.route('**/api/billing/hold', async route => {
      await route.fulfill({ status: 400, json: { error: 'Insufficient funds' } });
    });
    
    await page.goto('/billing');
    await page.getByRole('button', { name: /start trial/i }).click();
    await expect(page.getByText('Insufficient funds')).toBeVisible();
  });
});