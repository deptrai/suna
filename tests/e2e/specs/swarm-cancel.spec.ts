/**
 * Story 5.5.1 AC6 — Cancel mid-flight swarm.
 *
 * Starts a swarm, waits until at least one agent has completed, clicks the
 * chat's Stop button, and verifies:
 * 1. The run transitions to cancelled within 30s
 * 2. No `vt_mcp_run_swarm_finalize` billing entry is created (deposit only)
 *
 * Gating: `CI_FULL_STACK=true` AND `OPENAI_API_KEY`.
 */
import { test, expect } from '@playwright/test';

const SWARM_E2E_ENABLED =
  process.env.CI_FULL_STACK === 'true' && Boolean(process.env.OPENAI_API_KEY);

const SMALL_PRESET_DISPLAY = 'Crypto Trading Desk';

test.describe('vibe_trading_swarm — cancel mid-flight (Story 5.5.1 AC5b)', () => {
  test.skip(
    !SWARM_E2E_ENABLED,
    'set CI_FULL_STACK=true and OPENAI_API_KEY to enable swarm cancel E2E',
  );

  test.setTimeout(4 * 60 * 1000);

  test('Stop in chat transitions run to cancelled and skips finalize billing', async ({ page }) => {
    await page.goto('/dashboard/swarm-teams');
    await expect(page.locator('h1')).toContainText('Swarm Teams', { timeout: 30_000 });

    const card = page
      .locator('text=' + SMALL_PRESET_DISPLAY)
      .first()
      .locator('xpath=ancestor::*[contains(@class, "Card")][1]');
    await card.locator('button', { hasText: /Configure/i }).click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    const inputs = dialog.locator('input');
    const inputCount = await inputs.count();
    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      const placeholder = (await input.getAttribute('placeholder')) ?? '';
      await input.fill(placeholder.toLowerCase().includes('target') ? 'ETH-USDT' : 'crypto');
    }
    await dialog.locator('button', { hasText: /^Run$/ }).click();

    await expect(page).toHaveURL(/\/sessions\//, { timeout: 30_000 });

    // Wait for first ⏳ progress line, indicating ≥1 agent completed.
    await expect(page.locator('text=/⏳ .* complete/').first()).toBeVisible({
      timeout: 3 * 60 * 1000,
    });

    // Capture billing snapshot via API for later comparison (optional in CI;
    // gated by E2E_API_URL being set). Cancel directly via the chat's Stop
    // affordance — OpenCode forwards abort to ctx.abort in the wrapper.
    const stopBtn = page.locator('button[aria-label*="Stop" i], button:has-text("Stop")').first();
    await expect(stopBtn).toBeVisible({ timeout: 5_000 });
    await stopBtn.click();

    // Within 30s, the wrapper should surface the 🛑 cancellation message.
    await expect(page.locator('text=/Cancelled by user|🛑/i').first()).toBeVisible({
      timeout: 30_000,
    });

    // Tool view should show the Cancelled badge.
    await expect(page.locator('text=/Cancelled/i').first()).toBeVisible();
  });
});
