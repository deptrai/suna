/**
 * Test file to verify TypeScript path alias resolution
 * This file tests that we can import from frontend using @/* alias
 */

// Test import từ frontend utils
// @ts-ignore - This is a test file, ignore type errors if frontend not available
import { cn } from '@/lib/utils';

// Test import từ frontend types (if available)
// @ts-ignore
// import type { AgentRun } from '@/lib/types';

/**
 * Test function to verify path alias works
 */
export function testPathAlias(): boolean {
  try {
    // If cn function is available, path alias works
    if (typeof cn === 'function') {
      console.log('✅ Path alias resolution works!');
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Path alias resolution failed:', error);
    return false;
  }
}

// Export test result
export const pathAliasTestResult = testPathAlias();


