import { test as base } from '@playwright/test';
import { APIRequestContext } from '@playwright/test';

/**
 * Custom Test Fixtures
 * 
 * This file composes multiple fixtures using the extend pattern.
 * Each fixture provides isolated capability (auth, API, factories).
 * 
 * Pattern: Pure function → Fixture → Composition via extend
 * 
 * Reference: bmad/bmm/testarch/knowledge/fixture-architecture.md
 * 
 * Note: UserFactory is optional and only imported if needed (E2E tests).
 * API tests don't need UserFactory, so we make it optional to avoid
 * dependency on @faker-js/faker when not needed.
 */

type TestFixtures = {
  authenticatedRequest: APIRequestContext;
  authToken: string;
  userId: string;
  apiKey: string;
};

// Optional: UserFactory (only for E2E tests)
// Import dynamically to avoid dependency on @faker-js/faker for API tests
let UserFactory: any = null;
try {
  const userFactoryModule = require('./factories/user-factory');
  UserFactory = userFactoryModule.UserFactory;
  
  // Add userFactory to type if available
  if (UserFactory) {
    (TestFixtures as any).userFactory = UserFactory;
  }
} catch (error) {
  // UserFactory not available (e.g., @faker-js/faker not installed)
  // This is fine for API tests
}

/**
 * Generate test JWT token
 * 
 * Note: For actual testing, you should use a real JWT token from your auth system.
 * This is a placeholder that can be replaced with actual token generation logic
 * or retrieved from environment variables.
 */
function generateTestJWT(userId: string = 'test-user-id'): string {
  // Option 1: Use test token from environment variable (recommended)
  const testToken = process.env.TEST_JWT_TOKEN;
  if (testToken) {
    return testToken;
  }

  // Option 2: Use API key format (if your API supports API keys)
  const testApiKey = process.env.TEST_API_KEY;
  if (testApiKey) {
    return testApiKey;
  }

  // Option 3: Return placeholder token (tests will need real token)
  // In production tests, you should generate or retrieve a real token
  return 'test-jwt-token-placeholder';
}

export const test = base.extend<TestFixtures>({
  // Optional: userFactory (only if UserFactory is available)
  ...(UserFactory ? {
    userFactory: async ({}, use) => {
      const factory = new UserFactory();
      await use(factory);
      await factory.cleanup(); // Auto-cleanup after test
    },
  } : {}),

  authToken: async ({}, use) => {
    const token = generateTestJWT();
    await use(token);
  },

  userId: async ({}, use) => {
    const userId = process.env.TEST_USER_ID || 'test-user-id';
    await use(userId);
  },

  apiKey: async ({}, use) => {
    // Support API key authentication format: pk_xxx:sk_xxx
    const apiKey = process.env.TEST_API_KEY || '';
    await use(apiKey);
  },

  authenticatedRequest: async ({ request, authToken, apiKey }, use) => {
    // In Playwright API tests, `request` is already an APIRequestContext
    // We can't create a new context, but we can wrap it with a proxy
    // that adds authentication headers to all requests
    
    // Create a proxy object that adds auth headers to all requests
    const authenticatedRequest = new Proxy(request, {
      get(target, prop) {
        const originalMethod = target[prop as keyof typeof target];
        
        // If it's a request method (get, post, put, delete, etc.), wrap it
        if (typeof originalMethod === 'function' && ['get', 'post', 'put', 'delete', 'patch', 'head'].includes(prop as string)) {
          return function(...args: any[]) {
            // Determine authentication method
            const authHeader = apiKey 
              ? { 'x-api-key': apiKey }
              : { 'Authorization': `Bearer ${authToken}` };
            
            // Add auth headers to request options
            const options = args[1] || {};
            options.headers = {
              ...options.headers,
              ...authHeader,
              'Content-Type': 'application/json',
            };
            
            // Call original method with updated options
            return (originalMethod as Function).call(target, args[0], options);
          };
        }
        
        // For other properties/methods, return as-is
        return originalMethod;
      }
    });

    await use(authenticatedRequest);
  },
});

export { expect } from '@playwright/test';





