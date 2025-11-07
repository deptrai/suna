import { test, expect } from '../support/fixtures';

/**
 * Projects Management E2E Tests
 * 
 * High priority tests (P1) for projects management features:
 * - Projects page loads
 * - Project navigation
 * - Thread access
 * 
 * Pattern: Given-When-Then, Network-First, data-testid selectors
 * 
 * Reference: bmad/bmm/testarch/knowledge/test-quality.md
 */

test.describe('Projects Management', () => {
  test.skip('[P1] should load projects page when authenticated', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // WHEN: User navigates to projects page
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // THEN: Projects page should load
    const projectsPage = page.locator('main, [data-testid="projects-page"]');
    await expect(projectsPage.first()).toBeVisible({ timeout: 15000 });
  });

  test('[P1] should require authentication to access projects page', async ({ page }) => {
    // GIVEN: User is not authenticated
    await page.context().clearCookies();

    // WHEN: User tries to access projects page
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // THEN: User should be redirected to auth
    const isAuthPage = page.url().includes('/auth');
    const hasLoginPrompt = await page.locator('text=/login|sign in|authentication/i').isVisible().catch(() => false);
    
    expect(isAuthPage || hasLoginPrompt).toBeTruthy();
  });

  test.skip('[P1] should display projects list when projects exist', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and on projects page
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // WHEN: Page loads
    // THEN: Projects list or empty state should be visible
    const projectsList = page.locator('[data-testid="projects-list"], [data-testid="projects-grid"]');
    const emptyState = page.locator('text=/no projects|create your first project|get started/i');
    
    const hasProjects = await projectsList.isVisible().catch(() => false);
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    
    expect(hasProjects || hasEmptyState).toBeTruthy();
  });
});


