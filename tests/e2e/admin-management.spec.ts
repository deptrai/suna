import { test, expect } from '@playwright/test';

test.describe('Admin Management E2E User Journey', () => {
  test('[P0] should list users and allow role updates', async ({ page }) => {
    await page.route('**/api/admin/users', async route => {
      await route.fulfill({ status: 200, json: { users: [{ id: 1, name: 'Alice', role: 'user' }] } });
    });
    await page.route('**/api/admin/users/1/role', async route => {
      await route.fulfill({ status: 200, json: { success: true } });
    });
    
    await page.goto('/admin/users');
    await expect(page.getByText('Alice')).toBeVisible();
    
    await page.getByRole('button', { name: /edit role/i }).click();
    await page.getByRole('combobox', { name: /role/i }).selectOption('admin');
    await page.getByRole('button', { name: /save/i }).click();
    
    await expect(page.getByText('Role updated successfully')).toBeVisible();
  });

  test('[P2] should handle unauthorized access to admin panel', async ({ page }) => {
    await page.route('**/api/admin/*', async route => {
      await route.fulfill({ status: 403, json: { error: 'Forbidden' } });
    });
    
    await page.goto('/admin/users');
    await expect(page.getByText('Forbidden')).toBeVisible();
  });
});