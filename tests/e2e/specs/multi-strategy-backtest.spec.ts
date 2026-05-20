import { test, expect } from '@playwright/test';
import { apiBase, ensureServicesHealthy, loginBySessionCookie, ownerEmail, ownerPassword } from '../helpers/auth';

const enabled = process.env.BACKTEST_E2E_ENABLED === 'true';

test.describe('Multi strategy backtest', () => {
  test.skip(!enabled, 'Set BACKTEST_E2E_ENABLED=true to run live VT backtest E2E');

  test('add 3 strategies, run all, and render comparison sections', async ({ page }) => {
    test.setTimeout(900_000);

    const bootstrapRes = await page.request.post(`${apiBase}/setup/bootstrap-owner`, {
      data: { email: ownerEmail, password: ownerPassword },
    });
    expect([200, 409]).toContain(bootstrapRes.status());
    let loginEmail = ownerEmail;
    if (bootstrapRes.status() === 409) {
      const body = await bootstrapRes.json().catch(() => ({})) as { error?: string };
      const match = (body.error ?? '').match(/\(([^)]+)\)/);
      if (match?.[1]) loginEmail = match[1];
    }

    await ensureServicesHealthy(page);
    await loginBySessionCookie(page, { email: loginEmail, password: ownerPassword });
    await page.goto('/instances', { waitUntil: 'domcontentloaded', timeout: 120_000 });

    const cookies = await page.context().cookies();
    const activeInstance = cookies.find((c) => c.name === 'epsilon-active-instance')?.value;
    const backtestPath = activeInstance
      ? `/instances/${encodeURIComponent(activeInstance)}/dashboard/backtest`
      : '/dashboard/backtest';

    const backtestHeading = page.getByRole('heading', { name: /Backtest Strategy/i });
    const connectingStatus = page.getByText(/Signing in|Authenticating|Connecting/i);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await Promise.allSettled([
        page.goto(backtestPath, { waitUntil: 'domcontentloaded', timeout: 120_000 }),
        page.waitForURL(/\/dashboard\/backtest/, { timeout: 120_000 }),
      ]);
      if (await backtestHeading.isVisible({ timeout: 20_000 }).catch(() => false)) {
        break;
      }
      if (attempt === 3) {
        await expect(backtestHeading).toBeVisible({ timeout: 60_000 });
      }
      if (await connectingStatus.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await page.waitForTimeout(15_000);
      }
    }

    await page.getByRole('button', { name: /multi strategy/i }).click();

    const addBtn = page.getByRole('button', { name: /add strategy/i });
    await addBtn.click();
    await addBtn.click();

    const runAll = page.getByRole('button', { name: /run all/i });
    await expect(runAll).toBeEnabled();
    await runAll.click();

    await expect(page.getByText(/Strategy \d+ · running/i)).toHaveCount(0, { timeout: 480_000 });
    await expect(page.getByText('Comparison Visualizer')).toBeVisible({ timeout: 300_000 });
    await expect(page.getByText('Equity Curve Overlay')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Correlation Heatmap')).toBeVisible({ timeout: 60_000 });
  });
});
