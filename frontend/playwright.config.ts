import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Load test environment variables
// Priority: .env.test.local > .env.local
const testEnvPath = resolve(__dirname, '.env.test.local');
const localEnvPath = resolve(__dirname, '.env.local');

if (existsSync(testEnvPath)) {
  // Load .env.test.local if it exists (preferred for tests)
  config({ path: testEnvPath });
  console.log('✅ Loaded test environment from .env.test.local');
} else if (existsSync(localEnvPath)) {
  // Fallback to .env.local if .env.test.local doesn't exist
  config({ path: localEnvPath });
  console.log('✅ Loaded test environment from .env.local');
}

/**
 * Playwright Configuration
 * 
 * Timeouts:
 * - Test timeout: 60s
 * - Assertion timeout: 15s
 * - Action timeout: 15s
 * - Navigation timeout: 30s
 * 
 * Artifacts:
 * - Screenshots: only on failure
 * - Videos: retain on failure
 * - Traces: retain on failure
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Output directory relative to this config file
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  timeout: 60 * 1000, // Test timeout: 60s
  expect: {
    timeout: 15 * 1000, // Assertion timeout: 15s
  },

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15 * 1000, // Action timeout: 15s
    navigationTimeout: 30 * 1000, // Navigation timeout: 30s
  },

  // Load environment variables from .env.test.local if available
  // Usage: Create .env.test.local from .env.test.example and fill in credentials
  // Then tests will use these credentials for authentication

  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],

  projects: [
    { 
      name: 'chromium', 
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*\.(spec|test)\.ts/,
    },
    // Firefox and Webkit disabled for faster local testing
    // Enable when needed: npx playwright install firefox webkit
    // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    {
      name: 'api-tests',
      testDir: '../tests/api',
      testMatch: /.*\.api\.spec\.ts/,
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: process.env.API_URL || 'http://localhost:8000',
      },
    },
  ],

  // Start development server before running tests
  // Auto-starts dev server if not already running (only for E2E tests, not API tests)
  // Note: webServer is only used for projects listed in dependencies
  // API tests don't need frontend server, so they're excluded
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    stdout: 'ignore',
    stderr: 'pipe',
    // Only start server for chromium project (E2E tests), not api-tests
    dependencies: ['chromium'],
  },
});

