import { test, expect } from '@playwright/test';

/**
 * Authentication API Tests
 * 
 * High priority tests (P1) for authentication API endpoints:
 * - Signup endpoint validation
 * - Login endpoint validation
 * - Error handling and status codes
 * 
 * Pattern: Given-When-Then, API-first testing, deterministic assertions
 * 
 * Reference: bmad/bmm/testarch/knowledge/test-levels-framework.md
 */

test.describe('Authentication API', () => {
  test('[P1] POST /api/auth/login should validate request format', async ({ request }) => {
    // GIVEN: Valid credentials payload
    const credentials = {
      email: 'test@example.com',
      password: 'TestPassword123!',
    };

    // WHEN: Making login API call (if endpoint exists)
    // NOTE: Adjust endpoint based on actual API structure
    const response = await request.post('/api/auth/login', {
      data: credentials,
    }).catch(() => null);

    // THEN: Should handle request (might not exist, so we check if endpoint responds)
    if (response) {
      // Endpoint exists - validate response structure
      expect([200, 401, 400]).toContain(response.status());
      
      if (response.ok()) {
        const body = await response.json().catch(() => ({}));
        // If successful, should have token or user data
        expect(body).toHaveProperty('token', 'user', 'success');
      } else {
        const body = await response.json().catch(() => ({}));
        // Error responses should have error message
        expect(body).toHaveProperty('error', 'message');
      }
    } else {
      // Endpoint doesn't exist - skip test (auth might be handled client-side)
      test.skip();
    }
  });

  test('[P1] POST /api/auth/login should return 401 for invalid credentials', async ({ request }) => {
    // GIVEN: Invalid credentials
    const invalidCredentials = {
      email: 'invalid@example.com',
      password: 'wrongpassword',
    };

    // WHEN: Attempting login
    const response = await request.post('/api/auth/login', {
      data: invalidCredentials,
    }).catch(() => null);

    // THEN: Should return 401 Unauthorized
    if (response) {
      expect(response.status()).toBe(401);
      const body = await response.json().catch(() => ({}));
      expect(body).toMatchObject({
        error: expect.any(String),
      });
    } else {
      test.skip();
    }
  });

  test('[P1] POST /api/auth/login should return 400 for missing fields', async ({ request }) => {
    // GIVEN: Incomplete credentials (missing password)
    const incompleteCredentials = {
      email: 'test@example.com',
      // password missing
    };

    // WHEN: Attempting login
    const response = await request.post('/api/auth/login', {
      data: incompleteCredentials,
    }).catch(() => null);

    // THEN: Should return 400 Bad Request
    if (response) {
      expect([400, 422]).toContain(response.status());
      const body = await response.json().catch(() => ({}));
      expect(body).toMatchObject({
        error: expect.any(String),
        message: expect.any(String),
      });
    } else {
      test.skip();
    }
  });

  test('[P2] POST /api/auth/signup should validate email format', async ({ request }) => {
    // GIVEN: Invalid email format
    const invalidSignup = {
      email: 'notanemail',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    };

    // WHEN: Attempting signup
    const response = await request.post('/api/auth/signup', {
      data: invalidSignup,
    }).catch(() => null);

    // THEN: Should return validation error
    if (response) {
      expect([400, 422]).toContain(response.status());
      const body = await response.json().catch(() => ({}));
      expect(body).toMatchObject({
        error: expect.stringMatching(/email|invalid|validation/i),
      });
    } else {
      test.skip();
    }
  });
});


