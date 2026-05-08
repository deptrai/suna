import { test as base } from '@playwright/test';

export const test = base.extend({
  authenticatedUser: async ({ page }, use) => {
    await page.goto('/auth/password?redirect=%2Finstances');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password');
    await page.click('form button');
    await page.waitForURL('/instances');
    await use(page);
  },

  authToken: async ({ request }, use) => {
    const response = await request.post('/api/auth/login', {
      data: { email: 'test@example.com', password: 'password' },
    });
    const { token } = await response.json();
    await use(token);
  },
});
