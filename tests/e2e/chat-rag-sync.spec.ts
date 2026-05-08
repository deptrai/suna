import { test, expect } from '@playwright/test';

test.describe('Chat & RAG Sync E2E User Journey', () => {
  test('[P0] should send message and receive RAG response', async ({ page }) => {
    await page.route('**/api/chat', async route => {
      await route.fulfill({ status: 200, json: { reply: 'Here is your generated code based on context.', contextUsed: true } });
    });
    
    await page.goto('/chat');
    await page.getByRole('textbox', { name: /message/i }).fill('Help me write a function');
    await page.getByRole('button', { name: /send/i }).click();
    
    await expect(page.getByText('Here is your generated code based on context.')).toBeVisible();
  });

  test('[P1] should sync chat history across sessions', async ({ page }) => {
    await page.route('**/api/chat/history', async route => {
      await route.fulfill({ status: 200, json: { history: [{ id: 1, text: 'Past query' }] } });
    });
    
    await page.goto('/chat');
    await expect(page.getByText('Past query')).toBeVisible();
  });
});