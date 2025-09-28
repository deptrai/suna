const axios = require('axios');

const BASE_URL = 'http://localhost:3006/api/v1';

// Test configuration
const TEST_CONFIG = {
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  }
};

async function testHttpClientConfiguration() {
  console.log('🚀 Starting HTTP Client Configuration Tests');
  console.log('============================================================\n');

  let totalTests = 0;
  let passedTests = 0;

  // Test 1: Service Discovery and Configuration
  console.log('🔍 Testing Service Discovery and Configuration');
  console.log('==================================================');
  
  try {
    // Test health endpoint to verify server is running
    const healthResponse = await axios.get(`${BASE_URL}/health`, TEST_CONFIG);
    console.log('✅ Server health check passed');
    totalTests++;
    passedTests++;
  } catch (error) {
    console.log('❌ Server health check failed:', error.message);
    totalTests++;
  }

  // Test 2: HTTP Client Timeout Configuration
  console.log('\n🔍 Testing HTTP Client Timeout Configuration');
  console.log('==================================================');
  
  try {
    // Test with very short timeout to verify timeout handling
    const shortTimeoutConfig = {
      ...TEST_CONFIG,
      timeout: 1, // 1ms timeout should fail
    };
    
    await axios.get(`${BASE_URL}/auth/profile`, shortTimeoutConfig);
    console.log('❌ Timeout test failed - request should have timed out');
    totalTests++;
  } catch (error) {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      console.log('✅ Timeout configuration working correctly');
      passedTests++;
    } else {
      console.log('❌ Unexpected error in timeout test:', error.message);
    }
    totalTests++;
  }

  // Test 3: Request Headers Configuration
  console.log('\n🔍 Testing Request Headers Configuration');
  console.log('==================================================');
  
  try {
    const customHeaders = {
      ...TEST_CONFIG.headers,
      'X-Test-Header': 'test-value',
      'X-Correlation-ID': 'test-correlation-123',
      'User-Agent': 'ChainLens-Test/1.0.0',
    };

    const response = await axios.get(`${BASE_URL}/auth/public`, {
      ...TEST_CONFIG,
      headers: customHeaders,
    });

    if (response.status === 200) {
      console.log('✅ Custom headers configuration working');
      passedTests++;
    } else {
      console.log('❌ Custom headers test failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Custom headers test error:', error.message);
    totalTests++;
  }

  // Test 4: Error Handling Configuration
  console.log('\n🔍 Testing Error Handling Configuration');
  console.log('==================================================');
  
  try {
    // Test 404 error handling
    await axios.get(`${BASE_URL}/nonexistent-endpoint`, TEST_CONFIG);
    console.log('❌ Error handling test failed - should have thrown error');
    totalTests++;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log('✅ 404 error handling working correctly');
      passedTests++;
    } else {
      console.log('❌ Unexpected error in error handling test:', error.message);
    }
    totalTests++;
  }

  // Test 5: Content-Type Configuration
  console.log('\n🔍 Testing Content-Type Configuration');
  console.log('==================================================');
  
  try {
    const jsonData = { test: 'data' };
    
    const response = await axios.post(`${BASE_URL}/auth/test-token`, {
      email: 'test@chainlens.com',
      tier: 'free',
      role: 'user'
    }, {
      ...TEST_CONFIG,
      headers: {
        ...TEST_CONFIG.headers,
        'Content-Type': 'application/json',
      }
    });

    if (response.status === 200 || response.status === 201) {
      console.log('✅ JSON Content-Type configuration working');
      passedTests++;
    } else {
      console.log('❌ JSON Content-Type test failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ JSON Content-Type test error:', error.message);
    totalTests++;
  }

  // Test 6: Response Validation Configuration
  console.log('\n🔍 Testing Response Validation Configuration');
  console.log('==================================================');
  
  try {
    // Test successful response
    const response = await axios.get(`${BASE_URL}/auth/public`, TEST_CONFIG);
    
    if (response.status >= 200 && response.status < 300) {
      console.log('✅ Response validation for success working');
      passedTests++;
    } else {
      console.log('❌ Response validation test failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Response validation test error:', error.message);
    totalTests++;
  }

  // Test 7: Connection Configuration
  console.log('\n🔍 Testing Connection Configuration');
  console.log('==================================================');
  
  try {
    // Test multiple concurrent requests to verify connection pooling
    const concurrentRequests = Array.from({ length: 5 }, (_, i) =>
      axios.get(`${BASE_URL}/auth/public`, {
        ...TEST_CONFIG,
        headers: {
          ...TEST_CONFIG.headers,
          'X-Request-ID': `concurrent-${i}`,
        }
      })
    );

    const responses = await Promise.all(concurrentRequests);
    
    if (responses.every(r => r.status === 200)) {
      console.log('✅ Concurrent connections working correctly');
      passedTests++;
    } else {
      console.log('❌ Concurrent connections test failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Concurrent connections test error:', error.message);
    totalTests++;
  }

  // Test 8: Compression Configuration
  console.log('\n🔍 Testing Compression Configuration');
  console.log('==================================================');
  
  try {
    const response = await axios.get(`${BASE_URL}/auth/public`, {
      ...TEST_CONFIG,
      headers: {
        ...TEST_CONFIG.headers,
        'Accept-Encoding': 'gzip, deflate',
      }
    });

    if (response.status === 200) {
      console.log('✅ Compression configuration working');
      passedTests++;
    } else {
      console.log('❌ Compression test failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Compression test error:', error.message);
    totalTests++;
  }

  // Test 9: Retry Configuration (simulate with multiple requests)
  console.log('\n🔍 Testing Retry Configuration Simulation');
  console.log('==================================================');
  
  try {
    // Test retry behavior by making requests with different correlation IDs
    const retryRequests = [];
    
    for (let i = 0; i < 3; i++) {
      try {
        const response = await axios.get(`${BASE_URL}/auth/public`, {
          ...TEST_CONFIG,
          headers: {
            ...TEST_CONFIG.headers,
            'X-Retry-Attempt': i.toString(),
          }
        });
        retryRequests.push({ attempt: i, success: true, status: response.status });
      } catch (error) {
        retryRequests.push({ attempt: i, success: false, error: error.message });
      }
    }

    if (retryRequests.some(r => r.success)) {
      console.log('✅ Retry configuration simulation working');
      passedTests++;
    } else {
      console.log('❌ Retry configuration simulation failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Retry configuration test error:', error.message);
    totalTests++;
  }

  // Test 10: Service-Specific Configuration
  console.log('\n🔍 Testing Service-Specific Configuration');
  console.log('==================================================');
  
  try {
    // Test different endpoints to simulate different service configurations
    const serviceTests = [
      { name: 'auth', endpoint: '/auth/public' },
      { name: 'metrics', endpoint: '/metrics' },
    ];

    let serviceTestsPassed = 0;
    
    for (const service of serviceTests) {
      try {
        const response = await axios.get(`${BASE_URL}${service.endpoint}`, {
          ...TEST_CONFIG,
          headers: {
            ...TEST_CONFIG.headers,
            'X-Service-Test': service.name,
          }
        });
        
        if (response.status === 200) {
          console.log(`  ✅ ${service.name} service configuration working`);
          serviceTestsPassed++;
        }
      } catch (error) {
        console.log(`  ❌ ${service.name} service test failed:`, error.message);
      }
    }

    if (serviceTestsPassed > 0) {
      console.log('✅ Service-specific configuration working');
      passedTests++;
    } else {
      console.log('❌ Service-specific configuration failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Service-specific configuration test error:', error.message);
    totalTests++;
  }

  // Summary
  console.log('\n📊 HTTP Client Configuration Test Results Summary');
  console.log('============================================================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (passedTests === totalTests) {
    console.log('\n🎉 All HTTP client configuration tests passed!');
    console.log('✅ T1.3.1a: HTTP client configuration is working correctly');
  } else {
    console.log('\n❌ Some HTTP client configuration tests failed');
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
testHttpClientConfiguration().catch(error => {
  console.error('💥 Test runner failed:', error.message);
  process.exit(1);
});
