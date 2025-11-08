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
    await expect(page).toHaveTitle(/Epsilon|Home/i);
  });

  test('should create user and login', async ({ page, userFactory }) => {
    // Create test user via factory (API-first setup)
    const user = await userFactory.createUser({
      email: 'test@example.com',
      name: 'Test User',
    });

    // Navigate to login page
    await page.goto('/login');

    // Fill login form using data-testid selectors
    await page.fill('[data-testid="email-input"]', user.email);
    await page.fill('[data-testid="password-input"]', user.password);
    await page.click('[data-testid="login-button"]');

    // Assert login success
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible({ timeout: 10000 });
  });
});





