import { test, expect } from '../support/fixtures';

/**
 * Agents Management E2E Tests
 * 
 * High priority tests (P1) for agents management features:
 * - Agents page loads
 * - Agent list displays
 * - Agent configuration access
 * 
 * Pattern: Given-When-Then, Network-First, data-testid selectors
 * 
 * Reference: bmad/bmm/testarch/knowledge/test-quality.md
 */

test.describe('Agents Management', () => {
  test.skip('[P1] should load agents page when authenticated', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // WHEN: User navigates to agents page
    await page.goto('/agents');
    await page.waitForLoadState('networkidle');

    // THEN: Agents page should load
    const agentsPage = page.locator('main, [data-testid="agents-page"]');
    await expect(agentsPage.first()).toBeVisible({ timeout: 15000 });
  });

  test('[P1] should require authentication to access agents page', async ({ page }) => {
    // GIVEN: User is not authenticated
    await page.context().clearCookies();

    // WHEN: User tries to access agents page
    await page.goto('/agents');
    await page.waitForLoadState('networkidle');

    // THEN: User should be redirected to auth
    const isAuthPage = page.url().includes('/auth');
    const hasLoginPrompt = await page.locator('text=/login|sign in|authentication/i').isVisible().catch(() => false);
    
    expect(isAuthPage || hasLoginPrompt).toBeTruthy();
  });

  test.skip('[P1] should display agents list when agents exist', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and on agents page
    await page.goto('/agents');
    await page.waitForLoadState('networkidle');

    // WHEN: Page loads
    // THEN: Agents list or empty state should be visible
    const agentsList = page.locator('[data-testid="agents-list"], [data-testid="agents-grid"]');
    const emptyState = page.locator('text=/no agents|create your first agent|get started/i');
    
    const hasAgents = await agentsList.isVisible().catch(() => false);
    const hasEmptyState = await emptyState.isVisible().catch(() => false);
    
    expect(hasAgents || hasEmptyState).toBeTruthy();
  });

  test.skip('[P1] should navigate to agent configuration page', async ({ page, authenticatedUser }) => {
    // GIVEN: User is on agents page with at least one agent
    await page.goto('/agents');
    await page.waitForLoadState('networkidle');

    // WHEN: User clicks on an agent or configuration button
    const agentCard = page.locator('[data-testid="agent-card"], [data-testid="agent-item"]').first();
    const configButton = page.locator('text=/config|settings|edit/i').first();
    
    const clickableElement = (await agentCard.isVisible().catch(() => false)) 
      ? agentCard 
      : configButton;

    if (await clickableElement.isVisible().catch(() => false)) {
      await clickableElement.click();
      await page.waitForLoadState('networkidle');

      // THEN: Should navigate to agent config page
      expect(page.url()).toMatch(/\/agents\/config\/|\/agents\/\[threadId\]/);
    } else {
      // No agents exist yet, skip this test
      test.skip();
    }
  });
});





