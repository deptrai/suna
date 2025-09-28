const fs = require('fs');
const path = require('path');

// Import test modules
const { testParallelExecution } = require('./orchestration/parallel-execution.test.js');

// Test configuration
const TEST_SUITES = {
  'T1.3.1a': {
    name: 'HTTP Client Configuration',
    script: '../test-http-client-config.js',
    description: 'Test HTTP client configuration with timeout, retry, and connection management'
  },
  'T1.3.1b': {
    name: 'Service Discovery Setup',
    script: '../test-service-discovery.js',
    description: 'Test service discovery with health checks and load balancing'
  },
  'T1.3.1c': {
    name: 'Request/Response Interceptors',
    script: '../test-interceptors.js',
    description: 'Test logging interceptors, error handling, and metrics collection'
  },
  'T1.3.1d': {
    name: 'Service Client Factory',
    script: '../test-service-client-factory.js',
    description: 'Test dynamic client creation and configuration management'
  },
  'T1.3.2': {
    name: 'Circuit Breaker Implementation',
    script: '../test-circuit-breaker.js',
    description: 'Test circuit breaker pattern with state management and fallback strategies'
  },
  'T1.3.3': {
    name: 'Parallel Execution Engine',
    testFunction: testParallelExecution,
    description: 'Test parallel execution with concurrency control and response aggregation'
  }
};

async function runTestSuite(suiteId, suite) {
  console.log(`\n🧪 Running ${suiteId}: ${suite.name}`);
  console.log(`📝 ${suite.description}`);
  console.log('='.repeat(80));

  try {
    let result;
    
    if (suite.testFunction) {
      // Run test function directly
      result = await suite.testFunction();
    } else if (suite.script) {
      // Run external script
      const { spawn } = require('child_process');
      const scriptPath = path.resolve(__dirname, suite.script);
      
      result = await new Promise((resolve, reject) => {
        const child = spawn('node', [scriptPath], {
          stdio: 'pipe',
          cwd: path.dirname(scriptPath)
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          const output = data.toString();
          stdout += output;
          process.stdout.write(output);
        });

        child.stderr.on('data', (data) => {
          const output = data.toString();
          stderr += output;
          process.stderr.write(output);
        });

        child.on('close', (code) => {
          if (code === 0) {
            // Parse result from stdout
            const successRateMatch = stdout.match(/Success Rate: ([\d.]+)%/);
            const totalMatch = stdout.match(/Total Tests: (\d+)/);
            const passedMatch = stdout.match(/✅ Passed: (\d+)/);
            
            resolve({
              total: totalMatch ? parseInt(totalMatch[1]) : 0,
              passed: passedMatch ? parseInt(passedMatch[1]) : 0,
              failed: 0,
              successRate: successRateMatch ? parseFloat(successRateMatch[1]) : 0
            });
          } else {
            reject(new Error(`Test script exited with code ${code}`));
          }
        });

        child.on('error', reject);
      });
    }

    return {
      suiteId,
      name: suite.name,
      ...result,
      status: result.successRate >= 80 ? 'PASSED' : 'FAILED'
    };
  } catch (error) {
    console.error(`❌ Test suite ${suiteId} failed:`, error.message);
    return {
      suiteId,
      name: suite.name,
      total: 0,
      passed: 0,
      failed: 1,
      successRate: 0,
      status: 'ERROR',
      error: error.message
    };
  }
}

async function runAllTests(suiteFilter = null) {
  console.log('🚀 ChainLens Core - Orchestration Test Runner');
  console.log('============================================================');
  console.log(`📅 Test Run Date: ${new Date().toISOString()}`);
  console.log(`🎯 Test Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Base URL: http://localhost:3006/api/v1`);
  
  const results = [];
  const suitesToRun = suiteFilter 
    ? Object.entries(TEST_SUITES).filter(([id]) => id.includes(suiteFilter))
    : Object.entries(TEST_SUITES);

  console.log(`\n📋 Running ${suitesToRun.length} test suites...\n`);

  for (const [suiteId, suite] of suitesToRun) {
    const result = await runTestSuite(suiteId, suite);
    results.push(result);
    
    // Add spacing between test suites
    console.log('\n' + '='.repeat(80) + '\n');
  }

  // Generate summary report
  generateSummaryReport(results);
  
  // Generate detailed report
  generateDetailedReport(results);

  return results;
}

