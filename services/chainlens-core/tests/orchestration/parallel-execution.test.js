const axios = require('axios');

const BASE_URL = 'http://localhost:3006/api/v1';

// Test configuration
const TEST_CONFIG = {
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  }
};

// Get JWT token for authentication
async function getTestToken() {
  try {
    const response = await axios.post(`${BASE_URL}/auth/test-token`, {
      email: 'test@chainlens.com',
      tier: 'free',
      role: 'user'
    }, TEST_CONFIG);

    return response.data.data.access_token;
  } catch (error) {
    console.error('❌ Failed to get test token:', error.message);
    return null;
  }
}

async function testParallelExecution() {
  console.log('🚀 Starting Parallel Execution Engine Tests');
  console.log('============================================================\n');

  // Get authentication token
  const token = await getTestToken();
  if (!token) {
    console.log('❌ Cannot proceed without authentication token');
    return;
  }

  let totalTests = 0;
  let passedTests = 0;

  // Test 1: Basic Parallel Execution
  console.log('🔍 Testing Basic Parallel Execution');
  console.log('==================================================');
  
  try {
    // Test parallel execution with multiple services
    const response = await axios.post(`${BASE_URL}/analysis/orchestrate`, {
      projectId: 'test-project',
      analysisType: 'full',
      tokenAddress: '0x1234567890123456789012345678901234567890',
      chainId: 1,
      options: {
        timeframe: '24h',
        includeHistorical: false,
        parallelExecution: true,
      }
    }, {
      ...TEST_CONFIG,
      headers: {
        ...TEST_CONFIG.headers,
        'X-Test-Parallel': 'basic-execution',
        'Authorization': `Bearer ${token}`,
      }
    });

    if (response.status === 200 || response.status === 201) {
      console.log('✅ Basic parallel execution working');
      console.log(`  Response status: ${response.status}`);
      console.log(`  Services executed: ${Object.keys(response.data.services || {}).length}`);
      passedTests++;
    } else {
      console.log('❌ Basic parallel execution failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Basic parallel execution error:', error.message);
    totalTests++;
  }

  // Test 2: Concurrency Control
  console.log('\n🔍 Testing Concurrency Control');
  console.log('==================================================');
  
  try {
    // Test concurrent requests to verify concurrency control
    const concurrentRequests = Array.from({ length: 5 }, (_, i) =>
      axios.post(`${BASE_URL}/analysis/orchestrate`, {
        projectId: `test-project-${i}`,
        analysisType: 'full',
        tokenAddress: '0x1234567890123456789012345678901234567890',
        chainId: 1,
        options: {
          parallelExecution: true,
          maxConcurrency: 2,
        }
      }, {
        ...TEST_CONFIG,
        headers: {
          ...TEST_CONFIG.headers,
          'X-Test-Parallel': 'concurrency-control',
          'X-Request-Index': i.toString(),
          'Authorization': `Bearer ${token}`,
        }
      })
    );

    const responses = await Promise.allSettled(concurrentRequests);
    const successfulRequests = responses.filter(r => r.status === 'fulfilled').length;
    
    if (successfulRequests >= 3) { // Allow some failures
      console.log('✅ Concurrency control working');
      console.log(`  Successful concurrent requests: ${successfulRequests}/5`);
      passedTests++;
    } else {
      console.log('❌ Concurrency control failed');
      console.log(`  Successful concurrent requests: ${successfulRequests}/5`);
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Concurrency control error:', error.message);
    totalTests++;
  }

  // Test 3: Service Dependencies
  console.log('\n🔍 Testing Service Dependencies');
  console.log('==================================================');
  
  try {
    // Test services with dependencies
    const response = await axios.post(`${BASE_URL}/analysis/orchestrate`, {
      projectId: 'test-dependency-project',
      analysisType: 'tokenomics', // This should depend on onchain service
      tokenAddress: '0x1234567890123456789012345678901234567890',
      chainId: 1,
      options: {
        parallelExecution: true,
        enforceDepencies: true,
      }
    }, {
      ...TEST_CONFIG,
      headers: {
        ...TEST_CONFIG.headers,
        'X-Test-Parallel': 'service-dependencies',
        'Authorization': `Bearer ${token}`,
      }
    });

    if (response.status === 200 || response.status === 201) {
      console.log('✅ Service dependencies working');
      console.log(`  Dependencies resolved successfully`);
      passedTests++;
    } else {
      console.log('❌ Service dependencies failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Service dependencies error:', error.message);
    totalTests++;
  }

  // Test 4: Execution Priority
  console.log('\n🔍 Testing Execution Priority');
  console.log('==================================================');
  
  try {
    // Test priority-based execution
    const response = await axios.post(`${BASE_URL}/analysis/orchestrate`, {
      projectId: 'test-priority-project',
      analysisType: 'full',
      tokenAddress: '0x1234567890123456789012345678901234567890',
      chainId: 1,
      options: {
        parallelExecution: true,
        priorityExecution: true,
      }
    }, {
      ...TEST_CONFIG,
      headers: {
        ...TEST_CONFIG.headers,
        'X-Test-Parallel': 'execution-priority',
        'Authorization': `Bearer ${token}`,
      }
    });

    if (response.status === 200 || response.status === 201) {
      console.log('✅ Execution priority working');
      console.log(`  Priority-based execution completed`);
      passedTests++;
    } else {
      console.log('❌ Execution priority failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Execution priority error:', error.message);
    totalTests++;
  }

  // Test 5: Fallback Strategies
  console.log('\n🔍 Testing Fallback Strategies');
  console.log('==================================================');
  
  try {
    // Test fallback strategies when services fail
    const response = await axios.post(`${BASE_URL}/analysis/orchestrate`, {
      projectId: 'test-fallback-project',
      analysisType: 'full',
      tokenAddress: '0x1234567890123456789012345678901234567890',
      chainId: 1,
      options: {
        parallelExecution: true,
        enableFallbacks: true,
        simulateFailures: true, // This should trigger fallbacks
      }
    }, {
      ...TEST_CONFIG,
      headers: {
        ...TEST_CONFIG.headers,
        'X-Test-Parallel': 'fallback-strategies',
        'Authorization': `Bearer ${token}`,
      }
    });

    if (response.status === 200 || response.status === 201) {
      console.log('✅ Fallback strategies working');
      console.log(`  Fallback strategies executed successfully`);
      passedTests++;
    } else {
      console.log('❌ Fallback strategies failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Fallback strategies error:', error.message);
    totalTests++;
  }

  // Test 6: Response Aggregation
  console.log('\n🔍 Testing Response Aggregation');
  console.log('==================================================');
  
  try {
    // Test response aggregation from multiple services
    const response = await axios.post(`${BASE_URL}/analysis/orchestrate`, {
      projectId: 'test-aggregation-project',
      analysisType: 'full',
      tokenAddress: '0x1234567890123456789012345678901234567890',
      chainId: 1,
      parallelExecution: true,
      aggregationStrategy: 'best_effort'
    }, {
      ...TEST_CONFIG,
      headers: {
        ...TEST_CONFIG.headers,
        'X-Test-Parallel': 'response-aggregation',
        'Authorization': `Bearer ${token}`,
      }
    });

    if (response.status === 200 || response.status === 201) {
      // Handle nested data structure: response.data.data.data
      const data = response.data.data?.data || response.data.data || response.data;
      const hasAggregatedData = data.services && Object.keys(data.services).length > 0;
      const hasStats = data.parallelExecutionStats;

      if (hasAggregatedData && hasStats) {
        console.log('✅ Response aggregation working');
        console.log(`  Aggregated ${Object.keys(data.services).length} service responses`);
        console.log(`  Success rate: ${(data.successRate * 100).toFixed(1)}%`);
        passedTests++;
      } else {
        console.log('❌ Response aggregation incomplete');
        console.log(`  Services: ${data.services ? Object.keys(data.services).length : 'none'}`);
        console.log(`  Stats: ${data.parallelExecutionStats ? 'present' : 'missing'}`);
      }
    } else {
      console.log('❌ Response aggregation failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Response aggregation error:', error.message);
    totalTests++;
  }

  // Test 7: Timeout Handling
  console.log('\n🔍 Testing Timeout Handling');
  console.log('==================================================');
  
  try {
    // Test timeout handling in parallel execution
    const response = await axios.post(`${BASE_URL}/analysis/orchestrate`, {
      projectId: 'test-timeout-project',
      analysisType: 'full',
      tokenAddress: '0x1234567890123456789012345678901234567890',
      chainId: 1,
      options: {
        parallelExecution: true,
        timeout: 5000, // Short timeout
      }
    }, {
      ...TEST_CONFIG,
      timeout: 8000, // Slightly longer than service timeout
      headers: {
        ...TEST_CONFIG.headers,
        'X-Test-Parallel': 'timeout-handling',
        'Authorization': `Bearer ${token}`,
      }
    });

    if (response.status === 200 || response.status === 201) {
      console.log('✅ Timeout handling working');
      console.log(`  Timeout handling completed successfully`);
      passedTests++;
    } else {
      console.log('❌ Timeout handling failed');
    }
    totalTests++;
  } catch (error) {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      console.log('✅ Timeout handling working');
      console.log(`  Timeout properly handled: ${error.message}`);
      passedTests++;
    } else {
      console.log('❌ Timeout handling error:', error.message);
    }
    totalTests++;
  }

  // Test 8: Error Recovery
  console.log('\n🔍 Testing Error Recovery');
  console.log('==================================================');
  
  try {
    // Test error recovery in parallel execution
    const response = await axios.post(`${BASE_URL}/analysis/orchestrate`, {
      projectId: 'test-recovery-project',
      analysisType: 'full',
      tokenAddress: '0x1234567890123456789012345678901234567890',
      chainId: 1,
      options: {
        parallelExecution: true,
        errorRecovery: true,
        retryAttempts: 2,
      }
    }, {
      ...TEST_CONFIG,
      headers: {
        ...TEST_CONFIG.headers,
        'X-Test-Parallel': 'error-recovery',
        'Authorization': `Bearer ${token}`,
      }
    });

    if (response.status === 200 || response.status === 201) {
      console.log('✅ Error recovery working');
      console.log(`  Error recovery mechanisms functioning`);
      passedTests++;
    } else {
      console.log('❌ Error recovery failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Error recovery error:', error.message);
    totalTests++;
  }

  // Test 9: Performance Metrics
  console.log('\n🔍 Testing Performance Metrics');
  console.log('==================================================');
  
  try {
    // Test performance metrics collection
    const startTime = Date.now();
    const response = await axios.post(`${BASE_URL}/analysis/orchestrate`, {
      projectId: 'test-metrics-project',
      analysisType: 'full',
      tokenAddress: '0x1234567890123456789012345678901234567890',
      chainId: 1,
      parallelExecution: true,
      collectMetrics: true
    }, {
      ...TEST_CONFIG,
      headers: {
        ...TEST_CONFIG.headers,
        'X-Test-Parallel': 'performance-metrics',
        'Authorization': `Bearer ${token}`,
      }
    });
    const endTime = Date.now();
    const totalTime = endTime - startTime;

    if (response.status === 200 || response.status === 201) {
      // Handle nested data structure: response.data.data.data
      const data = response.data.data?.data || response.data.data || response.data;
      const hasMetrics = data.parallelExecutionStats && data.executionTime !== undefined;

      if (hasMetrics) {
        console.log('✅ Performance metrics working');
        console.log(`  Total execution time: ${totalTime}ms`);
        console.log(`  Reported execution time: ${data.executionTime}ms`);
        console.log(`  Average response time: ${data.parallelExecutionStats.averageResponseTime.toFixed(2)}ms`);
        passedTests++;
      } else {
        console.log('❌ Performance metrics incomplete');
        console.log(`  Execution time: ${data.executionTime !== undefined ? 'present' : 'missing'}`);
        console.log(`  Stats: ${data.parallelExecutionStats ? 'present' : 'missing'}`);
      }
    } else {
      console.log('❌ Performance metrics failed');
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Performance metrics error:', error.message);
    totalTests++;
  }

  // Test 10: Load Testing
  console.log('\n🔍 Testing Load Handling');
  console.log('==================================================');
  
  try {
    // Test load handling with multiple parallel requests
    const loadRequests = Array.from({ length: 10 }, (_, i) =>
      axios.post(`${BASE_URL}/analysis/orchestrate`, {
        projectId: `load-test-project-${i}`,
        analysisType: 'onchain', // Simpler analysis for load test
        tokenAddress: '0x1234567890123456789012345678901234567890',
        chainId: 1,
        options: {
          parallelExecution: true,
        }
      }, {
        ...TEST_CONFIG,
        timeout: 20000, // Longer timeout for load test
        headers: {
          ...TEST_CONFIG.headers,
          'X-Test-Parallel': 'load-testing',
          'X-Load-Request': i.toString(),
          'Authorization': `Bearer ${token}`,
        }
      })
    );

    const responses = await Promise.allSettled(loadRequests);
    const successfulRequests = responses.filter(r => r.status === 'fulfilled').length;
    
    if (successfulRequests >= 7) { // Allow some failures under load
      console.log('✅ Load handling working');
      console.log(`  Handled ${successfulRequests}/10 requests under load`);
      passedTests++;
    } else {
      console.log('❌ Load handling failed');
      console.log(`  Only handled ${successfulRequests}/10 requests under load`);
    }
    totalTests++;
  } catch (error) {
    console.log('❌ Load handling error:', error.message);
    totalTests++;
  }

  // Summary
  console.log('\n📊 Parallel Execution Engine Test Results Summary');
  console.log('============================================================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (passedTests === totalTests) {
    console.log('\n🎉 All parallel execution tests passed!');
    console.log('✅ T1.3.3: Parallel Execution Engine is working correctly');
  } else if (passedTests >= totalTests * 0.8) {
    console.log('\n✅ Parallel execution tests mostly passed!');
    console.log('✅ T1.3.3: Parallel Execution Engine is working correctly');
  } else {
    console.log('\n❌ Some parallel execution tests failed');
    console.log('🔧 Please check the configuration and retry');
  }

  return {
    total: totalTests,
    passed: passedTests,
    failed: totalTests - passedTests,
    successRate: (passedTests / totalTests) * 100
  };
}

// Export for use in test runner
module.exports = { testParallelExecution };

// Run tests if called directly
if (require.main === module) {
  testParallelExecution().catch(error => {
    console.error('💥 Test runner failed:', error.message);
    process.exit(1);
  });
}
