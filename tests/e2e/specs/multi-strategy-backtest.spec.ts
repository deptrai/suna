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
    await page.goto('/instances', { waitUntil: 'commit', timeout: 120_000 });

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

    // Wait for BIOS boot overlay to dismiss before interacting with the page.
    await page.getByText(/EPSILON BIOS/i).waitFor({ state: 'detached', timeout: 120_000 }).catch(() => {});
    // Dismiss onboarding overlay if present (appears after BIOS on first boot).
    const onboardingBtn = page.getByRole('button', { name: /get started/i });
    if (await onboardingBtn.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await onboardingBtn.click();
      // Wait for the overlay to clear after clicking.
      await page.waitForFunction(
        () => !document.querySelector('[class*="z-[80]"]'),
        { timeout: 30_000 },
      ).catch(() => {});
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

  test('chat flow: open contextual modal, switch to multi strategy, run all', async ({ page }) => {
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
    await page.goto('/instances', { waitUntil: 'commit', timeout: 120_000 });

    // Open a fresh chat session from sidebar.
    await page.getByRole('button', { name: /new session/i }).click();
    await page.waitForURL(/\/sessions\//, { timeout: 120_000 });

    // Send a strategy JSON code block so contextual backtest trigger appears in chat.
    const strategyBlock = [
      '```json',
      '{',
      '  "simulation_environment": {',
      '    "exchange": "okx",',
      '    "instrument_type": "SPOT",',
      '    "initial_capital": "15000",',
      '    "historical_range": 90,',
      '    "trading_fees": "0.001",',
      '    "slippage_tolerance": "0.002"',
      '  },',
      '  "risk_management": {',
      '    "max_drawdown_percentage": "0.15",',
      '    "position_sizing": "0.2",',
      '    "stop_loss": "0.05",',
      '    "take_profit": "0.15"',
      '  },',
      '  "context_rules": {',
      '    "assets": ["BTC-USDT"],',
      '    "timeframe": "4h",',
      '    "indicators": ["SMA_20", "SMA_50"],',
      '    "natural_language_rules": "Long when 20-SMA crosses above 50-SMA, exit on reverse cross."',
      '  },',
      '  "execution_flags": {',
      '    "enable_monte_carlo_stress_test": false,',
      '    "enable_rl_optimization": false',
      '  }',
      '}',
      '```',
    ].join('\n');

    const chatInput = page.locator('textarea[data-session-chat-stop-scope="true"]').first();
    await expect(chatInput).toBeVisible({ timeout: 120_000 });
    await chatInput.fill(strategyBlock);
    await chatInput.press('Enter');

    // Reveal and click contextual trigger on code block.
    const firstCodeBlock = page.locator('pre').first();
    await firstCodeBlock.hover();
    const contextualBtn = page.getByRole('button', { name: /review & run backtest/i }).first();
    await expect(contextualBtn).toBeVisible({ timeout: 60_000 });
    await contextualBtn.click();

    // Modal + multi mode.
    await expect(page.getByRole('heading', { name: /contextual backtest/i })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /multi strategy/i }).click();
    await expect(page.getByRole('heading', { name: /multi-strategy editor/i })).toBeVisible({ timeout: 30_000 });

    // Build 3 strategies and run all.
    const addBtn = page.getByRole('button', { name: /add strategy/i });
    await addBtn.click();
    await addBtn.click();

    const runAll = page.getByRole('button', { name: /run all/i });
    await expect(runAll).toBeEnabled();
    await runAll.click();

    // Wait until no strategy remains in running state.
    await expect(page.getByText(/Strategy \d+ · running/i)).toHaveCount(0, { timeout: 480_000 });

    // Comparison panels should be present.
    await expect(page.getByText('Comparison Visualizer')).toBeVisible({ timeout: 300_000 });
    await expect(page.getByText('Equity Curve Overlay')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Correlation Heatmap')).toBeVisible({ timeout: 60_000 });
  });
});
