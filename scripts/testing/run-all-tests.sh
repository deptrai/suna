#!/bin/bash

# 🧪 ChainLens Comprehensive Test Runner

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Initialize test results
FAILED_TESTS=()
TOTAL_TESTS=0
PASSED_TESTS=0

# Function to run tests and track results
run_test_suite() {
    local suite_name="$1"
    local command="$2"
    
    log "Running $suite_name..."
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if eval "$command"; then
        log "✅ $suite_name PASSED"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        error "❌ $suite_name FAILED"
        FAILED_TESTS+=("$suite_name")
    fi
    
    echo ""
}

log "🧪 Starting ChainLens Comprehensive Test Suite"
log "=============================================="

# Unit Tests
run_test_suite "Unit Tests" "cd ../tests && npm test -- --testPathPattern=unit"

# Integration Tests
run_test_suite "Integration Tests" "cd ../tests && npm test -- --testPathPattern=integration"

# E2E Tests (if frontend is running)
if curl -s http://localhost:3000 > /dev/null; then
    run_test_suite "E2E Tests" "cd ../tests && npx playwright test"
else
    warn "Frontend not running on localhost:3000, skipping E2E tests"
fi

# Load Tests (basic)
if command -v k6 >/dev/null 2>&1; then
    run_test_suite "Basic Load Test" "k6 run ../tests/load/basic-load.js"
else
    warn "k6 not installed, skipping load tests"
fi

# Security Tests
run_test_suite "Security Vulnerability Scan" "cd ../tests && node security/security-scan.js"

# Generate test report
log "📊 Generating test report..."

cat > "../test-results/summary.json" << EOL
{
  "timestamp": "$(date -Iseconds)",
  "total_tests": $TOTAL_TESTS,
  "passed_tests": $PASSED_TESTS,
  "failed_tests": ${#FAILED_TESTS[@]},
  "success_rate": $(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc -l),
  "failed_test_suites": $(printf '%s\n' "${FAILED_TESTS[@]}" | jq -R . | jq -s .),
  "status": "$([ ${#FAILED_TESTS[@]} -eq 0 ] && echo "PASS" || echo "FAIL")"
}
EOL

# Final summary
log "=============================================="
log "🎯 TEST SUMMARY"
log "Total Test Suites: $TOTAL_TESTS"
log "Passed: $PASSED_TESTS"
log "Failed: ${#FAILED_TESTS[@]}"

if [ ${#FAILED_TESTS[@]} -eq 0 ]; then
    log "🎉 ALL TESTS PASSED! ✅"
    exit 0
else
    error "❌ Some tests failed:"
    for test in "${FAILED_TESTS[@]}"; do
        error "  - $test"
    done
    exit 1
fi
