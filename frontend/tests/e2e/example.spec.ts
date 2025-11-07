import { test, expect } from '../support/fixtures';

/**
 * Example Test Suite
 * 
 * Demonstrates:
 * - Basic page navigation
 * - Using fixtures (userFactory)
 * - API-first test setup
 * - UI validation
 */

test.describe('Example Test Suite', () => {
  test('should load homepage', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check if page contains Epsilon branding or hero section
    // The homepage has NewHeroSection component
    const heroSection = page.locator('main').first();
    await expect(heroSection).toBeVisible();
  });

  test.skip('should navigate to auth page', async ({ page }) => {
    // Skip this test until actual auth implementation is ready
    // This demonstrates the pattern for testing authentication flows
    
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    
    // Verify auth page loaded (adjust selector based on actual implementation)
    const authContainer = page.locator('body');
    await expect(authContainer).toBeVisible();
  });

  test('should verify page structure', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Verify main content exists
    const main = page.locator('main');
    await expect(main).toBeVisible();
    
    // Verify page has content (not just blank)
    const body = page.locator('body');
    const textContent = await body.textContent();
    expect(textContent?.length).toBeGreaterThan(0);
  });
});

