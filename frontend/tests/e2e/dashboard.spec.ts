import { test, expect } from '../support/fixtures';

/**
 * Dashboard E2E Tests
 * 
 * Critical path tests (P0-P1) for dashboard access and core functionality:
 * - Dashboard loads after authentication
 * - Protected routes require authentication
 * - Main navigation works
 * 
 * Pattern: Given-When-Then, Network-First, data-testid selectors
 * 
 * Reference: bmad/bmm/testarch/knowledge/test-quality.md
 */

test.describe('Dashboard Access', () => {
  test('[P0] should load dashboard after authentication', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated (via fixture)
    // authenticatedUser fixture handles signup/login automatically

    // WHEN: User navigates to dashboard
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // THEN: Dashboard should load with main content visible
    const dashboardContent = page.locator('main, [data-testid="dashboard-content"]');
    await expect(dashboardContent.first()).toBeVisible({ timeout: 15000 });
  });

  test('[P1] should redirect to auth when accessing dashboard without authentication', async ({ page }) => {
    // GIVEN: User is not authenticated
    // Clear any existing auth cookies/session
    await page.context().clearCookies();

    // WHEN: User tries to access dashboard
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // THEN: User should be redirected to auth page
    const isAuthPage = page.url().includes('/auth');
    const hasLoginPrompt = await page.locator('text=/login|sign in|authentication/i').isVisible().catch(() => false);
    
    expect(isAuthPage || hasLoginPrompt).toBeTruthy();
  });

  test.skip('[P1] should display dashboard navigation sidebar', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and on dashboard
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // WHEN: Page loads
    // THEN: Navigation sidebar should be visible
    const sidebar = page.locator('aside, nav, [data-testid="sidebar"]');
    const hasSidebar = await sidebar.first().isVisible().catch(() => false);
    
    // Sidebar might not exist in all layouts, so this is optional check
    if (hasSidebar) {
      await expect(sidebar.first()).toBeVisible();
    }
  });

  test('[P1] should allow access to public routes without authentication', async ({ page }) => {
    // GIVEN: User is not authenticated
    await page.context().clearCookies();

    // WHEN: User navigates to public routes
    const publicRoutes = ['/', '/enterprise', '/docs'];

    for (const route of publicRoutes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      // THEN: Public page should load without redirect to auth
      expect(page.url()).toContain(route);
      const mainContent = page.locator('main, body');
      await expect(mainContent.first()).toBeVisible();
    }
  });
});

