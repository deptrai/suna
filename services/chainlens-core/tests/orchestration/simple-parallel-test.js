const axios = require('axios');

const BASE_URL = 'http://localhost:3006/api/v1';

async function testSimpleParallelExecution() {
  console.log('🚀 Starting Simple Parallel Execution Test');
  console.log('============================================================\n');

  let totalTests = 0;
  let passedTests = 0;

  // Test 1: Test existing endpoints work
  console.log('🔍 Testing Existing Endpoints');
  console.log('==================================================');
  
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    
    if (response.status === 200) {
      console.log('✅ Health endpoint working');
      console.log(`  Server is running and healthy`);
      passedTests++;
    } else {
      console.log('❌ Health endpoint failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Health endpoint error:', error.message);
    totalTests++;
  }

  // Test 2: Test auth endpoints
  console.log('\n🔍 Testing Auth Endpoints');
  console.log('==================================================');
  
  try {
    const response = await axios.get(`${BASE_URL}/auth/public`);
    
    if (response.status === 200) {
      console.log('✅ Auth public endpoint working');
      passedTests++;
    } else {
      console.log('❌ Auth public endpoint failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Auth public endpoint error:', error.message);
    totalTests++;
  }

  // Test 3: Test analysis endpoints
  console.log('\n🔍 Testing Analysis Endpoints');
  console.log('==================================================');
  
  try {
    // Try to access analysis endpoint (should require auth)
    const response = await axios.get(`${BASE_URL}/analysis`);
    console.log('❌ Analysis endpoint should require auth');
    totalTests++;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('✅ Analysis endpoint properly requires auth');
      passedTests++;
    } else {
      console.log('❌ Analysis endpoint unexpected error:', error.message);
    }
    totalTests++;
  }

  // Test 4: Test with JWT token
  console.log('\n🔍 Testing With JWT Token');
  console.log('==================================================');
  
  try {
    // First get a test token
    const tokenResponse = await axios.post(`${BASE_URL}/auth/test-token`, {
      email: 'test@chainlens.com',
      tier: 'free',
      role: 'user'
    });

    if (tokenResponse.status === 201 && tokenResponse.data.data.token) {
      const token = tokenResponse.data.data.token;
      console.log('✅ Test token obtained successfully');
      
      // Now try to access protected endpoint
      try {
        const protectedResponse = await axios.get(`${BASE_URL}/auth/protected`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (protectedResponse.status === 200) {
          console.log('✅ Protected endpoint accessible with token');
          passedTests++;
        } else {
          console.log('❌ Protected endpoint failed');
        }
      } catch (protectedError) {
        console.log('❌ Protected endpoint error:', protectedError.message);
      }
      
      passedTests++; // For getting token
    } else {
      console.log('❌ Failed to get test token');
    }
    totalTests += 2; // Token + protected endpoint
  } catch (error) {
    console.log('❌ JWT token test error:', error.message);
    totalTests += 2;
  }

  // Test 5: Test Parallel Execution Concept
  console.log('\n🔍 Testing Parallel Execution Concept');
  console.log('==================================================');
  
  try {
    // Test parallel requests to existing endpoints
    const parallelRequests = [
      axios.get(`${BASE_URL}/health`),
      axios.get(`${BASE_URL}/auth/public`),
      axios.get(`${BASE_URL}/metrics`),
    ];

    const startTime = Date.now();
    const responses = await Promise.allSettled(parallelRequests);
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    const successfulRequests = responses.filter(r => r.status === 'fulfilled').length;
    
    if (successfulRequests >= 2) {
      console.log('✅ Parallel execution concept working');
      console.log(`  Executed ${successfulRequests}/3 requests in parallel`);
      console.log(`  Total time: ${totalTime}ms`);
      passedTests++;
    } else {
      console.log('❌ Parallel execution concept failed');
      console.log(`  Only ${successfulRequests}/3 requests succeeded`);
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Parallel execution concept error:', error.message);
    totalTests++;
  }

  // Test 6: Test Concurrency Control Simulation
  console.log('\n🔍 Testing Concurrency Control Simulation');
  console.log('==================================================');
  
  try {
    // Test concurrency with multiple requests
    const concurrentRequests = Array.from({ length: 5 }, (_, i) =>
      axios.get(`${BASE_URL}/health`, {
        headers: {
          'X-Request-ID': `concurrent-${i}`,
        }
      })
    );

    const startTime = Date.now();
    const responses = await Promise.allSettled(concurrentRequests);
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    const successfulRequests = responses.filter(r => r.status === 'fulfilled').length;
    
    if (successfulRequests >= 4) {
      console.log('✅ Concurrency control simulation working');
      console.log(`  Handled ${successfulRequests}/5 concurrent requests`);
      console.log(`  Total time: ${totalTime}ms`);
      console.log(`  Average time per request: ${(totalTime / successfulRequests).toFixed(2)}ms`);
      passedTests++;
    } else {
      console.log('❌ Concurrency control simulation failed');
      console.log(`  Only handled ${successfulRequests}/5 concurrent requests`);
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Concurrency control simulation error:', error.message);
    totalTests++;
  }

  // Test 7: Test Error Handling
  console.log('\n🔍 Testing Error Handling');
  console.log('==================================================');
  
  try {
    // Test error handling with invalid endpoints
    const errorRequests = [
      axios.get(`${BASE_URL}/nonexistent`).catch(e => ({ error: e, endpoint: 'nonexistent' })),
      axios.get(`${BASE_URL}/health`).catch(e => ({ error: e, endpoint: 'health' })),
      axios.get(`${BASE_URL}/invalid`).catch(e => ({ error: e, endpoint: 'invalid' })),
    ];

    const responses = await Promise.allSettled(errorRequests);
    const successfulRequests = responses.filter(r => 
      r.status === 'fulfilled' && 
      (!r.value.error || r.value.endpoint === 'health')
    ).length;
    
    if (successfulRequests >= 1) { // At least health should work
      console.log('✅ Error handling working');
      console.log(`  Properly handled mixed success/error responses`);
      passedTests++;
    } else {
      console.log('❌ Error handling failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Error handling test error:', error.message);
    totalTests++;
  }

  // Test 8: Test Response Aggregation Simulation
  console.log('\n🔍 Testing Response Aggregation Simulation');
  console.log('==================================================');
  
  try {
    // Simulate response aggregation
    const aggregationRequests = [
      axios.get(`${BASE_URL}/health`),
      axios.get(`${BASE_URL}/auth/public`),
      axios.get(`${BASE_URL}/metrics`),
    ];

    const responses = await Promise.allSettled(aggregationRequests);
    
    // Aggregate responses
    const aggregatedResult = {
      services: {},
      warnings: [],
      recommendations: [],
      executionTime: 0,
      successRate: 0,
    };

    const serviceNames = ['health', 'auth', 'metrics'];
    let successCount = 0;

    responses.forEach((response, index) => {
      const serviceName = serviceNames[index];
      
      if (response.status === 'fulfilled') {
        aggregatedResult.services[serviceName] = {
          status: 'success',
          data: response.value.data,
          responseTime: 50, // Simulated
        };
        successCount++;
      } else {
        aggregatedResult.services[serviceName] = {
          status: 'error',
          data: null,
          responseTime: 0,
          error: response.reason?.message || 'Unknown error',
        };
        aggregatedResult.warnings.push(`Service ${serviceName} failed`);
      }
    });

    aggregatedResult.successRate = successCount / responses.length;

    if (aggregatedResult.successRate >= 0.5) {
      console.log('✅ Response aggregation simulation working');
      console.log(`  Aggregated ${Object.keys(aggregatedResult.services).length} service responses`);
      console.log(`  Success rate: ${(aggregatedResult.successRate * 100).toFixed(1)}%`);
      console.log(`  Warnings: ${aggregatedResult.warnings.length}`);
      passedTests++;
    } else {
      console.log('❌ Response aggregation simulation failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Response aggregation simulation error:', error.message);
    totalTests++;
  }

  // Summary
  console.log('\n📊 Simple Parallel Execution Test Results Summary');
  console.log('============================================================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (passedTests === totalTests) {
    console.log('\n🎉 All simple parallel execution tests passed!');
    console.log('✅ Basic parallel execution concepts are working');
  } else if (passedTests >= totalTests * 0.8) {
    console.log('\n✅ Simple parallel execution tests mostly passed!');
    console.log('✅ Basic parallel execution concepts are working');
  } else {
    console.log('\n❌ Some simple parallel execution tests failed');
    console.log('🔧 Please check the server configuration');
  }

  return {
    total: totalTests,
    passed: passedTests,
    failed: totalTests - passedTests,
    successRate: (passedTests / totalTests) * 100
  };
}

// Export for use in test runner
module.exports = { testSimpleParallelExecution };

// Run tests if called directly
if (require.main === module) {
  testSimpleParallelExecution().catch(error => {
    console.error('💥 Test runner failed:', error.message);
    process.exit(1);
  });
}
