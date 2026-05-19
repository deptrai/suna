import { test, expect } from '@playwright/test';
import { apiBase, ownerEmail, ownerPassword } from '../helpers/auth';

const enabled = process.env.BACKTEST_E2E_ENABLED === 'true';

test.describe('Multi strategy backtest', () => {
  test.skip(!enabled, 'Set BACKTEST_E2E_ENABLED=true to run live VT backtest E2E');

  test('add 3 strategies, run all, and render comparison sections', async ({ page }) => {
    test.setTimeout(240_000);

    const bootstrapRes = await page.request.post(`${apiBase}/setup/bootstrap-owner`, {
      data: { email: ownerEmail, password: ownerPassword },
    });
    expect([200, 409]).toContain(bootstrapRes.status());

    await page.context().clearCookies();
    await page.goto('/auth', { waitUntil: 'domcontentloaded', timeout: 120_000 });

    const lockScreen = page.getByText('Click or press Enter to sign in');
    const signInHeading = page.getByRole('heading', { name: /sign in/i });
    await expect(lockScreen.or(signInHeading)).toBeVisible({ timeout: 30_000 });
    if (await lockScreen.isVisible().catch(() => false)) {
      await page.locator('div.fixed.inset-0.cursor-pointer').first().click({ force: true });
    }
    await expect(signInHeading).toBeVisible({ timeout: 30_000 });
    await page.locator('input[name="email"]').fill(ownerEmail);
    await page.locator('input[name="password"]').fill(ownerPassword);
    await page.getByRole('button', { name: /sign in/i }).click();

    const providerStep = page.getByRole('heading', { name: /Connect a provider/i });
    if (await providerStep.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await page.goto('/onboarding?skip_onboarding=1', {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      });
    }

    await page.goto('/dashboard/backtest', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await expect(page.getByRole('heading', { name: /Backtest Strategy/i })).toBeVisible({ timeout: 30_000 });

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
