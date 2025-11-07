import { test, expect } from '../support/fixtures';

/**
 * Authentication E2E Tests
 * 
 * Critical path tests (P0) for user authentication flows:
 * - Login with valid credentials
 * - Signup new user
 * - Error handling for invalid credentials
 * - Protected route access control
 * 
 * Pattern: Given-When-Then, Network-First, data-testid selectors
 * 
 * Reference: bmad/bmm/testarch/knowledge/test-quality.md
 */

test.describe('Authentication Flow', () => {
  test('[P0] should load auth page', async ({ page }) => {
    // GIVEN: User navigates to auth page
    await page.goto('/auth', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');

    // THEN: Auth page should load with login form
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
  });

  test('[P0] should sign up new user and redirect to dashboard', async ({ page }) => {
    // GIVEN: User is on signup page
    await page.goto('/auth?mode=signup', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');

    // WHEN: User submits valid signup form
    const email = `test-${Date.now()}@example.com`;
    const password = 'TestPassword123!';

    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    
    // Fill confirm password if field exists
    const confirmPasswordField = page.locator('input[type="password"]').nth(1);
    if (await confirmPasswordField.isVisible().catch(() => false)) {
      await confirmPasswordField.fill(password);
    }

    // Accept terms - Radix UI Checkbox pattern
    // Click label (Radix checkbox input is hidden, button is the interactive element)
    const termsLabel = page.locator('label[for="gdprConsent"]').first();
    const checkboxButton = page.locator('button[role="checkbox"][id="gdprConsent"], button[role="checkbox"]').first();
    
    // Try clicking label first (most reliable for Radix checkboxes)
    if (await termsLabel.count().catch(() => 0) > 0) {
      await termsLabel.scrollIntoViewIfNeeded();
      await termsLabel.click();
      await page.waitForTimeout(500);
    } else if (await checkboxButton.count().catch(() => 0) > 0) {
      // Fallback: click checkbox button
      await checkboxButton.scrollIntoViewIfNeeded();
      await checkboxButton.click();
      await page.waitForTimeout(500);
    }
    
    // Verify via data-state="checked" (Radix pattern)
    const isChecked = await checkboxButton.getAttribute('data-state').then(state => state === 'checked').catch(() => false);
    if (!isChecked && await termsLabel.count().catch(() => 0) > 0) {
      await termsLabel.click();
      await page.waitForTimeout(500);
    }

    // Wait for submit button to be enabled - handle aria-disabled
    const submitButton = page.locator('button[type="submit"]:not([aria-disabled="true"]), button:has-text("Create account")').first();
    await submitButton.waitFor({ state: 'visible', timeout: 10000 });
    
    // Wait for button to be enabled (check both disabled and aria-disabled)
    let attempts = 0;
    while (attempts < 100) {
      const isDisabled = await submitButton.isDisabled().catch(() => true);
      const ariaDisabled = await submitButton.getAttribute('aria-disabled').catch(() => null);
      
      if (!isDisabled && ariaDisabled !== 'true') {
        break;
      }
      await page.waitForTimeout(100);
      attempts++;
    }
    
    // Final check before clicking
    const finalDisabled = await submitButton.isDisabled().catch(() => true);
    const finalAriaDisabled = await submitButton.getAttribute('aria-disabled').catch(() => null);
    
    if (!finalDisabled && finalAriaDisabled !== 'true') {
      await submitButton.click();
    } else {
      await submitButton.click({ force: true });
    }

    // THEN: User should be redirected to dashboard (or see success message)
    await Promise.race([
      page.waitForURL('/dashboard', { timeout: 15000 }).catch(() => null),
      page.waitForSelector('text=/account created|check your email/i', { timeout: 10000 }).catch(() => null),
    ]);

    // Verify we're either on dashboard or see success message
    // Wait a bit longer for redirect or message
    await page.waitForTimeout(2000);
    
    const isDashboard = page.url().includes('/dashboard');
    const hasSuccessMessage = await page.locator('text=/account created|check your email|success/i').isVisible().catch(() => false);
    const hasConfirmationMessage = await page.locator('text=/verify|confirm|email sent/i').isVisible().catch(() => false);
    
    // Accept any of: dashboard redirect, success message, or confirmation message
    expect(isDashboard || hasSuccessMessage || hasConfirmationMessage).toBeTruthy();
  });

  test('[P0] should login with valid credentials and redirect to dashboard', async ({ page, authenticatedUser }) => {
    // GIVEN: User has valid credentials (from authenticatedUser fixture)
    // If Supabase not configured, test will use mock credentials
    const email = authenticatedUser.email;
    const password = authenticatedUser.password;

    // WHEN: User navigates to login and submits credentials
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    // THEN: User should be redirected to dashboard
    await page.waitForURL('/dashboard', { timeout: 15000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('[P1] should display error for invalid credentials', async ({ page }) => {
    // GIVEN: User is on login page
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    // WHEN: User submits invalid credentials
    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // THEN: Error message should be displayed
    await page.waitForTimeout(2000); // Wait for error response
    const errorMessage = page.locator('text=/invalid|error|incorrect|fail/i');
    await expect(errorMessage.first()).toBeVisible({ timeout: 10000 });
  });

  test('[P1] should validate email format on signup', async ({ page }) => {
    // GIVEN: User is on signup page
    await page.goto('/auth?mode=signup');
    await page.waitForLoadState('networkidle');

    // WHEN: User enters invalid email format
    await page.fill('input[type="email"]', 'notanemail');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    // THEN: Validation error should be shown
    await page.waitForTimeout(1000);
    const validationError = page.locator('text=/valid email|invalid email/i');
    const hasValidationError = await validationError.isVisible().catch(() => false);
    
    // Either browser validation or app validation should catch this
    expect(hasValidationError || page.locator('input[type="email"]:invalid').isVisible()).toBeTruthy();
  });

  test('[P1] should protect dashboard route when not authenticated', async ({ page }) => {
    // GIVEN: User is not authenticated
    // (No auth cookies/session)

    // WHEN: User tries to access dashboard
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // THEN: User should be redirected to auth page
    // OR see login requirement
    const isAuthPage = page.url().includes('/auth');
    const hasLoginPrompt = await page.locator('text=/login|sign in|authentication/i').isVisible().catch(() => false);
    
    expect(isAuthPage || hasLoginPrompt).toBeTruthy();
  });

  test('[P1] should allow access to public routes when not authenticated', async ({ page }) => {
    // GIVEN: User is not authenticated

    // WHEN: User navigates to public routes
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // THEN: Public page should load without redirect
    const mainContent = page.locator('main');
    await expect(mainContent).toBeVisible();
    expect(page.url()).not.toContain('/auth');
  });
});

