/**
 * Test file to verify TypeScript path alias resolution
 * This file tests importing from frontend using @/* alias
 */

// Test import từ frontend utils
import { cn } from '@/lib/utils';

// Test function to verify path alias works
export function testPathAlias(): string {
  // Use cn function từ frontend
  const className = cn('test', 'class', 'names');
  return className;
}

// Export để có thể test từ outside
export { cn };

