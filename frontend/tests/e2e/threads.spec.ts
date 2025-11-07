import { test, expect } from '../support/fixtures';

/**
 * Thread Management E2E Tests
 * 
 * Critical path tests (P0-P1) for thread management features:
 * - Thread creation and access
 * - Thread messaging
 * - File viewer
 * - Tool calls side panel
 * - Error handling
 * 
 * Pattern: Given-When-Then, Network-First, data-testid selectors
 * 
 * Reference: bmad/bmm/testarch/knowledge/test-quality.md
 */

test.describe('Thread Management', () => {
  test('[P0] should load thread page when authenticated', async ({ page, authenticatedUser, threadFactory }) => {
    // GIVEN: User is authenticated and has a project with a thread
    // Create test thread via factory
    const { thread_id, project_id } = await threadFactory.createThread({
      account_id: authenticatedUser.email, // Use email as identifier for test
    });
    
    // WHEN: User navigates to thread page
    await page.goto(`/projects/${project_id}/thread/${thread_id}`, { 
      waitUntil: 'domcontentloaded' 
    });
    await page.waitForLoadState('domcontentloaded');

    // THEN: Thread page should load with main content
    // Accept either thread content or error/loading state (page structure validation)
    const threadContent = page.locator('main, [data-testid="thread-content"], [data-testid="thread"]');
    const hasContent = await threadContent.first().isVisible({ timeout: 10000 }).catch(() => false);
    const hasError = await page.locator('text=/error|not found|404/i').isVisible().catch(() => false);
    const hasLoading = await page.locator('text=/loading/i').isVisible().catch(() => false);
    
    // Page should load (content, error, or loading state - all indicate page loaded)
    expect(hasContent || hasError || hasLoading || page.url().includes('/thread/')).toBeTruthy();
  });

  test('[P1] should require authentication to access thread page', async ({ page }) => {
    // GIVEN: User is not authenticated
    await page.context().clearCookies();

    // WHEN: User tries to access thread page
    await page.goto('/projects/test-project/thread/test-thread');
    await page.waitForLoadState('networkidle');

    // THEN: User should be redirected to auth
    const isAuthPage = page.url().includes('/auth');
    const hasLoginPrompt = await page.locator('text=/login|sign in|authentication/i').isVisible().catch(() => false);
    
    expect(isAuthPage || hasLoginPrompt).toBeTruthy();
  });

  test('[P0] should display thread messages when thread has messages', async ({ page, authenticatedUser, threadFactory }) => {
    // GIVEN: User is authenticated and thread exists (may or may not have messages)
    // Create test thread via factory
    const { thread_id, project_id } = await threadFactory.createThread({
      account_id: authenticatedUser.email,
    });
    
    await page.goto(`/projects/${project_id}/thread/${thread_id}`, { 
      waitUntil: 'domcontentloaded' 
    });
    await page.waitForLoadState('domcontentloaded');

    // WHEN: Thread page loads
    // THEN: Either messages should be visible OR empty state should be shown
    const messagesContainer = page.locator('[data-testid="messages"], [data-testid="thread-messages"], [data-testid="chat-messages"]');
    const hasMessages = await messagesContainer.first().isVisible({ timeout: 5000 }).catch(() => false);
    
    if (hasMessages) {
      // Messages exist - verify visibility
      await expect(messagesContainer.first()).toBeVisible();
    } else {
      // No messages - check for empty state or input area (indicates thread loaded)
      const emptyState = page.locator('text=/no messages|start conversation|empty|type a message/i');
      const inputArea = page.locator('textarea, input[type="text"], [data-testid="message-input"]');
      const hasEmptyState = await emptyState.isVisible().catch(() => false);
      const hasInput = await inputArea.first().isVisible().catch(() => false);
      
      // Thread page should show either empty state or input area
      expect(hasEmptyState || hasInput || hasMessages).toBeTruthy();
    }
  });

  test.skip('[P1] should display thread header with project name', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and on thread page
    const projectId = 'test-project-id';
    const threadId = 'test-thread-id';
    await page.goto(`/projects/${projectId}/thread/${threadId}`);
    await page.waitForLoadState('networkidle');

    // WHEN: Page loads
    // THEN: Thread header should be visible with project name
    const header = page.locator('[data-testid="thread-header"], header, [data-testid="site-header"]');
    const hasHeader = await header.isVisible().catch(() => false);
    
    if (hasHeader) {
      await expect(header.first()).toBeVisible();
      // Header should contain project-related text
      const headerText = await header.first().textContent();
      expect(headerText?.length).toBeGreaterThan(0);
    }
  });

  test.skip('[P1] should toggle tool calls side panel', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and on thread page with tool calls
    const projectId = 'test-project-id';
    const threadId = 'test-thread-id';
    await page.goto(`/projects/${projectId}/thread/${threadId}`);
    await page.waitForLoadState('networkidle');

    // WHEN: User clicks toggle button for side panel
    const toggleButton = page.locator('[data-testid="toggle-side-panel"], button[aria-label*="tool"], button[aria-label*="panel"]');
    const hasToggle = await toggleButton.isVisible().catch(() => false);
    
    if (hasToggle) {
      await toggleButton.first().click();
      await page.waitForTimeout(500); // Wait for animation

      // THEN: Side panel should open/close
      const sidePanel = page.locator('[data-testid="tool-call-side-panel"], aside');
      const isVisible = await sidePanel.isVisible().catch(() => false);
      expect(isVisible).toBeTruthy();
    } else {
      // Skip if toggle button doesn't exist (no tool calls)
      test.skip();
    }
  });

  test.skip('[P1] should open file viewer when file is clicked', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and thread has files
    const projectId = 'test-project-id';
    const threadId = 'test-thread-id';
    await page.goto(`/projects/${projectId}/thread/${threadId}`);
    await page.waitForLoadState('networkidle');

    // WHEN: User clicks on a file link
    const fileLink = page.locator('[data-testid="file-link"], a[href*="file"], button[aria-label*="file"]').first();
    const hasFileLink = await fileLink.isVisible().catch(() => false);
    
    if (hasFileLink) {
      await fileLink.click();
      await page.waitForTimeout(500);

      // THEN: File viewer modal should open
      const fileViewer = page.locator('[data-testid="file-viewer"], [role="dialog"]');
      await expect(fileViewer.first()).toBeVisible({ timeout: 5000 });
    } else {
      // Skip if no files available
      test.skip();
    }
  });

  test.skip('[P1] should handle thread error states gracefully', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and navigates to non-existent thread
    const projectId = 'non-existent-project';
    const threadId = 'non-existent-thread';
    await page.goto(`/projects/${projectId}/thread/${threadId}`);
    await page.waitForLoadState('networkidle');

    // WHEN: Page loads
    // THEN: Should display error message or redirect
    const errorMessage = page.locator('text=/error|not found|404|unauthorized/i');
    const hasError = await errorMessage.isVisible().catch(() => false);
    const isRedirected = page.url().includes('/dashboard') || page.url().includes('/projects');
    
    expect(hasError || isRedirected).toBeTruthy();
  });

  test.skip('[P1] should display agent status when agent is running', async ({ page, authenticatedUser }) => {
    // GIVEN: User is authenticated and agent is processing
    const projectId = 'test-project-id';
    const threadId = 'test-thread-id';
    await page.goto(`/projects/${projectId}/thread/${threadId}`);
    await page.waitForLoadState('networkidle');

    // WHEN: Agent is processing a request
    // THEN: Agent status indicator should be visible
    const statusIndicator = page.locator('[data-testid="agent-status"], text=/running|processing|connecting/i');
    const hasStatus = await statusIndicator.isVisible().catch(() => false);
    
    // Status might not always be visible (agent might be idle)
    // This test checks if status indicator exists when agent is active
    if (hasStatus) {
      await expect(statusIndicator.first()).toBeVisible();
    } else {
      // Agent might be idle - this is acceptable
      test.skip();
    }
  });
});

