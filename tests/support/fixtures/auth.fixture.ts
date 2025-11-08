import { test as base } from '@playwright/test';
import { APIRequestContext } from '@playwright/test';

/**
 * Authentication Fixture
 * 
 * Provides authenticated API requests for testing protected endpoints.
 * Supports both JWT tokens and API keys for authentication.
 * 
 * Pattern: Pure function → Fixture → Auto-cleanup
 * 
 * Reference: bmad/bmm/testarch/knowledge/fixture-architecture.md
 */

type AuthFixtures = {
  authenticatedRequest: APIRequestContext;
  authToken: string;
  userId: string;
  apiKey: string;
};

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

export const test = base.extend<AuthFixtures>({
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
    // Determine authentication method
    const authHeader = apiKey 
      ? { 'x-api-key': apiKey }
      : { 'Authorization': `Bearer ${authToken}` };

    // Create a new request context with authentication headers
    const authenticatedContext = await request.newContext({
      extraHTTPHeaders: {
        ...authHeader,
        'Content-Type': 'application/json',
      },
    });

    await use(authenticatedContext);

    // Cleanup
    await authenticatedContext.dispose();
  },
});

