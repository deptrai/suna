import { test, expect } from '@playwright/test';
import { apiBase, ensureServicesHealthy, loginToDashboard, ownerEmail, ownerPassword } from '../helpers/auth';

const enabled = process.env.BACKTEST_E2E_ENABLED === 'true';

async function bootstrapOwnerLogin(
  page: import('@playwright/test').Page,
): Promise<{ email: string; password: string }> {
  const preferredEmail = ownerEmail;
  const password = ownerPassword;

  const bootstrapRes = await page.request.post(`${apiBase}/setup/bootstrap-owner`, {
    data: { email: preferredEmail, password },
  });
  expect([200, 409]).toContain(bootstrapRes.status());

  if (bootstrapRes.status() === 200) {
    return { email: preferredEmail, password };
  }

  const body = (await bootstrapRes.json().catch(() => ({}))) as { error?: string };
  const existingEmail = (body.error ?? '').match(/\(([^)]+)\)/)?.[1];
  if (!existingEmail) {
    throw new Error(`bootstrap-owner conflict without parseable email: ${body.error ?? 'unknown error'}`);
  }

  // Reset credentials for the real owner account so E2E can authenticate reliably.
  const resetRes = await page.request.post(`${apiBase}/setup/bootstrap-owner`, {
    data: { email: existingEmail, password },
  });
  expect(resetRes.status()).toBe(200);
  return { email: existingEmail, password };
}

async function waitForAppReady(page: import('@playwright/test').Page): Promise<void> {
  const signingStatus = page.getByText(/Signing in|Authenticating|Connecting/i);
  if (await signingStatus.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await signingStatus.first().waitFor({ state: 'hidden', timeout: 120_000 }).catch(() => {});
  }

  // BIOS / setup overlays can briefly block pointer events.
  await page.getByText(/EPSILON BIOS/i).waitFor({ state: 'detached', timeout: 120_000 }).catch(() => {});
  const onboardingBtn = page.getByRole('button', { name: /get started/i });
  if (await onboardingBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await onboardingBtn.click();
    await page.waitForTimeout(1_000);
  }
}

async function clearBacktestDrafts(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const prefixes = ['chainlens:backtest:multi-draft:', 'chainlens:backtest:draft:'];
    const keys = Object.keys(window.sessionStorage);
    for (const key of keys) {
      if (prefixes.some((prefix) => key.startsWith(prefix))) {
        window.sessionStorage.removeItem(key);
      }
    }
    const localKeys = Object.keys(window.localStorage);
    for (const key of localKeys) {
      if (prefixes.some((prefix) => key.startsWith(prefix))) {
        window.localStorage.removeItem(key);
      }
    }
  });
}

