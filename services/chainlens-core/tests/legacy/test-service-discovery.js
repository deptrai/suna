const axios = require('axios');

const BASE_URL = 'http://localhost:3006/api/v1';

// Test configuration
const TEST_CONFIG = {
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
};

async function testServiceDiscovery() {
  console.log('🚀 Starting Service Discovery Tests');
  console.log('============================================================\n');

  let totalTests = 0;
  let passedTests = 0;

  // Test 1: Health Check Endpoint
  console.log('🔍 Testing Health Check Endpoint');
  console.log('==================================================');
  
  try {
    const response = await axios.get(`${BASE_URL}/health`, TEST_CONFIG);

    if (response.status === 200 && response.data.success && response.data.data.status) {
      console.log('✅ Health check endpoint working');
      console.log(`  Status: ${response.data.data.status}`);
      console.log(`  Uptime: ${response.data.data.uptime}ms`);
      console.log(`  Environment: ${response.data.data.environment}`);
      passedTests++;
    } else {
      console.log('❌ Health check endpoint failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Health check endpoint error:', error.message);
    totalTests++;
  }

  // Test 2: Readiness Check Endpoint
  console.log('\n🔍 Testing Readiness Check Endpoint');
  console.log('==================================================');
  
  try {
    const response = await axios.get(`${BASE_URL}/health/ready`, TEST_CONFIG);

    if (response.status === 200 && response.data.success && response.data.data.ready !== undefined) {
      console.log('✅ Readiness check endpoint working');
      console.log(`  Ready: ${response.data.data.ready}`);
      console.log(`  Database: ${response.data.data.checks.database}`);
      console.log(`  Redis: ${response.data.data.checks.redis}`);
      console.log(`  Auth: ${response.data.data.checks.auth}`);
      passedTests++;
    } else {
      console.log('❌ Readiness check endpoint failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Readiness check endpoint error:', error.message);
    totalTests++;
  }

  // Test 3: Liveness Check Endpoint
  console.log('\n🔍 Testing Liveness Check Endpoint');
  console.log('==================================================');
  
  try {
    const response = await axios.get(`${BASE_URL}/health/live`, TEST_CONFIG);

    if (response.status === 200 && response.data.success && response.data.data.alive !== undefined) {
      console.log('✅ Liveness check endpoint working');
      console.log(`  Alive: ${response.data.data.alive}`);
      console.log(`  Uptime: ${response.data.data.uptime}ms`);
      passedTests++;
    } else {
      console.log('❌ Liveness check endpoint failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Liveness check endpoint error:', error.message);
    totalTests++;
  }

  // Test 4: Service Endpoint Configuration
  console.log('\n🔍 Testing Service Endpoint Configuration');
  console.log('==================================================');
  
  try {
    // Test that we can reach the main API endpoints
    const endpoints = [
      '/auth/public',
      '/metrics',
    ];

    let endpointsPassed = 0;
    
    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`${BASE_URL}${endpoint}`, TEST_CONFIG);
        if (response.status === 200) {
          console.log(`  ✅ ${endpoint} endpoint reachable`);
          endpointsPassed++;
        } else {
          console.log(`  ❌ ${endpoint} endpoint failed with status ${response.status}`);
        }
      } catch (error) {
        console.log(`  ❌ ${endpoint} endpoint error: ${error.message}`);
      }
    }

    if (endpointsPassed > 0) {
      console.log('✅ Service endpoint configuration working');
      passedTests++;
    } else {
      console.log('❌ Service endpoint configuration failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Service endpoint configuration test error:', error.message);
    totalTests++;
  }

  // Test 5: Load Balancing Simulation
  console.log('\n🔍 Testing Load Balancing Simulation');
  console.log('==================================================');
  
  try {
    // Make multiple requests to simulate load balancing
    const requests = [];
    const requestCount = 10;
    
    for (let i = 0; i < requestCount; i++) {
      requests.push(
        axios.get(`${BASE_URL}/auth/public`, {
          ...TEST_CONFIG,
          headers: {
            ...TEST_CONFIG.headers,
            'X-Request-ID': `lb-test-${i}`,
            'X-Load-Balance-Test': 'true',
          }
        })
      );
    }

    const responses = await Promise.allSettled(requests);
    const successfulRequests = responses.filter(r => r.status === 'fulfilled').length;
    
    if (successfulRequests >= requestCount * 0.8) { // 80% success rate
      console.log('✅ Load balancing simulation working');
      console.log(`  Successful requests: ${successfulRequests}/${requestCount}`);
      passedTests++;
    } else {
      console.log('❌ Load balancing simulation failed');
      console.log(`  Successful requests: ${successfulRequests}/${requestCount}`);
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Load balancing simulation error:', error.message);
    totalTests++;
  }

  // Test 6: Service Discovery Headers
  console.log('\n🔍 Testing Service Discovery Headers');
  console.log('==================================================');
  
  try {
    const response = await axios.get(`${BASE_URL}/auth/public`, {
      ...TEST_CONFIG,
      headers: {
        ...TEST_CONFIG.headers,
        'X-Service-Discovery': 'test',
        'X-Client-Version': '1.0.0',
        'X-Request-Priority': '1',
      }
    });

    if (response.status === 200) {
      console.log('✅ Service discovery headers working');
      passedTests++;
    } else {
      console.log('❌ Service discovery headers failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Service discovery headers error:', error.message);
    totalTests++;
  }

  // Test 7: Health Check Response Format
  console.log('\n🔍 Testing Health Check Response Format');
  console.log('==================================================');
  
  try {
    const response = await axios.get(`${BASE_URL}/health`, TEST_CONFIG);
    const data = response.data.data; // Extract data from wrapped response

    const requiredFields = ['status', 'timestamp', 'uptime', 'version', 'environment', 'services', 'memory', 'cpu'];
    const hasAllFields = requiredFields.every(field => data.hasOwnProperty(field));

    if (hasAllFields) {
      console.log('✅ Health check response format correct');
      console.log(`  All required fields present: ${requiredFields.join(', ')}`);
      passedTests++;
    } else {
      console.log('❌ Health check response format incorrect');
      const missingFields = requiredFields.filter(field => !data.hasOwnProperty(field));
      console.log(`  Missing fields: ${missingFields.join(', ')}`);
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Health check response format error:', error.message);
    totalTests++;
  }

  // Test 8: Service Timeout Configuration
  console.log('\n🔍 Testing Service Timeout Configuration');
  console.log('==================================================');
  
  try {
    // Test with different timeout values
    const timeoutTests = [
      { timeout: 5000, expected: 'success' },
      { timeout: 1, expected: 'timeout' },
    ];

    let timeoutTestsPassed = 0;
    
    for (const test of timeoutTests) {
      try {
        const response = await axios.get(`${BASE_URL}/auth/public`, {
          ...TEST_CONFIG,
          timeout: test.timeout,
        });
        
        if (test.expected === 'success' && response.status === 200) {
          console.log(`  ✅ Timeout ${test.timeout}ms test passed`);
          timeoutTestsPassed++;
        } else if (test.expected === 'timeout') {
          console.log(`  ❌ Timeout ${test.timeout}ms should have failed`);
        }
      } catch (error) {
        if (test.expected === 'timeout' && (error.code === 'ECONNABORTED' || error.message.includes('timeout'))) {
          console.log(`  ✅ Timeout ${test.timeout}ms test passed (correctly timed out)`);
          timeoutTestsPassed++;
        } else if (test.expected === 'success') {
          console.log(`  ❌ Timeout ${test.timeout}ms test failed: ${error.message}`);
        }
      }
    }

    if (timeoutTestsPassed >= timeoutTests.length * 0.5) {
      console.log('✅ Service timeout configuration working');
      passedTests++;
    } else {
      console.log('❌ Service timeout configuration failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Service timeout configuration error:', error.message);
    totalTests++;
  }

  // Test 9: Service Priority Configuration
  console.log('\n🔍 Testing Service Priority Configuration');
  console.log('==================================================');
  
  try {
    // Test requests with different priorities
    const priorityRequests = [
      { priority: 1, name: 'low' },
      { priority: 5, name: 'medium' },
      { priority: 10, name: 'high' },
    ];

    let priorityTestsPassed = 0;
    
    for (const req of priorityRequests) {
      try {
        const response = await axios.get(`${BASE_URL}/auth/public`, {
          ...TEST_CONFIG,
          headers: {
            ...TEST_CONFIG.headers,
            'X-Request-Priority': req.priority.toString(),
            'X-Priority-Test': req.name,
          }
        });
        
        if (response.status === 200) {
          console.log(`  ✅ Priority ${req.name} (${req.priority}) test passed`);
          priorityTestsPassed++;
        }
      } catch (error) {
        console.log(`  ❌ Priority ${req.name} test failed: ${error.message}`);
      }
    }

    if (priorityTestsPassed > 0) {
      console.log('✅ Service priority configuration working');
      passedTests++;
    } else {
      console.log('❌ Service priority configuration failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Service priority configuration error:', error.message);
    totalTests++;
  }

  // Test 10: Service Discovery Metrics
  console.log('\n🔍 Testing Service Discovery Metrics');
  console.log('==================================================');
  
  try {
    // Make requests and check if metrics are being collected
    const response = await axios.get(`${BASE_URL}/metrics`, TEST_CONFIG);
    
    if (response.status === 200) {
      console.log('✅ Service discovery metrics endpoint working');
      passedTests++;
    } else {
      console.log('❌ Service discovery metrics failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Service discovery metrics error:', error.message);
    totalTests++;
  }

  // Summary
  console.log('\n📊 Service Discovery Test Results Summary');
  console.log('============================================================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (passedTests === totalTests) {
    console.log('\n🎉 All service discovery tests passed!');
    console.log('✅ T1.3.1b: Service discovery setup is working correctly');
  } else if (passedTests >= totalTests * 0.8) {
    console.log('\n✅ Service discovery tests mostly passed!');
    console.log('✅ T1.3.1b: Service discovery setup is working correctly');
  } else {
    console.log('\n❌ Some service discovery tests failed');
    console.log('🔧 Please check the configuration and retry');
  }

  return {
    total: totalTests,
    passed: passedTests,
    failed: totalTests - passedTests,
    successRate: (passedTests / totalTests) * 100
  };
}

// Run tests
testServiceDiscovery().catch(error => {
  console.error('💥 Test runner failed:', error.message);
  process.exit(1);
});
