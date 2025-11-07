/**
 * Load test environment variables before running Playwright tests
 * 
 * Usage: node scripts/load-test-env.js && playwright test
 * Or add to package.json scripts
 */

const { config } = require('dotenv');
const { resolve } = require('path');

// Load .env.test.local if it exists
const envPath = resolve(__dirname, '../.env.test.local');
config({ path: envPath });

// Export env vars for Playwright
if (require.main === module) {
  console.log('✅ Test environment loaded from .env.test.local');
  console.log('Environment variables loaded:', {
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Not set',
    SUPABASE_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Not set',
    BASE_URL: process.env.BASE_URL || 'http://localhost:3000',
  });
}


