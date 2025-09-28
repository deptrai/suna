#!/usr/bin/env node

/**
 * Comprehensive RBAC Testing Script
 * Tests all role-based access control functionality
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3006/api/v1';

// Test scenarios
const testScenarios = [
  {
    name: 'Free User',
    userData: { email: 'free@chainlens.com', tier: 'free', role: 'free' },
    expectedAccess: {
      '/auth/public': true,
      '/auth/pro-only': false,
      '/auth/enterprise-only': false,
      '/auth/admin-only': false,
      '/auth/user-info': true,
      '/auth/tier-features': true
    }
  },
  {
    name: 'Pro User',
    userData: { email: 'pro@chainlens.com', tier: 'pro', role: 'pro' },
    expectedAccess: {
      '/auth/public': true,
      '/auth/pro-only': true,
      '/auth/enterprise-only': false,
      '/auth/admin-only': false,
      '/auth/user-info': true,
      '/auth/tier-features': true
    }
  },
  {
    name: 'Enterprise User',
    userData: { email: 'enterprise@chainlens.com', tier: 'enterprise', role: 'enterprise' },
    expectedAccess: {
      '/auth/public': true,
      '/auth/pro-only': true,
      '/auth/enterprise-only': true,
      '/auth/admin-only': false,
      '/auth/user-info': true,
      '/auth/tier-features': true
    }
  },
  {
    name: 'Admin User',
    userData: { email: 'admin@chainlens.com', tier: 'enterprise', role: 'admin' },
    expectedAccess: {
      '/auth/public': true,
      '/auth/pro-only': true,
      '/auth/enterprise-only': true,
      '/auth/admin-only': true,
      '/auth/user-info': true,
      '/auth/tier-features': true
    }
  }
];

async function generateToken(userData) {
  try {
    const response = await axios.post(`${BASE_URL}/auth/test-token`, userData);
    return response.data.data.access_token;
  } catch (error) {
    console.error(`❌ Failed to generate token for ${userData.email}:`, error.response?.data || error.message);
    return null;
  }
}

async function testEndpoint(endpoint, token, shouldSucceed) {
  try {
    const response = await axios.get(`${BASE_URL}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const success = response.data.success === true;
    if (success === shouldSucceed) {
      console.log(`  ✅ ${endpoint}: ${success ? 'ALLOWED' : 'DENIED'} (expected)`);
      return true;
    } else {
      console.log(`  ❌ ${endpoint}: ${success ? 'ALLOWED' : 'DENIED'} (expected ${shouldSucceed ? 'ALLOWED' : 'DENIED'})`);
      return false;
    }
  } catch (error) {
    const denied = error.response?.status === 401 || error.response?.status === 403;
    if (denied === !shouldSucceed) {
      console.log(`  ✅ ${endpoint}: ${denied ? 'DENIED' : 'ERROR'} (expected)`);
      return true;
    } else {
      console.log(`  ❌ ${endpoint}: ${denied ? 'DENIED' : 'ERROR'} (expected ${shouldSucceed ? 'ALLOWED' : 'DENIED'})`);
      return false;
    }
  }
}

async function runTests() {
  console.log('🚀 Starting Comprehensive RBAC Tests\n');
  
  let totalTests = 0;
  let passedTests = 0;
  
  for (const scenario of testScenarios) {
    console.log(`📋 Testing: ${scenario.name} (${scenario.userData.role}/${scenario.userData.tier})`);
    
    // Generate token
    const token = await generateToken(scenario.userData);
    if (!token) {
      console.log(`  ❌ Failed to generate token, skipping scenario\n`);
      continue;
    }
    
    // Test each endpoint
    for (const [endpoint, shouldSucceed] of Object.entries(scenario.expectedAccess)) {
      totalTests++;
      const passed = await testEndpoint(endpoint, token, shouldSucceed);
      if (passed) passedTests++;
    }
    
    console.log('');
  }
  
  // Summary
  console.log('📊 Test Summary:');
  console.log(`  Total Tests: ${totalTests}`);
  console.log(`  Passed: ${passedTests}`);
  console.log(`  Failed: ${totalTests - passedTests}`);
  console.log(`  Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 All RBAC tests passed! Role-Based Access Control is working correctly.');
    process.exit(0);
  } else {
    console.log('\n❌ Some RBAC tests failed. Please check the implementation.');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('💥 Test runner failed:', error.message);
  process.exit(1);
});
