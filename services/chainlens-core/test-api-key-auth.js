#!/usr/bin/env node

/**
 * Comprehensive API Key Authentication Test Script
 * Tests all aspects of API key authentication system
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3006/api/v1';

// Test API keys
const API_KEYS = {
  enterprise: 'sk-chainlens-a1b2c3d4e5f6789012345678901234567890abcd',
  pro: 'sk-chainlens-b2c3d4e5f6789012345678901234567890abcdef',
  disabled: 'sk-chainlens-c3d4e5f6789012345678901234567890abcdef12',
  invalid: 'sk-chainlens-invalid123456789012345678901234567890',
  wrongFormat: 'invalid-api-key-format',
};

// Test results tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function logTest(testName, passed, details = '') {
  totalTests++;
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
  console.log('='.repeat(50));
}

async function testApiKeyAuthentication() {
  logSection('API Key Authentication Tests');

  // Test 1: Valid Enterprise API Key
  try {
    const response = await axios.get(`${BASE_URL}/api-keys/test`, {
      headers: { Authorization: `Bearer ${API_KEYS.enterprise}` }
    });
    
    const success = response.status === 200 &&
                   response.data.success === true &&
                   response.data.data.data.user.tier === 'enterprise' &&
                   response.data.data.data.user.apiKey === true;
    
    logTest('Enterprise API Key Authentication', success, 
           success ? '' : `Expected enterprise tier, got ${response.data.data?.data?.user?.tier}`);
  } catch (error) {
    logTest('Enterprise API Key Authentication', false, error.message);
  }

  // Test 2: Valid Pro API Key
  try {
    const response = await axios.get(`${BASE_URL}/api-keys/test`, {
      headers: { Authorization: `Bearer ${API_KEYS.pro}` }
    });
    
    const success = response.status === 200 &&
                   response.data.success === true &&
                   response.data.data.data.user.tier === 'pro' &&
                   response.data.data.data.user.apiKey === true;
    
    logTest('Pro API Key Authentication', success,
           success ? '' : `Expected pro tier, got ${response.data.data?.data?.user?.tier}`);
  } catch (error) {
    logTest('Pro API Key Authentication', false, error.message);
  }

  // Test 3: Disabled API Key
  try {
    const response = await axios.get(`${BASE_URL}/api-keys/test`, {
      headers: { Authorization: `Bearer ${API_KEYS.disabled}` }
    });
    logTest('Disabled API Key Rejection', false, 'Should have been rejected');
  } catch (error) {
    const success = error.response?.status === 401 && 
                   error.response?.data?.errors?.[0]?.message === 'API key is disabled';
    logTest('Disabled API Key Rejection', success, 
           success ? '' : `Expected 401 with disabled message, got ${error.response?.status}`);
  }

  // Test 4: Invalid API Key
  try {
    const response = await axios.get(`${BASE_URL}/api-keys/test`, {
      headers: { Authorization: `Bearer ${API_KEYS.invalid}` }
    });
    logTest('Invalid API Key Rejection', false, 'Should have been rejected');
  } catch (error) {
    const success = error.response?.status === 401;
    logTest('Invalid API Key Rejection', success,
           success ? '' : `Expected 401, got ${error.response?.status}`);
  }

  // Test 5: Wrong Format API Key
  try {
    const response = await axios.get(`${BASE_URL}/api-keys/test`, {
      headers: { Authorization: `Bearer ${API_KEYS.wrongFormat}` }
    });
    logTest('Wrong Format API Key Rejection', false, 'Should have been rejected');
  } catch (error) {
    const success = error.response?.status === 401 &&
                   (error.response?.data?.errors?.[0]?.message === 'Invalid API key format' ||
                    error.response?.data?.errors?.[0]?.message === 'API key required');
    logTest('Wrong Format API Key Rejection', success,
           success ? '' : `Expected 401 with format error, got ${error.response?.status}`);
  }

  // Test 6: No API Key
  try {
    const response = await axios.get(`${BASE_URL}/api-keys/test`);
    logTest('No API Key Rejection', false, 'Should have been rejected');
  } catch (error) {
    const success = error.response?.status === 401;
    logTest('No API Key Rejection', success,
           success ? '' : `Expected 401, got ${error.response?.status}`);
  }
}

async function testApiKeyWithDifferentHeaders() {
  logSection('API Key Header Format Tests');

  // Test 1: X-API-Key header
  try {
    const response = await axios.get(`${BASE_URL}/api-keys/test`, {
      headers: { 'X-API-Key': API_KEYS.enterprise }
    });
    
    const success = response.status === 200 &&
                   response.data.data.data.user.tier === 'enterprise';
    
    logTest('X-API-Key Header Format', success);
  } catch (error) {
    logTest('X-API-Key Header Format', false, error.message);
  }

  // Test 2: Query parameter (for testing only)
  try {
    const response = await axios.get(`${BASE_URL}/api-keys/test?api_key=${API_KEYS.pro}`);
    
    const success = response.status === 200 &&
                   response.data.data.data.user.tier === 'pro';
    
    logTest('Query Parameter Format', success);
  } catch (error) {
    logTest('Query Parameter Format', false, error.message);
  }
}

async function testApiKeyWithProtectedEndpoints() {
  logSection('API Key with Protected Endpoints');

  // Test accessing API key compatible endpoints
  const protectedEndpoints = [
    { path: '/auth/api-key-test', method: 'get', minTier: 'free' },
    { path: '/api-keys/test', method: 'get', minTier: 'free' },
  ];

  for (const endpoint of protectedEndpoints) {
    // Test with enterprise key (should work for all)
    try {
      const response = await axios[endpoint.method](`${BASE_URL}${endpoint.path}`, {
        headers: { Authorization: `Bearer ${API_KEYS.enterprise}` }
      });
      
      const success = response.status === 200;
      logTest(`Enterprise API Key -> ${endpoint.path}`, success);
    } catch (error) {
      logTest(`Enterprise API Key -> ${endpoint.path}`, false, error.message);
    }

    // Test with pro key
    try {
      const response = await axios[endpoint.method](`${BASE_URL}${endpoint.path}`, {
        headers: { Authorization: `Bearer ${API_KEYS.pro}` }
      });
      
      const success = response.status === 200;
      const shouldWork = endpoint.minTier !== 'enterprise';
      
      logTest(`Pro API Key -> ${endpoint.path}`, success === shouldWork,
             shouldWork ? '' : 'Pro key should not access enterprise endpoints');
    } catch (error) {
      const shouldFail = endpoint.minTier === 'enterprise';
      logTest(`Pro API Key -> ${endpoint.path}`, shouldFail,
             shouldFail ? '' : error.message);
    }
  }
}

async function testApiKeyManagementEndpoints() {
  logSection('API Key Management Endpoints (JWT Required)');

  // These endpoints require JWT authentication, not API key
  const managementEndpoints = [
    { path: '/api-keys', method: 'get' },
    { path: '/api-keys', method: 'post', data: { name: 'Test Key' } },
  ];

  for (const endpoint of managementEndpoints) {
    try {
      const config = {
        headers: { Authorization: `Bearer ${API_KEYS.enterprise}` }
      };
      
      if (endpoint.data) {
        config.data = endpoint.data;
      }

      const response = await axios[endpoint.method](`${BASE_URL}${endpoint.path}`, config);
      
      // These should fail because API keys can't access management endpoints
      logTest(`API Key -> ${endpoint.method.toUpperCase()} ${endpoint.path}`, false, 
             'API keys should not access management endpoints');
    } catch (error) {
      const success = error.response?.status === 401;
      logTest(`API Key -> ${endpoint.method.toUpperCase()} ${endpoint.path}`, success,
             success ? 'Correctly rejected API key for management endpoint' : error.message);
    }
  }
}

async function runAllTests() {
  console.log('🚀 Starting API Key Authentication Test Suite');
  console.log('=' .repeat(60));

  try {
    await testApiKeyAuthentication();
    await testApiKeyWithDifferentHeaders();
    await testApiKeyWithProtectedEndpoints();
    await testApiKeyManagementEndpoints();

    // Summary
    console.log('\n📊 Test Results Summary');
    console.log('='.repeat(50));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

    if (failedTests === 0) {
      console.log('\n🎉 All API Key Authentication tests passed!');
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

// Run the tests
runAllTests();
