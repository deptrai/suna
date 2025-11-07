/**
 * Test Shared Code Import
 * Tests importing cn() utility từ frontend using path alias
 * 
 * This file verifies that path aliases work correctly trong build process
 */

// Import cn() utility từ frontend using path alias
import { cn } from '@/lib/utils';

// Test function to verify import works
export function testSharedCodeImport(): string {
  // Use cn() function to merge class names
  const className = cn('test', 'class', 'names');
  return className;
}

// Export cn để có thể use trong other files if needed
export { cn };

