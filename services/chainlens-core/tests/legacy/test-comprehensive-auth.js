#!/usr/bin/env node

/**
 * Comprehensive Authentication System Integration Test
 * Tests all authentication methods and their integration
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3006/api/v1';

// Test credentials
const TEST_CREDENTIALS = {
  jwt: {
    // Valid JWT tokens for different tiers (generated from test-token endpoint)
    enterprise: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwiZW1haWwiOiJ0ZXN0QGNoYWlubGVucy5jb20iLCJyb2xlIjoidXNlciIsInRpZXIiOiJlbnRlcnByaXNlIiwiaWF0IjoxNzU5MDM3NDM3LCJleHAiOjE3NTkxMjM4MzcsImF1ZCI6ImNoYWlubGVucy1zZXJ2aWNlcyIsImlzcyI6ImNoYWlubGVucy1jb3JlIn0.t0QBeYARc7KK0VoyrdWQQN8NIg5eRNX94K3iqXZTHNw',
    pro: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwiZW1haWwiOiJ0ZXN0QGNoYWlubGVucy5jb20iLCJyb2xlIjoidXNlciIsInRpZXIiOiJwcm8iLCJpYXQiOjE3NTkwMzc0NDQsImV4cCI6MTc1OTEyMzg0NCwiYXVkIjoiY2hhaW5sZW5zLXNlcnZpY2VzIiwiaXNzIjoiY2hhaW5sZW5zLWNvcmUifQ.mGs41GsEJ-mrDc9qqx9Okm0W75MELkItQgNXm7E3T-s',
    free: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwiZW1haWwiOiJ0ZXN0QGNoYWlubGVucy5jb20iLCJyb2xlIjoidXNlciIsInRpZXIiOiJmcmVlIiwiaWF0IjoxNzU5MDM3NDUzLCJleHAiOjE3NTkxMjM4NTMsImF1ZCI6ImNoYWlubGVucy1zZXJ2aWNlcyIsImlzcyI6ImNoYWlubGVucy1jb3JlIn0.y6ca7AsHysOXqRLMxWZplqECsE4EJbHM8xR1m5OfITU'
  },
  apiKey: {
    enterprise: 'sk-chainlens-a1b2c3d4e5f6789012345678901234567890abcd',
    pro: 'sk-chainlens-b2c3d4e5f6789012345678901234567890abcdef',
    disabled: 'sk-chainlens-c3d4e5f6789012345678901234567890abcdef12'
  }
};

// Test results tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function logTest(testName, passed, details = '', category = 'General') {
  totalTests++;
  const result = {
    category,
    name: testName,
    passed,
    details,
    timestamp: new Date().toISOString()
  };
  
  testResults.push(result);
  
  if (passed) {
    passedTests++;
    console.log(`✅ ${testName}`);
  } else {
    failedTests++;
    console.log(`❌ ${testName}`);
    if (details) console.log(`   ${details}`);
  }
}

function logSection(sectionName) {
  console.log(`\n🔍 ${sectionName}`);
  console.log('='.repeat(60));
}

async function testJWTAuthentication() {
  logSection('JWT Authentication Integration Tests');

  const jwtEndpoints = [
    { path: '/auth/profile', method: 'get', minTier: 'free' },
    { path: '/auth/premium', method: 'get', minTier: 'pro' },
    { path: '/auth/enterprise-only', method: 'get', minTier: 'enterprise' },
    { path: '/auth/user-info', method: 'get', minTier: 'free' }
  ];

  for (const endpoint of jwtEndpoints) {
    // Test with appropriate tier
    for (const [tier, token] of Object.entries(TEST_CREDENTIALS.jwt)) {
      try {
        const response = await axios[endpoint.method](`${BASE_URL}${endpoint.path}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        const shouldWork = (
          (endpoint.minTier === 'free') ||
          (endpoint.minTier === 'pro' && ['pro', 'enterprise'].includes(tier)) ||
          (endpoint.minTier === 'enterprise' && tier === 'enterprise')
        );
        
        const success = response.status === 200;
        logTest(
          `JWT ${tier.toUpperCase()} → ${endpoint.path}`,
          success === shouldWork,
          shouldWork ? '' : `${tier} should not access ${endpoint.minTier} endpoint`,
          'JWT Authentication'
        );
      } catch (error) {
        const shouldFail = !(
          (endpoint.minTier === 'free') ||
          (endpoint.minTier === 'pro' && ['pro', 'enterprise'].includes(tier)) ||
          (endpoint.minTier === 'enterprise' && tier === 'enterprise')
        );
        
        logTest(
          `JWT ${tier.toUpperCase()} → ${endpoint.path}`,
          shouldFail,
          shouldFail ? 'Correctly rejected' : error.message,
          'JWT Authentication'
        );
      }
    }
  }
}

async function testAPIKeyAuthentication() {
  logSection('API Key Authentication Integration Tests');

  const apiKeyEndpoints = [
    { path: '/api-keys/test', method: 'get', minTier: 'free' },
    { path: '/auth/api-key-test', method: 'get', minTier: 'free' }
  ];

  for (const endpoint of apiKeyEndpoints) {
    for (const [tier, apiKey] of Object.entries(TEST_CREDENTIALS.apiKey)) {
      if (tier === 'disabled') continue;
      
      try {
        const response = await axios[endpoint.method](`${BASE_URL}${endpoint.path}`, {
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        
        const success = response.status === 200;
        logTest(
          `API Key ${tier.toUpperCase()} → ${endpoint.path}`,
          success,
          success ? '' : 'Should have succeeded',
          'API Key Authentication'
        );
      } catch (error) {
        logTest(
          `API Key ${tier.toUpperCase()} → ${endpoint.path}`,
          false,
          error.message,
          'API Key Authentication'
        );
      }
    }
  }
}

async function testRateLimiting() {
  logSection('Rate Limiting Integration Tests');

  // Test rate limiting with different authentication methods
  const rateLimitEndpoints = [
    { path: '/rate-limit/test/normal', authType: 'jwt' },
    { path: '/rate-limit/test/normal', authType: 'apiKey' }
  ];

  for (const endpoint of rateLimitEndpoints) {
    const auth = endpoint.authType === 'jwt'
      ? { Authorization: `Bearer ${TEST_CREDENTIALS.jwt.pro}` }  // Use pro tier for higher limits
      : { Authorization: `Bearer ${TEST_CREDENTIALS.apiKey.pro}` };

    try {
      // Make multiple requests to test rate limiting
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(
          axios.get(`${BASE_URL}${endpoint.path}`, { headers: auth })
            .catch(err => err.response)
        );
      }

      const responses = await Promise.all(requests);
      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;

      if (endpoint.authType === 'jwt') {
        logTest(
          `Rate Limiting with ${endpoint.authType.toUpperCase()} → ${endpoint.path}`,
          successCount > 0, // At least some requests should succeed
          `${successCount} succeeded, ${rateLimitedCount} rate limited`,
          'Rate Limiting'
        );
      } else {
        // API key endpoints don't support rate limiting endpoints (JWT only)
        logTest(
          `Rate Limiting with ${endpoint.authType.toUpperCase()} → ${endpoint.path}`,
          rateLimitedCount === 0 && successCount === 0, // Should be rejected for auth
          'API keys not supported on rate limit endpoints (JWT only)',
          'Rate Limiting'
        );
      }
    } catch (error) {
      if (endpoint.authType === 'jwt') {
        logTest(
          `Rate Limiting with ${endpoint.authType.toUpperCase()} → ${endpoint.path}`,
          false,
          error.message,
          'Rate Limiting'
        );
      } else {
        // Expected for API keys
        logTest(
          `Rate Limiting with ${endpoint.authType.toUpperCase()} → ${endpoint.path}`,
          error.response?.status === 401,
          'Correctly rejected API key authentication',
          'Rate Limiting'
        );
      }
    }
  }
}

async function testCrossSystemIntegration() {
  logSection('Cross-System Integration Tests');

  // Test 1: JWT user accessing API key management (should work)
  try {
    const response = await axios.get(`${BASE_URL}/api-keys`, {
      headers: { Authorization: `Bearer ${TEST_CREDENTIALS.jwt.pro}` }
    });
    
    logTest(
      'JWT Pro user accessing API key management',
      response.status === 200,
      '',
      'Cross-System Integration'
    );
  } catch (error) {
    logTest(
      'JWT Pro user accessing API key management',
      false,
      error.message,
      'Cross-System Integration'
    );
  }

  // Test 2: API key trying to access management endpoints (should fail)
  try {
    const response = await axios.get(`${BASE_URL}/api-keys`, {
      headers: { Authorization: `Bearer ${TEST_CREDENTIALS.apiKey.enterprise}` }
    });
    
    logTest(
      'API key accessing management endpoints',
      false,
      'Should have been rejected',
      'Cross-System Integration'
    );
  } catch (error) {
    logTest(
      'API key accessing management endpoints',
      error.response?.status === 401,
      'Correctly rejected API key for management',
      'Cross-System Integration'
    );
  }

  // Test 3: Mixed authentication in same session
  try {
    // First request with JWT
    const jwtResponse = await axios.get(`${BASE_URL}/auth/profile`, {
      headers: { Authorization: `Bearer ${TEST_CREDENTIALS.jwt.enterprise}` }
    });

    // Second request with API key
    const apiKeyResponse = await axios.get(`${BASE_URL}/api-keys/test`, {
      headers: { Authorization: `Bearer ${TEST_CREDENTIALS.apiKey.enterprise}` }
    });

    logTest(
      'Mixed authentication methods in session',
      jwtResponse.status === 200 && apiKeyResponse.status === 200,
      'Both JWT and API key should work independently',
      'Cross-System Integration'
    );
  } catch (error) {
    logTest(
      'Mixed authentication methods in session',
      false,
      error.message,
      'Cross-System Integration'
    );
  }
}

async function testErrorHandling() {
  logSection('Error Handling & Security Tests');

  const securityTests = [
    {
      name: 'Invalid JWT token',
      request: () => axios.get(`${BASE_URL}/auth/profile`, {
        headers: { Authorization: 'Bearer invalid-token' }
      }),
      expectedStatus: 401
    },
    {
      name: 'Malformed API key',
      request: () => axios.get(`${BASE_URL}/api-keys/test`, {
        headers: { Authorization: 'Bearer malformed-key' }
      }),
      expectedStatus: 401
    },
    {
      name: 'No authentication header',
      request: () => axios.get(`${BASE_URL}/auth/profile`),
      expectedStatus: 401
    },
    {
      name: 'Disabled API key',
      request: () => axios.get(`${BASE_URL}/api-keys/test`, {
        headers: { Authorization: `Bearer ${TEST_CREDENTIALS.apiKey.disabled}` }
      }),
      expectedStatus: 401
    }
  ];

  for (const test of securityTests) {
    try {
      await test.request();
      logTest(test.name, false, 'Should have been rejected', 'Security');
    } catch (error) {
      logTest(
        test.name,
        error.response?.status === test.expectedStatus,
        `Expected ${test.expectedStatus}, got ${error.response?.status}`,
        'Security'
      );
    }
  }
}

async function testPerformance() {
  logSection('Performance Tests');

  const performanceTests = [
    {
      name: 'JWT Authentication Performance',
      endpoint: '/auth/profile',
      auth: { Authorization: `Bearer ${TEST_CREDENTIALS.jwt.pro}` }
    },
    {
      name: 'API Key Authentication Performance',
      endpoint: '/api-keys/test',
      auth: { Authorization: `Bearer ${TEST_CREDENTIALS.apiKey.pro}` }
    }
  ];

  for (const test of performanceTests) {
    const startTime = Date.now();
    const requests = [];
    
    // Run 10 concurrent requests
    for (let i = 0; i < 10; i++) {
      requests.push(
        axios.get(`${BASE_URL}${test.endpoint}`, { headers: test.auth })
          .catch(err => err.response)
      );
    }

    try {
      const responses = await Promise.all(requests);
      const endTime = Date.now();
      const duration = endTime - startTime;
      const successCount = responses.filter(r => r.status === 200).length;
      const avgResponseTime = duration / 10;

      logTest(
        test.name,
        successCount >= 8 && avgResponseTime < 100, // 80% success rate, <100ms avg
        `${successCount}/10 succeeded, ${avgResponseTime.toFixed(1)}ms avg`,
        'Performance'
      );
    } catch (error) {
      logTest(test.name, false, error.message, 'Performance');
    }
  }
}

function generateReport() {
  console.log('\n📊 Comprehensive Test Results Summary');
  console.log('='.repeat(60));
  
  // Group results by category
  const categories = {};
  testResults.forEach(result => {
    if (!categories[result.category]) {
      categories[result.category] = { passed: 0, failed: 0, total: 0 };
    }
    categories[result.category].total++;
    if (result.passed) {
      categories[result.category].passed++;
    } else {
      categories[result.category].failed++;
    }
  });

  // Print category breakdown
  Object.entries(categories).forEach(([category, stats]) => {
    const successRate = ((stats.passed / stats.total) * 100).toFixed(1);
    console.log(`${category}: ${stats.passed}/${stats.total} (${successRate}%)`);
  });

  console.log('\n📈 Overall Results:');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  return failedTests === 0;
}

async function runComprehensiveTests() {
  console.log('🚀 Starting Comprehensive Authentication System Tests');
  console.log('='.repeat(60));

  try {
    await testJWTAuthentication();
    await testAPIKeyAuthentication();
    await testRateLimiting();
    await testCrossSystemIntegration();
    await testErrorHandling();
    await testPerformance();

    const allPassed = generateReport();

    if (allPassed) {
      console.log('\n🎉 All comprehensive authentication tests passed!');
      console.log('✅ System is ready for production deployment');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some tests failed. Please review the results above.');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run the comprehensive tests
runComprehensiveTests();
