import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:13737';
const apiURL = process.env.E2E_API_URL || 'http://localhost:13738/v1';

// In CI (sandbox-only stack), skip specs that require the full self-hosted stack
// (frontend + supabase + api containers). Only sandbox-token-drift-recovery.spec.ts
// is safe to run against the minimal compose stack (desktop service only).
// Set CI_FULL_STACK=true to run all specs (self-hosted runner with full stack).
const ciIgnorePatterns = process.env.CI && !process.env.CI_FULL_STACK
  ? [
      '**/0[1-7]-*.spec.ts',
      '**/market-dashboard.spec.ts',
      '**/generative-widgets.spec.ts',
      // Story 5.5.1 — swarm E2E specs need the full stack (vibe-trading + MCP +
      // apps/api + frontend). swarm-resume-after-api-restart is also chaos-gated.
      '**/swarm-async-roundtrip.spec.ts',
      '**/swarm-cancel.spec.ts',
      '**/swarm-resume-after-api-restart.spec.ts',
    ]
  : [];

export default defineConfig({
  testDir: './e2e/specs',
  testIgnore: ciIgnorePatterns,
  timeout: 300_000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // sequential — tests depend on prior state
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../test-results/html' }]],
  outputDir: '../test-results/artifacts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  metadata: {
    baseURL,
    apiURL,
  },
});
