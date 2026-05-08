import { test, expect } from '@playwright/test';

test.describe('Auth E2E User Journey', () => {
  test('[P0] should complete successful login', async ({ page }) => {
    await page.route('**/api/auth/login', async route => {
      await route.fulfill({ status: 200, json: { token: 'mock-token' } });
    });
    
    await page.goto('/login');
    await page.getByRole('textbox', { name: /email/i }).fill('test@example.com');
    await page.getByRole('textbox', { name: /password/i }).fill('password123');
    await page.getByRole('button', { name: /sign in/i }).click();
    
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('[P1] should handle invalid credentials', async ({ page }) => {
    await page.route('**/api/auth/login', async route => {
      await route.fulfill({ status: 401, json: { error: 'Invalid credentials' } });
    });
    
    await page.goto('/login');
    await page.getByRole('textbox', { name: /email/i }).fill('wrong@example.com');
    await page.getByRole('textbox', { name: /password/i }).fill('wrong');
    await page.getByRole('button', { name: /sign in/i }).click();
    
    await expect(page.getByText('Invalid credentials')).toBeVisible();
  });
});