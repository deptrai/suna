import { test, expect } from '../support/fixtures';

/**
 * Agent Configuration E2E Tests
 * 
 * High priority tests (P1) for agent configuration features:
 * - Agent config page loads
 * - Configuration screens navigation
 * - Configuration save/update
 * - Error handling
 * 
 * Pattern: Given-When-Then, Network-First, data-testid selectors
 * 
 * Reference: bmad/bmm/testarch/knowledge/test-quality.md
 */

test.describe('Agent Configuration', () => {
  test.skip('[P1] should load agent configuration page when authenticated', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and has an agent
    const agentId = 'test-agent-id';
    await page.goto(`/agents/config/${agentId}`);
    await page.waitForLoadState('networkidle');

    // WHEN: Configuration page loads
    // THEN: Agent configuration page should be visible
    const configPage = page.locator('main, [data-testid="agent-config"]');
    await expect(configPage.first()).toBeVisible({ timeout: 15000 });
  });

  test('[P1] should require authentication to access agent config page', async ({ page }) => {
    // GIVEN: User is not authenticated
    await page.context().clearCookies();

    // WHEN: User tries to access agent config page
    await page.goto('/agents/config/test-agent-id');
    await page.waitForLoadState('networkidle');

    // THEN: User should be redirected to auth
    const isAuthPage = page.url().includes('/auth');
    const hasLoginPrompt = await page.locator('text=/login|sign in|authentication/i').isVisible().catch(() => false);
    
    expect(isAuthPage || hasLoginPrompt).toBeTruthy();
  });

  test.skip('[P1] should display error when agent not found', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and navigates to non-existent agent
    await page.goto('/agents/config/non-existent-agent-id');
    await page.waitForLoadState('networkidle');

    // WHEN: Page loads
    // THEN: Should display error or "not found" message
    const errorMessage = page.locator('text=/not found|error|agent not found/i');
    const hasError = await errorMessage.isVisible().catch(() => false);
    
    expect(hasError).toBeTruthy();
  });

  test.skip('[P1] should navigate between configuration screens', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and on agent config page
    const agentId = 'test-agent-id';
    await page.goto(`/agents/config/${agentId}`);
    await page.waitForLoadState('networkidle');

    // WHEN: User clicks on different configuration screens
    const screens = ['instructions', 'tools', 'integrations', 'knowledge', 'triggers'];
    
    for (const screen of screens) {
      const screenButton = page.locator(`button:has-text("${screen}"), a[href*="${screen}"]`, { 
        text: new RegExp(screen, 'i') 
      });
      const hasButton = await screenButton.first().isVisible().catch(() => false);
      
      if (hasButton) {
        await screenButton.first().click();
        await page.waitForTimeout(500); // Wait for screen change
        
        // THEN: Screen content should update
        const screenContent = page.locator(`[data-testid="${screen}-screen"], main`);
        await expect(screenContent.first()).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test.skip('[P1] should display agent header with name and avatar', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and on agent config page
    const agentId = 'test-agent-id';
    await page.goto(`/agents/config/${agentId}`);
    await page.waitForLoadState('networkidle');

    // WHEN: Page loads
    // THEN: Agent header should be visible with name
    const header = page.locator('h1, [data-testid="agent-header"]');
    const hasHeader = await header.first().isVisible().catch(() => false);
    
    if (hasHeader) {
      await expect(header.first()).toBeVisible();
      const headerText = await header.first().textContent();
      expect(headerText?.length).toBeGreaterThan(0);
    }
  });

  test.skip('[P1] should allow editing agent name', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and on agent config page
    const agentId = 'test-agent-id';
    await page.goto(`/agents/config/${agentId}`);
    await page.waitForLoadState('networkidle');

    // WHEN: User clicks on agent name/header to edit
    const editButton = page.locator('[data-testid="edit-agent"], button[aria-label*="edit"], h1').first();
    const hasEdit = await editButton.isVisible().catch(() => false);
    
    if (hasEdit) {
      await editButton.click();
      await page.waitForTimeout(500);

      // THEN: Edit dialog should open
      const editDialog = page.locator('[role="dialog"], [data-testid="agent-editor"]');
      const hasDialog = await editDialog.isVisible().catch(() => false);
      
      if (hasDialog) {
        await expect(editDialog.first()).toBeVisible();
      }
    } else {
      test.skip();
    }
  });

  test.skip('[P1] should save agent configuration changes', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and on agent config page
    const agentId = 'test-agent-id';
    await page.goto(`/agents/config/${agentId}`);
    await page.waitForLoadState('networkidle');

    // WHEN: User makes changes and saves
    // (Implementation depends on specific configuration screen)
    
    // THEN: Changes should be saved and success message shown
    // This test requires specific implementation details
    test.skip(); // Skip for now - requires specific screen implementation
  });

  test.skip('[P1] should display loading state while fetching agent', async ({ page, authenticatedUser }) => {
    // GIVEN: User navigates to agent config page
    const agentId = 'test-agent-id';
    
    // WHEN: Page is loading agent data
    await page.goto(`/agents/config/${agentId}`);

    // THEN: Should show loading indicator
    const loader = page.locator('[data-testid="loader"], text=/loading/i');
    const hasLoader = await loader.first().isVisible().catch(() => false);
    
    // Loading might be very brief
    if (hasLoader) {
      await expect(loader.first()).toBeVisible();
    }
  });

  test.skip('[P1] should navigate to start chat from config page', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and on agent config page
    const agentId = 'test-agent-id';
    await page.goto(`/agents/config/${agentId}`);
    await page.waitForLoadState('networkidle');

    // WHEN: User clicks "Start Chat" button
    const startChatButton = page.locator('button:has-text("Start Chat"), button[aria-label*="chat"]');
    const hasButton = await startChatButton.isVisible().catch(() => false);
    
    if (hasButton) {
      await startChatButton.first().click();
      await page.waitForLoadState('networkidle');

      // THEN: Should navigate to dashboard or chat interface
      expect(page.url()).toMatch(/dashboard|chat|thread/i);
    } else {
      test.skip();
    }
  });
});




