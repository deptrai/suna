import { expect, test } from '@playwright/test';
import { ensureServicesHealthy, loginToDashboard, ownerEmail, ownerPassword } from '../helpers/auth';

const enabled = process.env.BACKTEST_E2E_ENABLED === 'true';

test.describe('Chat multi backtest agent flow', () => {
  test.skip(!enabled, 'Set BACKTEST_E2E_ENABLED=true to run chat multi-backtest E2E');

  test('renders proposal cards and runs approved strategies', async ({ page }) => {
    test.setTimeout(900_000);

    await ensureServicesHealthy(page);
    await loginToDashboard(page, { email: ownerEmail, password: ownerPassword });

    await page.goto('/sessions/new', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const chatInput = page.locator('textarea[data-session-chat-stop-scope="true"]').first();
    await expect(chatInput).toBeVisible({ timeout: 120_000 });

    // Trigger chat flow and rely on agent/tool renderer integration.
    await chatInput.fill('Tạo 3 multi-strategy backtest cho BTC-USDT');
    await chatInput.press('Enter');

    // Proposal card appears from propose_backtest_multi tool view.
    await expect(page.getByText(/Multi-strategy proposals/i)).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole('button', { name: /Approve/i }).first()).toBeVisible({ timeout: 60_000 });

    const approveButtons = page.getByRole('button', { name: /Approve|Approved/i });
    const count = await approveButtons.count();
    for (let i = 0; i < count; i += 1) {
      await approveButtons.nth(i).click();
    }

    const runAll = page.getByRole('button', { name: /Run All Approved/i });
    await expect(runAll).toBeEnabled({ timeout: 60_000 });
    await runAll.click();

    await expect(page.getByText('Comparison Visualizer')).toBeVisible({ timeout: 300_000 });
    await expect(page.getByText('Equity Curve Overlay')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText('Correlation Heatmap')).toBeVisible({ timeout: 120_000 });
  });
});
