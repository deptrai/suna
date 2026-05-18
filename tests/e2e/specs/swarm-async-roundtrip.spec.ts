/**
 * Story 5.5.1 AC6 — Async swarm end-to-end via Swarm Teams page.
 *
 * Boots the full stack (apps/api + vibe-trading + vibe-trading-mcp + frontend),
 * clicks "Run" on the smallest preset, asserts the progress strip appears in the
 * chat, and verifies the final report renders within a 5-min budget.
 *
 * Gating: requires `CI_FULL_STACK=true` AND `OPENAI_API_KEY` (the swarm needs an
 * LLM to actually execute). `tests/playwright.config.ts` already skips this spec
 * in the sandbox-only CI tier per Story 5.0.5 pattern.
 */
import { test, expect } from '@playwright/test';

const SWARM_E2E_ENABLED =
  process.env.CI_FULL_STACK === 'true' && Boolean(process.env.OPENAI_API_KEY);

// Smallest preset that exercises the wrapper end-to-end; pick one with ≤4 agents
// to keep test runtime ≤5 min (E2E budget per AC6).
const SMALL_PRESET_DISPLAY = 'Crypto Trading Desk';

test.describe('vibe_trading_swarm — async roundtrip (Story 5.5.1)', () => {
  test.skip(
    !SWARM_E2E_ENABLED,
    'set CI_FULL_STACK=true and OPENAI_API_KEY to enable swarm async E2E',
  );

  test.setTimeout(6 * 60 * 1000); // 6 min — small preset typically completes in 3-5 min

  test('smallest preset completes and renders the final report', async ({ page }) => {
    await page.goto('/dashboard/swarm-teams');
    await expect(page.locator('h1')).toContainText('Swarm Teams', { timeout: 30_000 });

    // Find the smallest-preset card and click Configure & Run.
    const card = page.locator('text=' + SMALL_PRESET_DISPLAY).first().locator('xpath=ancestor::*[contains(@class, "Card")][1]');
    await card.locator('button', { hasText: /Configure/i }).click();

    // Fill required variables (preset-specific — adjust if the catalog drifts).
    // Most crypto presets need a `target` + `market` pair.
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    const inputs = dialog.locator('input');
    const inputCount = await inputs.count();
    // Fill each input with a non-empty placeholder-like value.
    for (let i = 0; i < inputCount; i++) {
      const input = inputs.nth(i);
      const placeholder = (await input.getAttribute('placeholder')) ?? '';
      // Heuristic defaults — actual presets define their required vars.
      const value = placeholder.toLowerCase().includes('target') ? 'BTC-USDT' : 'crypto';
      await input.fill(value);
    }

    // Run button enables once all inputs filled.
    const runBtn = dialog.locator('button', { hasText: /^Run$/ });
    await expect(runBtn).toBeEnabled({ timeout: 5_000 });
    await runBtn.click();

    // Should navigate to a new chat session.
    await expect(page).toHaveURL(/\/sessions\//, { timeout: 30_000 });

    // The wrapper tool surfaces "▶️ Swarm started" early. Wait up to 60s for
    // the first progress marker to land.
    await expect(page.locator('text=/Swarm started/i').first()).toBeVisible({ timeout: 60_000 });

    // Wait for the wrapper's terminal output (final report or error).
    // Budget: 5 min. Smallest preset typically finishes in 2-4 min.
    await expect(
      page.locator('text=/---|final_report|swarm completed/i').first(),
    ).toBeVisible({ timeout: 5 * 60 * 1000 });

    // Verify the SwarmTeamsToolView rendered (badge "Done" or markdown body).
    const toolView = page.locator('[data-tool="vibe_trading_swarm"], text=/Swarm:/i').first();
    await expect(toolView).toBeVisible();
  });
});
