/**
 * Test file to verify shared code import from frontend
 * 
 * This file tests that we can successfully import và use
 * frontend utilities via path aliases.
 */

import { cn } from '@/lib/utils';

/**
 * Test function using cn() utility from frontend
 */
export function testSharedCodeImport(): string {
  // Test cn() function from frontend
  const className = cn('test', 'class', 'from', 'frontend');
  console.log('✅ Shared code import test:', className);
  return className;
}

// Export test result
export const sharedCodeTestResult = testSharedCodeImport();


