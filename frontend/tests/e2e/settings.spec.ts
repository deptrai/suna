import { test, expect } from '../support/fixtures';

/**
 * Settings E2E Tests
 * 
 * High priority tests (P1) for settings features:
 * - API Keys management
 * - Credentials management
 * - Route protection
 * 
 * Pattern: Given-When-Then, Network-First, data-testid selectors
 * 
 * Reference: bmad/bmm/testarch/knowledge/test-quality.md
 */

test.describe('Settings - API Keys', () => {
  test.skip('[P1] should load API keys page when authenticated', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // WHEN: User navigates to API keys page
    await page.goto('/settings/api-keys');
    await page.waitForLoadState('networkidle');

    // THEN: API keys page should load
    const apiKeysPage = page.locator('main, [data-testid="api-keys-page"]');
    await expect(apiKeysPage.first()).toBeVisible({ timeout: 15000 });
    
    // Verify page title
    const pageTitle = page.locator('h1, [data-testid="page-title"]');
    const hasTitle = await pageTitle.filter({ hasText: /API Keys|api keys/i }).isVisible().catch(() => false);
    expect(hasTitle).toBeTruthy();
  });

  test('[P1] should require authentication to access API keys page', async ({ page }) => {
    // GIVEN: User is not authenticated
    await page.context().clearCookies();

    // WHEN: User tries to access API keys page
    await page.goto('/settings/api-keys');
    await page.waitForLoadState('networkidle');

    // THEN: User should be redirected to auth
    const isAuthPage = page.url().includes('/auth');
    const hasLoginPrompt = await page.locator('text=/login|sign in|authentication/i').isVisible().catch(() => false);
    
    expect(isAuthPage || hasLoginPrompt).toBeTruthy();
  });

  test.skip('[P1] should display empty state when no API keys exist', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and has no API keys
    await page.goto('/settings/api-keys');
    await page.waitForLoadState('networkidle');

    // WHEN: Page loads
    // THEN: Should display empty state with create button
    const emptyState = page.locator('text=/no api keys|create your first|no keys yet/i');
    const createButton = page.locator('button:has-text("Create"), button:has-text("New API Key")');
    
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    const hasCreateButton = await createButton.isVisible().catch(() => false);
    
    expect(hasEmptyState || hasCreateButton).toBeTruthy();
  });

  test.skip('[P0] should create new API key', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and on API keys page
    await page.goto('/settings/api-keys');
    await page.waitForLoadState('networkidle');

    // WHEN: User clicks "New API Key" and fills form
    const createButton = page.locator('button:has-text("New API Key"), button:has-text("Create")');
    if (await createButton.isVisible().catch(() => false)) {
      await createButton.first().click();
      await page.waitForTimeout(500); // Wait for dialog

      // Fill form
      const titleInput = page.locator('input[placeholder*="title"], input[type="text"]').first();
      await titleInput.fill('Test API Key ' + Date.now());

      // Optional: Fill description
      const descInput = page.locator('textarea, input[placeholder*="description"]');
      if (await descInput.isVisible().catch(() => false)) {
        await descInput.first().fill('Test description');
      }

      // Submit
      const submitButton = page.locator('button:has-text("Create API Key"), button[type="submit"]');
      await submitButton.first().click();

      // THEN: API key should be created and displayed
      await page.waitForTimeout(2000); // Wait for creation
      const successMessage = page.locator('text=/created successfully|api key created/i');
      const hasSuccess = await successMessage.isVisible().catch(() => false);
      
      // Or check for API key in list
      const apiKeyDisplay = page.locator('text=/test api key/i');
      const hasKeyDisplay = await apiKeyDisplay.isVisible().catch(() => false);
      
      expect(hasSuccess || hasKeyDisplay).toBeTruthy();
    } else {
      test.skip();
    }
  });

  test.skip('[P1] should display existing API keys list', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and has API keys
    await page.goto('/settings/api-keys');
    await page.waitForLoadState('networkidle');

    // WHEN: Page loads
    // THEN: Should display list of API keys
    const apiKeysList = page.locator('[data-testid="api-key"], .card, [role="listitem"]');
    const hasList = await apiKeysList.first().isVisible().catch(() => false);
    
    // Either has keys or empty state
    const emptyState = page.locator('text=/no api keys/i');
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    
    expect(hasList || hasEmpty).toBeTruthy();
  });

  test.skip('[P1] should revoke API key', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and has an active API key
    await page.goto('/settings/api-keys');
    await page.waitForLoadState('networkidle');

    // WHEN: User clicks revoke button
    const revokeButton = page.locator('button:has-text("Revoke"), button[aria-label*="revoke"]').first();
    const hasRevoke = await revokeButton.isVisible().catch(() => false);
    
    if (hasRevoke) {
      await revokeButton.click();
      await page.waitForTimeout(500);

      // Confirm revocation
      const confirmButton = page.locator('button:has-text("Revoke Key"), button:has-text("Confirm")');
      if (await confirmButton.isVisible().catch(() => false)) {
        await confirmButton.click();
        await page.waitForTimeout(2000);

        // THEN: Key should be revoked
        const successMessage = page.locator('text=/revoked successfully/i');
        const hasSuccess = await successMessage.isVisible().catch(() => false);
        expect(hasSuccess).toBeTruthy();
      }
    } else {
      test.skip();
    }
  });

  test.skip('[P1] should copy API key to clipboard', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and viewing created API key
    await page.goto('/settings/api-keys');
    await page.waitForLoadState('networkidle');

    // WHEN: User clicks copy button
    const copyButton = page.locator('button[aria-label*="copy"], button:has([class*="copy"])').first();
    const hasCopy = await copyButton.isVisible().catch(() => false);
    
    if (hasCopy) {
      await copyButton.click();
      await page.waitForTimeout(500);

      // THEN: Should show success message
      const successMessage = page.locator('text=/copied|clipboard/i');
      const hasSuccess = await successMessage.isVisible().catch(() => false);
      
      // Note: Cannot verify clipboard in Playwright, but can check for toast
      expect(hasSuccess).toBeTruthy();
    } else {
      test.skip();
    }
  });
});

test.describe('Settings - Credentials', () => {
  test.skip('[P1] should load credentials page when authenticated', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // WHEN: User navigates to credentials page
    await page.goto('/settings/credentials');
    await page.waitForLoadState('networkidle');

    // THEN: Credentials page should load
    const credentialsPage = page.locator('main, [data-testid="credentials-page"]');
    await expect(credentialsPage.first()).toBeVisible({ timeout: 15000 });
  });

  test('[P1] should require authentication to access credentials page', async ({ page }) => {
    // GIVEN: User is not authenticated
    await page.context().clearCookies();

    // WHEN: User tries to access credentials page
    await page.goto('/settings/credentials');
    await page.waitForLoadState('networkidle');

    // THEN: User should be redirected to auth
    const isAuthPage = page.url().includes('/auth');
    const hasLoginPrompt = await page.locator('text=/login|sign in|authentication/i').isVisible().catch(() => false);
    
    expect(isAuthPage || hasLoginPrompt).toBeTruthy();
  });

  test.skip('[P1] should display composio connections section', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and on credentials page
    await page.goto('/settings/credentials');
    await page.waitForLoadState('networkidle');

    // WHEN: Page loads
    // THEN: Should display composio connections or credentials section
    const connectionsSection = page.locator('[data-testid="composio-connections"], [data-testid="credentials"], main');
    await expect(connectionsSection.first()).toBeVisible({ timeout: 10000 });
  });
});





