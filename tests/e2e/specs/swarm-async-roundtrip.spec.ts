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
import { test, expect, type Page } from '@playwright/test';
import { apiBase, loginToDashboard, ownerEmail, ownerPassword } from '../helpers/auth';

const SWARM_E2E_ENABLED =
  process.env.CI_FULL_STACK === 'true' && Boolean(process.env.OPENAI_API_KEY);

// Smallest preset that exercises the wrapper end-to-end; pick one with ≤4 agents
// to keep test runtime ≤5 min (E2E budget per AC6).
const SMALL_PRESET_DISPLAY = 'Crypto Trading Desk';

async function bootstrapAndLogin(page: Page) {
  // Bootstrap-owner is idempotent; second call with same email returns 409 (ok).
  await page.request.post(`${apiBase}/setup/bootstrap-owner`, {
    data: { email: ownerEmail, password: ownerPassword },
  }).catch(() => undefined);
  await loginToDashboard(page, { email: ownerEmail, password: ownerPassword });
}

test.describe('vibe_trading_swarm — async roundtrip (Story 5.5.1)', () => {
  test.skip(
    !SWARM_E2E_ENABLED,
    'set CI_FULL_STACK=true and OPENAI_API_KEY to enable swarm async E2E',
  );

  test.setTimeout(6 * 60 * 1000); // 6 min — small preset typically completes in 3-5 min

  test('smallest preset completes and renders the final report', async ({ page }) => {
    // Auth setup so the dashboard route doesn't redirect to /auth/...
    // (Story 5.5.1 review finding H2 / EC-4.)
    await bootstrapAndLogin(page);

    await page.goto('/dashboard/swarm-teams');
    await expect(page.locator('h1')).toContainText('Swarm Teams', { timeout: 30_000 });

    // Find the smallest-preset card and click Configure & Run. Prefer the
    // data-testid attribute; fall back to text-based XPath ancestor for
    // backward compat. (Story 5.5.1 review finding H6 + M3.)
    const cardByTestId = page.locator('[data-testid="preset-card"]', { hasText: SMALL_PRESET_DISPLAY });
    const cardByText = page.locator('text=' + SMALL_PRESET_DISPLAY).first()
      .locator('xpath=ancestor::*[contains(@class, "Card")][1]');
    const card = (await cardByTestId.count()) > 0 ? cardByTestId.first() : cardByText;
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

    // Wait for the wrapper's terminal output. Match the unambiguous
    // `=== SWARM REPORT ===` separator (Story 5.5.1 H1) plus secondary
    // "Done" badge or "swarm completed" text.
    // Budget: 5 min. Smallest preset typically finishes in 2-4 min.
    await expect(
      page.locator('text=/=== SWARM REPORT ===|swarm completed|^Done$/i').first(),
    ).toBeVisible({ timeout: 5 * 60 * 1000 });

    // Verify the SwarmTeamsToolView rendered. Prefer the data-testid that
    // the component sets; fall back to the "Swarm:" header. The
    // [data-tool="..."] selector from the original spec did not match any
    // real DOM attribute (Story 5.5.1 review finding H6 / EC-7).
    const toolView = page.locator(
      '[data-testid="oc-vibe-trading-swarm-view"], text=/Swarm:/i',
    ).first();
    await expect(toolView).toBeVisible();
  });
});
