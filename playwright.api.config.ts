import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';

/**
 * Playwright Configuration for API Tests
 * 
 * This config is specifically for API tests located in tests/api/
 * It resolves @playwright/test from frontend/node_modules
 */

// Resolve @playwright/test from frontend/node_modules
const playwrightPath = resolve(__dirname, 'frontend/node_modules/@playwright/test');

export default defineConfig({
  testDir: './tests/api',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  timeout: 60 * 1000, // Test timeout: 60s
  expect: {
    timeout: 15 * 1000, // Assertion timeout: 15s
  },

  use: {
    baseURL: process.env.API_URL || 'http://localhost:8000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15 * 1000, // Action timeout: 15s
    navigationTimeout: 30 * 1000, // Navigation timeout: 30s
  },

  reporter: [
    ['html', { outputFolder: 'test-results/html' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],

  projects: [
    {
      name: 'api-tests',
      testMatch: /.*\.api\.spec\.ts/,
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: process.env.API_URL || 'http://localhost:8000',
      },
    },
  ],

  // TypeScript configuration for module resolution
  // This helps resolve @playwright/test from frontend/node_modules
  // Note: Playwright uses its own module resolution, but we can help by ensuring
  // the test files can find the modules when executed from frontend directory
});






