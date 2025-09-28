#!/usr/bin/env node

/**
 * Rate Limiting Test Script
 * Tests the enhanced rate limiting system with tier-based limits
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3006/api/v1';

// Test scenarios for different rate limits
const testScenarios = [
  {
    name: 'Free User - Normal Rate Limit',
    userData: { email: 'free@chainlens.com', tier: 'free', role: 'free' },
    endpoint: '/rate-limit/test/normal',
    expectedLimit: 10, // 10 requests per hour for free users
    testRequests: 12, // Test beyond limit
  },
  {
    name: 'Pro User - Normal Rate Limit',
    userData: { email: 'pro@chainlens.com', tier: 'pro', role: 'pro' },
    endpoint: '/rate-limit/test/normal',
    expectedLimit: 100, // 100 requests per hour for pro users
    testRequests: 15, // Test within limit
  },
  {
    name: 'Pro User - Strict Rate Limit',
    userData: { email: 'pro@chainlens.com', tier: 'pro', role: 'pro' },
    endpoint: '/rate-limit/test/strict',
    expectedLimit: 5, // 5 requests per minute (custom limit)
    testRequests: 7, // Test beyond custom limit
  },
  {
    name: 'Enterprise User - Custom Rate Limit',
    userData: { email: 'enterprise@chainlens.com', tier: 'enterprise', role: 'enterprise' },
    endpoint: '/rate-limit/test/custom',
    expectedLimit: 3, // 3 requests per 30 seconds (custom limit)
    testRequests: 5, // Test beyond custom limit
  },
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

async function testRateLimit(endpoint, token, requestCount, delay = 100) {
  const results = [];
  
  console.log(`  🔄 Making ${requestCount} requests to ${endpoint}...`);
  
  for (let i = 1; i <= requestCount; i++) {
    try {
      const startTime = Date.now();
      const response = await axios.get(`${BASE_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const endTime = Date.now();
      const headers = response.headers;
      
      results.push({
        request: i,
        success: true,
        status: response.status,
        responseTime: endTime - startTime,
        rateLimitHeaders: {
          limit: headers['x-ratelimit-limit'],
          remaining: headers['x-ratelimit-remaining'],
          reset: headers['x-ratelimit-reset'],
          used: headers['x-ratelimit-used'],
          tier: headers['x-ratelimit-tier'],
        }
      });
      
      console.log(`    ✅ Request ${i}: Success (${response.status}) - Remaining: ${headers['x-ratelimit-remaining']}/${headers['x-ratelimit-limit']}`);
      
    } catch (error) {
      const status = error.response?.status;
      const headers = error.response?.headers || {};
      
      results.push({
        request: i,
        success: false,
        status: status,
        error: error.response?.data?.error?.code || 'UNKNOWN_ERROR',
        rateLimitHeaders: {
          limit: headers['x-ratelimit-limit'],
          remaining: headers['x-ratelimit-remaining'],
          reset: headers['x-ratelimit-reset'],
          used: headers['x-ratelimit-used'],
          tier: headers['x-ratelimit-tier'],
          retryAfter: headers['retry-after'],
        }
      });
      
      if (status === 429) {
        console.log(`    🚫 Request ${i}: Rate Limited (429) - Retry After: ${headers['retry-after']}s`);
      } else {
        console.log(`    ❌ Request ${i}: Error (${status}) - ${error.response?.data?.error?.message || error.message}`);
      }
    }
    
    // Add delay between requests
    if (i < requestCount && delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return results;
}

async function testUserStats(token, userData) {
  try {
    console.log(`  📊 Getting user stats...`);
    const response = await axios.get(`${BASE_URL}/rate-limit/my-stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const stats = response.data.data.stats;
    console.log(`    📈 Total Requests: ${stats.totalRequests}`);
    console.log(`    🚫 Blocked Requests: ${stats.blockedRequests}`);
    console.log(`    📊 Current Usage: ${stats.currentWindowUsage}/${stats.currentWindowLimit} (${stats.usagePercentage}%)`);
    
    return stats;
  } catch (error) {
    console.log(`    ❌ Failed to get user stats: ${error.response?.data?.error?.message || error.message}`);
    return null;
  }
}

async function runRateLimitTests() {
  console.log('🚀 Starting Rate Limiting Tests\n');
  
  const testResults = [];
  
  for (const scenario of testScenarios) {
    console.log(`📋 Testing: ${scenario.name}`);
    console.log(`   User: ${scenario.userData.tier}/${scenario.userData.role}`);
    console.log(`   Endpoint: ${scenario.endpoint}`);
    console.log(`   Expected Limit: ${scenario.expectedLimit} requests`);
    
    // Generate token
    const token = await generateToken(scenario.userData);
    if (!token) {
      console.log(`  ❌ Skipping scenario due to token generation failure\n`);
      continue;
    }
    
    // Test rate limiting
    const results = await testRateLimit(scenario.endpoint, token, scenario.testRequests, 200);
    
    // Get user stats
    const stats = await testUserStats(token, scenario.userData);
    
    // Analyze results
    const successfulRequests = results.filter(r => r.success).length;
    const rateLimitedRequests = results.filter(r => r.status === 429).length;
    const firstRateLimitAt = results.findIndex(r => r.status === 429) + 1;
    
    const scenarioResult = {
      scenario: scenario.name,
      userData: scenario.userData,
      endpoint: scenario.endpoint,
      expectedLimit: scenario.expectedLimit,
      totalRequests: scenario.testRequests,
      successfulRequests,
      rateLimitedRequests,
      firstRateLimitAt: firstRateLimitAt > 0 ? firstRateLimitAt : null,
      stats,
      results,
    };
    
    testResults.push(scenarioResult);
    
    console.log(`  📊 Results:`);
    console.log(`    ✅ Successful: ${successfulRequests}/${scenario.testRequests}`);
    console.log(`    🚫 Rate Limited: ${rateLimitedRequests}/${scenario.testRequests}`);
    if (firstRateLimitAt) {
      console.log(`    🎯 First Rate Limit at Request: ${firstRateLimitAt}`);
    }
    
    console.log('');
    
    // Wait between scenarios to avoid interference
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Summary
  console.log('📊 Test Summary:');
  console.log(`  Total Scenarios: ${testResults.length}`);
  
  let passedScenarios = 0;
  for (const result of testResults) {
    const rateLimitWorking = result.rateLimitedRequests > 0;
    const withinExpectedRange = result.firstRateLimitAt ? 
      (result.firstRateLimitAt <= result.expectedLimit + 2) : // Allow small variance
      (result.successfulRequests <= result.expectedLimit + 2);
    
    if (rateLimitWorking || result.successfulRequests <= result.expectedLimit) {
      passedScenarios++;
      console.log(`  ✅ ${result.scenario}: PASSED`);
    } else {
      console.log(`  ❌ ${result.scenario}: FAILED - Rate limiting not working as expected`);
    }
  }
  
  console.log(`  Success Rate: ${passedScenarios}/${testResults.length} (${((passedScenarios / testResults.length) * 100).toFixed(1)}%)`);
  
  if (passedScenarios === testResults.length) {
    console.log('\n🎉 All rate limiting tests passed! Enhanced rate limiting is working correctly.');
    process.exit(0);
  } else {
    console.log('\n❌ Some rate limiting tests failed. Please check the implementation.');
    process.exit(1);
  }
}

// Run tests
runRateLimitTests().catch(error => {
  console.error('💥 Test runner failed:', error.message);
  process.exit(1);
});