async function ensureWorkspaceEntered(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/instances', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitForAppReady(page);

  const openInstanceBtn = page.getByRole('button', { name: /open instance/i }).first();
  if (await openInstanceBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await openInstanceBtn.click();
    await page.waitForURL(/\/(instances\/[^/]+\/dashboard|dashboard)/, { timeout: 120_000 });
    await waitForAppReady(page);
    return;
  }

  const createWorkspaceBtn = page.getByRole('button', { name: /get started|create instance|new workspace/i }).first();
  if (await createWorkspaceBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await createWorkspaceBtn.click();
    await page.waitForTimeout(3_000);
    await page.goto('/instances', { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await waitForAppReady(page);
    await expect(openInstanceBtn).toBeVisible({ timeout: 120_000 });
    await openInstanceBtn.click();
    await page.waitForURL(/\/(instances\/[^/]+\/dashboard|dashboard)/, { timeout: 120_000 });
    await waitForAppReady(page);
    return;
  }

  throw new Error('Could not find an existing workspace or create-workspace CTA on /instances');
}

test.describe('Multi strategy backtest', () => {
  test.skip(!enabled, 'Set BACKTEST_E2E_ENABLED=true to run live VT backtest E2E');

  test('add 3 strategies, run all, and render comparison sections', async ({ page }) => {
    test.setTimeout(900_000);

    const creds = await bootstrapOwnerLogin(page);

    await ensureServicesHealthy(page);
    await loginToDashboard(page, creds);
    await ensureWorkspaceEntered(page);
    await page.goto('/dashboard/backtest?onboarding-skip=1', { waitUntil: 'commit', timeout: 120_000 });
    await waitForAppReady(page);
    await clearBacktestDrafts(page);

    const backtestHeading = page.getByRole('heading', { name: /Backtest Strategy/i });
    const connectingStatus = page.getByText(/Signing in|Authenticating|Connecting/i);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await Promise.allSettled([
        page.goto('/dashboard/backtest?onboarding-skip=1', { waitUntil: 'domcontentloaded', timeout: 120_000 }),
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

    await waitForAppReady(page);

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

    const creds = await bootstrapOwnerLogin(page);

    await ensureServicesHealthy(page);
    await loginToDashboard(page, creds);
    await ensureWorkspaceEntered(page);
    await page.goto('/dashboard?onboarding-skip=1', { waitUntil: 'commit', timeout: 120_000 });
    await waitForAppReady(page);
    await clearBacktestDrafts(page);

    // Open a fresh chat session from sidebar.
    await expect(page.getByRole('button', { name: /new session/i })).toBeVisible({ timeout: 120_000 });
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

  // Task 8.4 regression test (added by /bmad-code-review 2026-05-21):
  // Verify chat → contextual modal → SINGLE-strategy flow still works after
  // multi-strategy toggle was added. Without this, single-flow could silently
  // regress when changes land in `contextual-backtest-modal`.
  test('chat flow: contextual modal SINGLE strategy still runs (regression — Task 8.4)', async ({ page }) => {
    test.setTimeout(900_000);

    const creds = await bootstrapOwnerLogin(page);

    await ensureServicesHealthy(page);
    await loginToDashboard(page, creds);
    await ensureWorkspaceEntered(page);
    await page.goto('/dashboard?onboarding-skip=1', { waitUntil: 'commit', timeout: 120_000 });
    await waitForAppReady(page);
    await clearBacktestDrafts(page);

    await expect(page.getByRole('button', { name: /new session/i })).toBeVisible({ timeout: 120_000 });
    await page.getByRole('button', { name: /new session/i }).click();
    await page.waitForURL(/\/sessions\//, { timeout: 120_000 });

    const strategyBlock = [
      '```json',
      '{',
      '  "simulation_environment": {',
      '    "exchange": "okx",',
      '    "instrument_type": "SPOT",',
      '    "initial_capital": "10000",',
      '    "historical_range": 60,',
      '    "trading_fees": "0.001",',
      '    "slippage_tolerance": "0.002"',
      '  },',
      '  "risk_management": {',
      '    "max_drawdown_percentage": "0.15",',
      '    "position_sizing": "0.2",',
      '    "stop_loss": "0.05",',
      '    "take_profit": "0.10"',
      '  },',
      '  "context_rules": {',
      '    "assets": ["ETH-USDT"],',
      '    "timeframe": "1h",',
      '    "indicators": ["RSI_14"],',
      '    "natural_language_rules": "Buy oversold, sell overbought."',
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

    const firstCodeBlock = page.locator('pre').first();
    await firstCodeBlock.hover();
    const contextualBtn = page.getByRole('button', { name: /review & run backtest/i }).first();
    await expect(contextualBtn).toBeVisible({ timeout: 60_000 });
    await contextualBtn.click();

    // Modal opens in single mode (default).
    await expect(page.getByRole('heading', { name: /contextual backtest/i })).toBeVisible({ timeout: 30_000 });

    // Single Strategy button should be the active mode. Multi-tab editor heading
    // must NOT be visible (we never switched).
    await expect(page.getByRole('heading', { name: /multi-strategy editor/i })).toBeHidden();

    // Single-strategy "Run Backtest" should be present (NOT "Run All").
    const singleRunBtn = page.getByRole('button', { name: /^run backtest$/i }).first();
    await expect(singleRunBtn).toBeVisible({ timeout: 30_000 });
    await expect(singleRunBtn).toBeEnabled();
  });
});
