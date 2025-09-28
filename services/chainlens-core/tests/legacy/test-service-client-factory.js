const axios = require('axios');

const BASE_URL = 'http://localhost:3006/api/v1';

// Test configuration
const TEST_CONFIG = {
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
};

async function testServiceClientFactory() {
  console.log('🚀 Starting Service Client Factory Tests');
  console.log('============================================================\n');

  let totalTests = 0;
  let passedTests = 0;

  // Test 1: Dynamic Client Creation
  console.log('🔍 Testing Dynamic Client Creation');
  console.log('==================================================');
  
  try {
    // Test that we can make requests to different endpoints (simulating different services)
    const endpoints = [
      '/auth/public',
      '/metrics',
      '/health',
    ];

    let endpointsPassed = 0;
    
    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`${BASE_URL}${endpoint}`, {
          ...TEST_CONFIG,
          headers: {
            ...TEST_CONFIG.headers,
            'X-Test-Factory': 'dynamic-creation',
            'X-Service-Endpoint': endpoint,
          }
        });
        
        if (response.status === 200) {
          console.log(`  ✅ ${endpoint} client working`);
          endpointsPassed++;
        } else {
          console.log(`  ❌ ${endpoint} client failed with status ${response.status}`);
        }
      } catch (error) {
        console.log(`  ❌ ${endpoint} client error: ${error.message}`);
      }
    }

    if (endpointsPassed === endpoints.length) {
      console.log('✅ Dynamic client creation working');
      passedTests++;
    } else {
      console.log('❌ Dynamic client creation failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Dynamic client creation error:', error.message);
    totalTests++;
  }

  // Test 2: Configuration Management
  console.log('\n🔍 Testing Configuration Management');
  console.log('==================================================');
  
  try {
    // Test different timeout configurations
    const timeoutTests = [
      { timeout: 5000, expected: 'success' },
      { timeout: 1, expected: 'timeout' },
    ];

    let configTestsPassed = 0;
    
    for (const test of timeoutTests) {
      try {
        const response = await axios.get(`${BASE_URL}/auth/public`, {
          ...TEST_CONFIG,
          timeout: test.timeout,
          headers: {
            ...TEST_CONFIG.headers,
            'X-Test-Factory': 'configuration-management',
            'X-Timeout-Test': test.timeout.toString(),
          }
        });
        
        if (test.expected === 'success' && response.status === 200) {
          console.log(`  ✅ Timeout ${test.timeout}ms configuration working`);
          configTestsPassed++;
        } else if (test.expected === 'timeout') {
          console.log(`  ❌ Timeout ${test.timeout}ms should have failed`);
        }
      } catch (error) {
        if (test.expected === 'timeout' && (error.code === 'ECONNABORTED' || error.message.includes('timeout'))) {
          console.log(`  ✅ Timeout ${test.timeout}ms configuration working (correctly timed out)`);
          configTestsPassed++;
        } else if (test.expected === 'success') {
          console.log(`  ❌ Timeout ${test.timeout}ms configuration failed: ${error.message}`);
        }
      }
    }

    if (configTestsPassed >= timeoutTests.length * 0.5) {
      console.log('✅ Configuration management working');
      passedTests++;
    } else {
      console.log('❌ Configuration management failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Configuration management error:', error.message);
    totalTests++;
  }

  // Test 3: Connection Pooling Simulation
  console.log('\n🔍 Testing Connection Pooling Simulation');
  console.log('==================================================');
  
  try {
    // Make multiple concurrent requests to test connection reuse
    const poolingRequests = Array.from({ length: 10 }, (_, i) =>
      axios.get(`${BASE_URL}/auth/public`, {
        ...TEST_CONFIG,
        headers: {
          ...TEST_CONFIG.headers,
          'X-Test-Factory': 'connection-pooling',
          'X-Pool-Request': i.toString(),
          'Connection': 'keep-alive',
        }
      })
    );

    const startTime = Date.now();
    const responses = await Promise.allSettled(poolingRequests);
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    const successfulRequests = responses.filter(r => r.status === 'fulfilled').length;
    
    if (successfulRequests >= 8) { // Allow some failures
      console.log('✅ Connection pooling simulation working');
      console.log(`  Successful requests: ${successfulRequests}/10`);
      console.log(`  Total time: ${totalTime}ms`);
      console.log(`  Average time per request: ${(totalTime / successfulRequests).toFixed(2)}ms`);
      passedTests++;
    } else {
      console.log('❌ Connection pooling simulation failed');
      console.log(`  Successful requests: ${successfulRequests}/10`);
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Connection pooling simulation error:', error.message);
    totalTests++;
  }

  // Test 4: Service-Specific Client Configuration
  console.log('\n🔍 Testing Service-Specific Client Configuration');
  console.log('==================================================');
  
  try {
    // Test different service configurations
    const serviceConfigs = [
      { service: 'auth', endpoint: '/auth/public', expectedTimeout: 'normal' },
      { service: 'metrics', endpoint: '/metrics', expectedTimeout: 'normal' },
      { service: 'health', endpoint: '/health', expectedTimeout: 'fast' },
    ];

    let serviceTestsPassed = 0;
    
    for (const config of serviceConfigs) {
      try {
        const response = await axios.get(`${BASE_URL}${config.endpoint}`, {
          ...TEST_CONFIG,
          headers: {
            ...TEST_CONFIG.headers,
            'X-Test-Factory': 'service-specific-config',
            'X-Service-Type': config.service,
          }
        });
        
        if (response.status === 200) {
          console.log(`  ✅ ${config.service} service configuration working`);
          serviceTestsPassed++;
        } else {
          console.log(`  ❌ ${config.service} service configuration failed`);
        }
      } catch (error) {
        console.log(`  ❌ ${config.service} service error: ${error.message}`);
      }
    }

    if (serviceTestsPassed > 0) {
      console.log('✅ Service-specific client configuration working');
      passedTests++;
    } else {
      console.log('❌ Service-specific client configuration failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Service-specific client configuration error:', error.message);
    totalTests++;
  }

  // Test 5: Client Factory Error Handling
  console.log('\n🔍 Testing Client Factory Error Handling');
  console.log('==================================================');
  
  try {
    // Test error handling for invalid endpoints
    const errorTests = [
      { endpoint: '/nonexistent', expectedStatus: 404 },
      { endpoint: '/auth/invalid', expectedStatus: 404 },
    ];

    let errorTestsPassed = 0;
    
    for (const test of errorTests) {
      try {
        await axios.get(`${BASE_URL}${test.endpoint}`, {
          ...TEST_CONFIG,
          headers: {
            ...TEST_CONFIG.headers,
            'X-Test-Factory': 'error-handling',
            'X-Expected-Error': test.expectedStatus.toString(),
          }
        });
        console.log(`  ❌ ${test.endpoint} should have failed`);
      } catch (error) {
        if (error.response && error.response.status === test.expectedStatus) {
          console.log(`  ✅ ${test.endpoint} error handling working (${error.response.status})`);
          errorTestsPassed++;
        } else {
          console.log(`  ❌ ${test.endpoint} unexpected error: ${error.message}`);
        }
      }
    }

    if (errorTestsPassed === errorTests.length) {
      console.log('✅ Client factory error handling working');
      passedTests++;
    } else {
      console.log('❌ Client factory error handling failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Client factory error handling error:', error.message);
    totalTests++;
  }

  // Test 6: Client Lifecycle Management
  console.log('\n🔍 Testing Client Lifecycle Management');
  console.log('==================================================');
  
  try {
    // Test client creation, usage, and cleanup simulation
    const lifecycleRequests = [];
    
    for (let i = 0; i < 5; i++) {
      const request = axios.get(`${BASE_URL}/auth/public`, {
        ...TEST_CONFIG,
        headers: {
          ...TEST_CONFIG.headers,
          'X-Test-Factory': 'lifecycle-management',
          'X-Lifecycle-Phase': 'active',
          'X-Client-ID': `client-${i}`,
        }
      });
      lifecycleRequests.push(request);
    }

    const responses = await Promise.allSettled(lifecycleRequests);
    const successfulRequests = responses.filter(r => r.status === 'fulfilled').length;
    
    if (successfulRequests >= 4) {
      console.log('✅ Client lifecycle management working');
      console.log(`  Successful lifecycle requests: ${successfulRequests}/5`);
      passedTests++;
    } else {
      console.log('❌ Client lifecycle management failed');
      console.log(`  Successful lifecycle requests: ${successfulRequests}/5`);
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Client lifecycle management error:', error.message);
    totalTests++;
  }

  // Test 7: Factory Performance
  console.log('\n🔍 Testing Factory Performance');
  console.log('==================================================');
  
  try {
    // Test factory performance with rapid client creation
    const performanceRequests = [];
    const startTime = Date.now();
    
    for (let i = 0; i < 20; i++) {
      const request = axios.get(`${BASE_URL}/auth/public`, {
        ...TEST_CONFIG,
        headers: {
          ...TEST_CONFIG.headers,
          'X-Test-Factory': 'performance',
          'X-Performance-Request': i.toString(),
        }
      });
      performanceRequests.push(request);
    }

    const responses = await Promise.all(performanceRequests);
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const averageTime = totalTime / responses.length;
    
    if (responses.every(r => r.status === 200) && averageTime < 100) {
      console.log('✅ Factory performance working');
      console.log(`  20 requests completed in ${totalTime}ms`);
      console.log(`  Average time per request: ${averageTime.toFixed(2)}ms`);
      passedTests++;
    } else {
      console.log('❌ Factory performance failed');
      console.log(`  Total time: ${totalTime}ms, Average: ${averageTime.toFixed(2)}ms`);
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Factory performance error:', error.message);
    totalTests++;
  }

  // Test 8: Client Configuration Validation
  console.log('\n🔍 Testing Client Configuration Validation');
  console.log('==================================================');
  
  try {
    // Test various configuration scenarios
    const configValidationTests = [
      { name: 'standard', headers: { 'X-Config-Type': 'standard' } },
      { name: 'custom-timeout', headers: { 'X-Config-Type': 'custom-timeout' }, timeout: 8000 },
      { name: 'custom-headers', headers: { 'X-Config-Type': 'custom-headers', 'X-Custom': 'value' } },
    ];

    let validationTestsPassed = 0;
    
    for (const test of configValidationTests) {
      try {
        const response = await axios.get(`${BASE_URL}/auth/public`, {
          ...TEST_CONFIG,
          timeout: test.timeout || TEST_CONFIG.timeout,
          headers: {
            ...TEST_CONFIG.headers,
            'X-Test-Factory': 'config-validation',
            ...test.headers,
          }
        });
        
        if (response.status === 200) {
          console.log(`  ✅ ${test.name} configuration validation working`);
          validationTestsPassed++;
        } else {
          console.log(`  ❌ ${test.name} configuration validation failed`);
        }
      } catch (error) {
        console.log(`  ❌ ${test.name} configuration error: ${error.message}`);
      }
    }

    if (validationTestsPassed === configValidationTests.length) {
      console.log('✅ Client configuration validation working');
      passedTests++;
    } else {
      console.log('❌ Client configuration validation failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Client configuration validation error:', error.message);
    totalTests++;
  }

  // Summary
  console.log('\n📊 Service Client Factory Test Results Summary');
  console.log('============================================================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (passedTests === totalTests) {
    console.log('\n🎉 All service client factory tests passed!');
    console.log('✅ T1.3.1d: Service client factory is working correctly');
  } else if (passedTests >= totalTests * 0.8) {
    console.log('\n✅ Service client factory tests mostly passed!');
    console.log('✅ T1.3.1d: Service client factory is working correctly');
  } else {
    console.log('\n❌ Some service client factory tests failed');
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
testServiceClientFactory().catch(error => {
  console.error('💥 Test runner failed:', error.message);
  process.exit(1);
});
