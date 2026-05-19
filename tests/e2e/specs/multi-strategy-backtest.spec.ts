import { test, expect } from '@playwright/test';
import { loginToDashboard } from '../helpers/auth';

const enabled = process.env.BACKTEST_E2E_ENABLED === 'true';

test.describe('Multi strategy backtest', () => {
  test.skip(!enabled, 'Set BACKTEST_E2E_ENABLED=true to run live VT backtest E2E');

  test('add 3 strategies, run all, and render comparison sections', async ({ page }) => {
    await loginToDashboard(page);
    await page.goto('/dashboard/backtest', { waitUntil: 'domcontentloaded', timeout: 120_000 });

    await page.getByRole('button', { name: /multi strategy/i }).click();

    const addBtn = page.getByRole('button', { name: /add strategy/i });
    await addBtn.click();
    await addBtn.click();

    const runAll = page.getByRole('button', { name: /run all/i });
    await expect(runAll).toBeEnabled();
    await runAll.click();

    await expect(page.getByText('Comparison Visualizer')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Equity Curve Overlay')).toBeVisible();
    await expect(page.getByText('Correlation Heatmap')).toBeVisible();
  });
});
