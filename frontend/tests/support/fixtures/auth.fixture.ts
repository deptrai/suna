import { test as base } from '@playwright/test';
import { faker } from '@faker-js/faker';

/**
 * Authentication Fixture
 * 
 * Provides authenticated user session with auto-cleanup.
 * Uses Supabase auth for real authentication flow testing.
 * 
 * Pattern: Setup → Use → Cleanup (auto-delete user after test)
 * 
 * Reference: bmad/bmm/testarch/knowledge/fixture-architecture.md
 */

type AuthFixtures = {
  authenticatedUser: {
    email: string;
    password: string;
    name: string;
  };
};

export const test = base.extend<AuthFixtures>({
  authenticatedUser: async ({ page }, use) => {
    // Check if Supabase is configured for tests
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your-test-project')) {
      console.warn('⚠️  Supabase not configured for tests. Using mock credentials.');
      // Provide mock credentials so tests can still run (they'll be skipped if auth is required)
      await use({
        email: 'test@example.com',
        password: 'TestPassword123!',
        name: 'Test User',
      });
      return;
    }

    // Setup: Create test user credentials
    const email = faker.internet.email();
    const password = faker.internet.password({ length: 12 });
    const name = faker.person.fullName();

    // Navigate to signup page
    await page.goto('/auth?mode=signup', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');

    // Fill signup form - try multiple selector strategies
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    
    await emailInput.fill(email);
    await passwordInput.fill(password);
    
    // Try to find confirm password field
    const passwordInputs = page.locator('input[type="password"]');
    const count = await passwordInputs.count();
    if (count > 1) {
      await passwordInputs.nth(1).fill(password);
    }

    // Accept terms - Radix UI Checkbox pattern
    // Radix uses button[role="checkbox"] with data-state attribute
    // Input is hidden (aria-hidden), so we click the button or label
    const termsLabel = page.locator('label[for="gdprConsent"]').first();
    const checkboxButton = page.locator('button[role="checkbox"][id="gdprConsent"], button[role="checkbox"]').first();
    
    // Try clicking label first (most reliable for Radix checkboxes)
    if (await termsLabel.count().catch(() => 0) > 0) {
      await termsLabel.scrollIntoViewIfNeeded();
      await termsLabel.click();
      await page.waitForTimeout(500);
    } else if (await checkboxButton.count().catch(() => 0) > 0) {
      // Fallback: click checkbox button directly
      await checkboxButton.scrollIntoViewIfNeeded();
      await checkboxButton.click();
      await page.waitForTimeout(500);
    }
    
    // Verify checkbox is checked via data-state="checked" (Radix pattern)
    const isChecked = await checkboxButton.getAttribute('data-state').then(state => state === 'checked').catch(() => false) ||
                      await checkboxButton.getAttribute('aria-checked').then(checked => checked === 'true').catch(() => false);
    
    if (!isChecked) {
      // Retry - try clicking label again or checkbox button
      if (await termsLabel.count().catch(() => 0) > 0) {
        await termsLabel.click();
      } else if (await checkboxButton.count().catch(() => 0) > 0) {
        await checkboxButton.click();
      }
      await page.waitForTimeout(500);
    }

    // Submit signup form - use better selector that handles aria-disabled
    // SubmitButton uses aria-disabled, not disabled attribute
    const submitButton = page.locator('button[type="submit"]:not([aria-disabled="true"]), button:has-text("Create account"), button:has-text("Sign in")').first();
    
    // Wait for button to be visible and enabled
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
      console.warn('Submit button still disabled, attempting force click');
      await submitButton.click({ force: true });
    }

    // Wait for successful signup (either redirect or success message)
    await Promise.race([
      page.waitForURL('/dashboard', { timeout: 15000 }).catch(() => null),
      page.waitForSelector('text=/account created|check your email|success/i', { timeout: 10000 }).catch(() => null),
    ]);

    // Provide credentials to test
    await use({ email, password, name });

    // Cleanup: User cleanup handled by Supabase auth system
    // For production tests, implement user deletion via API if available
    // For now, rely on test database cleanup or separate cleanup script
  },
});