function generateSummaryReport(results) {
  console.log('📊 TEST SUMMARY REPORT');
  console.log('============================================================');
  
  const totalSuites = results.length;
  const passedSuites = results.filter(r => r.status === 'PASSED').length;
  const failedSuites = results.filter(r => r.status === 'FAILED').length;
  const errorSuites = results.filter(r => r.status === 'ERROR').length;
  
  const totalTests = results.reduce((sum, r) => sum + r.total, 0);
  const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  
  const overallSuccessRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;

  console.log(`\n📈 Overall Statistics:`);
  console.log(`  Total Test Suites: ${totalSuites}`);
  console.log(`  ✅ Passed Suites: ${passedSuites}`);
  console.log(`  ❌ Failed Suites: ${failedSuites}`);
  console.log(`  💥 Error Suites: ${errorSuites}`);
  console.log(`  📊 Suite Success Rate: ${((passedSuites / totalSuites) * 100).toFixed(1)}%`);
  
  console.log(`\n🧪 Test Details:`);
  console.log(`  Total Individual Tests: ${totalTests}`);
  console.log(`  ✅ Passed Tests: ${totalPassed}`);
  console.log(`  ❌ Failed Tests: ${totalFailed}`);
  console.log(`  📊 Overall Success Rate: ${overallSuccessRate.toFixed(1)}%`);

  console.log(`\n📋 Suite Results:`);
  results.forEach(result => {
    const statusIcon = result.status === 'PASSED' ? '✅' : result.status === 'FAILED' ? '❌' : '💥';
    console.log(`  ${statusIcon} ${result.suiteId}: ${result.name} (${result.successRate.toFixed(1)}%)`);
  });

  // Overall assessment
  console.log(`\n🎯 Overall Assessment:`);
  if (overallSuccessRate >= 90) {
    console.log('🎉 EXCELLENT! All systems are functioning optimally.');
  } else if (overallSuccessRate >= 80) {
    console.log('✅ GOOD! Most systems are working correctly with minor issues.');
  } else if (overallSuccessRate >= 60) {
    console.log('⚠️  WARNING! Several systems have issues that need attention.');
  } else {
    console.log('🚨 CRITICAL! Major system failures detected. Immediate action required.');
  }
}

function generateDetailedReport(results) {
  const reportPath = path.join(__dirname, 'reports', `test-report-${Date.now()}.json`);
  
  // Ensure reports directory exists
  const reportsDir = path.dirname(reportPath);
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const report = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    baseUrl: 'http://localhost:3006/api/v1',
    summary: {
      totalSuites: results.length,
      passedSuites: results.filter(r => r.status === 'PASSED').length,
      failedSuites: results.filter(r => r.status === 'FAILED').length,
      errorSuites: results.filter(r => r.status === 'ERROR').length,
      totalTests: results.reduce((sum, r) => sum + r.total, 0),
      totalPassed: results.reduce((sum, r) => sum + r.passed, 0),
      totalFailed: results.reduce((sum, r) => sum + r.failed, 0),
      overallSuccessRate: results.length > 0 
        ? (results.reduce((sum, r) => sum + r.passed, 0) / results.reduce((sum, r) => sum + r.total, 0)) * 100 
        : 0
    },
    results
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const suiteFilter = args[0];

  if (args.includes('--help') || args.includes('-h')) {
    console.log('ChainLens Core Test Runner');
    console.log('Usage: node test-runner.js [suite-filter]');
    console.log('');
    console.log('Available test suites:');
    Object.entries(TEST_SUITES).forEach(([id, suite]) => {
      console.log(`  ${id}: ${suite.name}`);
    });
    console.log('');
    console.log('Examples:');
    console.log('  node test-runner.js              # Run all tests');
    console.log('  node test-runner.js T1.3.1       # Run T1.3.1 tests only');
    console.log('  node test-runner.js T1.3.2       # Run T1.3.2 tests only');
    return;
  }

  try {
    const results = await runAllTests(suiteFilter);
    const overallSuccess = results.every(r => r.status === 'PASSED');
    process.exit(overallSuccess ? 0 : 1);
  } catch (error) {
    console.error('💥 Test runner failed:', error.message);
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = {
  runAllTests,
  runTestSuite,
  TEST_SUITES
};

// Run if called directly
if (require.main === module) {
  main();
}
