import { test, expect, Page } from '@playwright/test';
import { ownerEmail, ownerPassword, apiBase, getAccessTokenFromPage } from '../helpers/auth';
import { waitForSandboxReady } from '../helpers/wait';

test.describe.serial('05 — Onboarding to Dashboard Flow', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('[P0] should bootstrap owner and sign in', async () => {
    test.setTimeout(120_000);
    // ── 1. Bootstrap owner (idempotent) ────────────────────────────
    const bootstrapRes = await page.request.post(`${apiBase}/setup/bootstrap-owner`, {
      data: { email: ownerEmail, password: ownerPassword },
    });
    expect(bootstrapRes.status()).toBe(200);

    // ── 2. Sign in ─────────────────────────────────────────────────
    await page.goto('/auth');

    const lockScreen = page.getByText('Click or press Enter to sign in');
    const signInHeading = page.getByRole('heading', { name: 'Sign in to Epsilon' });

    // Wait for either the lock screen or the sign in heading to be visible
    await expect(lockScreen.or(signInHeading)).toBeVisible({ timeout: 15_000 });

    if (await lockScreen.isVisible()) {
      await page.locator('div.fixed.inset-0.cursor-pointer').first().click({ force: true });
    }

    await expect(signInHeading).toBeVisible({ timeout: 15_000 });

    await page.locator('input[name="email"]').fill(ownerEmail);
    await page.locator('input[name="password"]').fill(ownerPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
  });

  test('[P0] should navigate through onboarding wizard', async () => {
    test.setTimeout(240_000);
    // ── 3. Wait for "Connect a provider" step ──────────────────────
    await expect(
      page.getByRole('heading', { name: /Connect a provider/i }),
    ).toBeVisible({ timeout: 180_000 });

    // ── 4. Wait for sandbox to be fully ready ──────────────────────
    const sandboxHealthUrl =
      process.env.E2E_SANDBOX_HEALTH_URL || 'http://localhost:14000/epsilon/health';
    await waitForSandboxReady(sandboxHealthUrl);

    // ── 5. Click "Configure LLM Provider" ──────────────────────────
    const configureBtn = page.getByRole('button', { name: /Configure LLM Provider/i });
    if (await configureBtn.isVisible()) {
      await configureBtn.click();
    }

    // ── 6. Try to advance past provider step ───────────────────────
    const continueBtn = page.getByRole('button', { name: /Continue/i });
    const skipBtn = page.getByRole('button', { name: /Skip for now/i });
    
    // Wait for either continue or skip to be visible indicating the next state
    await expect(continueBtn.or(skipBtn)).toBeVisible({ timeout: 10_000 });

    if (await continueBtn.isVisible()) {
      await continueBtn.click();
    } else if (await skipBtn.isVisible()) {
      await skipBtn.click();
    }
  });

  test('[P0] should skip onboarding to reach dashboard', async () => {
    test.setTimeout(60_000);
    // ── 8. Skip onboarding to reach dashboard ──────────────────────
    await page.goto('/onboarding?skip_onboarding=1');
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // ── 9. Verify dashboard content ────────────────────────────────
    await expect(page.getByRole('button', { name: /New session/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('[P1] should verify API access from dashboard', async () => {
    test.setTimeout(60_000);
    // ── 10. Verify API access from dashboard ───────────────────────
    const token = await getAccessTokenFromPage(page);
    expect(token).toBeTruthy();

    // Test SSH setup endpoint
    const sshRes = await page.request.post(`${apiBase}/platform/sandbox/ssh/setup`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(sshRes.status()).toBe(200);
    const sshData = await sshRes.json();
    expect(sshData.success).toBeTruthy();
  });

  test('[P1] should verify re-login works and retains authenticated state', async () => {
    test.setTimeout(120_000);
    // ── 11. Verify re-login works (user is authenticated) ──────────
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto('/auth');
    
    const lockScreen = page.getByText('Click or press Enter to sign in');
    const signInHeading = page.getByRole('heading', { name: 'Sign in to Epsilon' });

    await expect(lockScreen.or(signInHeading)).toBeVisible({ timeout: 15_000 });

    if (await lockScreen.isVisible()) {
      await page.locator('div.fixed.inset-0.cursor-pointer').first().click({ force: true });
    }

    // Login form should appear
    const emailInput = page.locator('input[name="email"]');
    await expect(emailInput).toBeVisible({ timeout: 10_000 });
    await emailInput.fill(ownerEmail);
    await page.locator('input[name="password"]').fill(ownerPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // After re-login: may go to dashboard, onboarding, or stay on /auth
    // showing the wizard. All are valid — the key test is that the user
    // is authenticated and sees either the wizard or the dashboard.
    
    const wizardHeading = page.getByRole('heading', { name: /Connect a provider/i });
    const newSessionBtn = page.getByRole('button', { name: /New session/i });

    // Wait for the UI to settle into either state
    await expect(wizardHeading.or(newSessionBtn)).toBeVisible({ timeout: 15_000 });

    const wizardVisible = await wizardHeading.isVisible();
    const dashboardVisible = await newSessionBtn.isVisible();
    const onboardingUrl = page.url().includes('/onboarding');
    const dashboardUrl = page.url().includes('/dashboard');

    expect(wizardVisible || dashboardVisible || onboardingUrl || dashboardUrl).toBe(true);
  });
});
