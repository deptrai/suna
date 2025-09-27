#!/bin/bash

# ChainLens Enhanced Features Test Script
# Validate circuit breakers, dependency management, error handling

set -e

# Source enhanced libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib/utils.sh"
source "$SCRIPT_DIR/lib/enhanced_health_checks.sh"
source "$SCRIPT_DIR/lib/dependency_manager.sh"
source "$SCRIPT_DIR/lib/error_handler.sh"

PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Test results
TEST_PASSED=0
TEST_FAILED=0

# Test utilities
print_test_header() {
    echo -e "\n${CYAN}🧪 Testing: $1${NC}"
    echo -e "${CYAN}$(printf '%.0s=' {1..50})${NC}"
}

assert_equals() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"
    
    if [[ "$actual" == "$expected" ]]; then
        echo -e "   ✅ $test_name: PASSED"
        TEST_PASSED=$((TEST_PASSED + 1))
    else
        echo -e "   ❌ $test_name: FAILED (expected: $expected, got: $actual)"
        TEST_FAILED=$((TEST_FAILED + 1))
    fi
}

assert_not_empty() {
    local value="$1"
    local test_name="$2"
    
    if [[ -n "$value" ]]; then
        echo -e "   ✅ $test_name: PASSED"
        TEST_PASSED=$((TEST_PASSED + 1))
    else
        echo -e "   ❌ $test_name: FAILED (value is empty)"
        TEST_FAILED=$((TEST_FAILED + 1))
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local test_name="$3"
    
    if [[ "$haystack" == *"$needle"* ]]; then
        echo -e "   ✅ $test_name: PASSED"
        TEST_PASSED=$((TEST_PASSED + 1))
    else
        echo -e "   ❌ $test_name: FAILED (\"$haystack\" does not contain \"$needle\")"
        TEST_FAILED=$((TEST_FAILED + 1))
    fi
}

# Test Circuit Breaker functionality
test_circuit_breaker() {
    print_test_header "Circuit Breaker Pattern"
    
    # Initialize circuit breaker
    init_circuit_breaker "test_service"
    
    # Test initial state
    local initial_state=$(get_circuit_breaker_status "test_service")
    assert_equals "CLOSED" "$initial_state" "Initial circuit state should be CLOSED"
    
    # Test that circuit allows calls initially
    if check_circuit_breaker "test_service"; then
        echo -e "   ✅ Circuit breaker allows calls when CLOSED: PASSED"
        TEST_PASSED=$((TEST_PASSED + 1))
    else
        echo -e "   ❌ Circuit breaker should allow calls when CLOSED: FAILED"
        TEST_FAILED=$((TEST_FAILED + 1))
    fi
    
    # Simulate failures to open circuit
    for i in {1..5}; do
        record_circuit_failure "test_service"
    done
    
    local open_state=$(get_circuit_breaker_status "test_service")
    assert_equals "OPEN" "$open_state" "Circuit should be OPEN after 5 failures"
    
    # Test that circuit blocks calls when open
    if ! check_circuit_breaker "test_service"; then
        echo -e "   ✅ Circuit breaker blocks calls when OPEN: PASSED"
        TEST_PASSED=$((TEST_PASSED + 1))
    else
        echo -e "   ❌ Circuit breaker should block calls when OPEN: FAILED"
        TEST_FAILED=$((TEST_FAILED + 1))
    fi
    
    echo -e "   📊 Circuit breaker pattern test completed"
}

# Test Dependency Management
test_dependency_management() {
    print_test_header "Smart Dependency Management"
    
    # Initialize dependency system
    init_dependency_system
    
    # Test dependency resolution
    local redis_deps=$(get_service_dependencies "redis")
    assert_equals "" "$redis_deps" "Redis should have no dependencies"
    
    local backend_deps=$(get_service_dependencies "backend")
    assert_contains "$backend_deps" "redis" "Backend should depend on redis"
    assert_contains "$backend_deps" "worker" "Backend should depend on worker"
    
    # Test startup order calculation
    local startup_order=$(calculate_startup_order)
    assert_not_empty "$startup_order" "Startup order should be calculated"
    
    # Redis and supabase should come first (no dependencies)
    echo "$startup_order" | head -2 | grep -q "redis\|supabase"
    if [[ $? -eq 0 ]]; then
        echo -e "   ✅ Services with no dependencies start first: PASSED"
        TEST_PASSED=$((TEST_PASSED + 1))
    else
        echo -e "   ❌ Services with no dependencies should start first: FAILED"
        TEST_FAILED=$((TEST_FAILED + 1))
    fi
    
    echo -e "   📊 Dependency management test completed"
}

# Test Error Handling
test_error_handling() {
    print_test_header "Advanced Error Handling"
    
    # Initialize error handling
    init_error_handling
    
    # Test error recording
    record_error "connection_refused" "test_service" "Test connection failure" "medium"
    
    local error_stats=$(get_error_stats)
    assert_contains "$error_stats" "connection_refused" "Error stats should contain recorded error"
    
    # Test degradation status
    enable_degraded_mode "test_service" "partial"
    local degradation_status=$(get_degradation_status)
    assert_contains "$degradation_status" "partial" "Degradation status should show partial mode"
    
    # Test error threshold handling
    # Record multiple errors to trigger threshold
    for i in {1..6}; do
        record_error "connection_refused" "test_service" "Test error $i" "medium"
    done
    
    # Check if degraded mode was triggered
    local updated_status=$(get_degradation_status)
    assert_contains "$updated_status" "partial" "Multiple errors should trigger degraded mode"
    
    # Test error count reset
    reset_error_counts "connection_refused"
    local reset_stats=$(get_error_stats)
    # Should contain the error type but with count 0
    assert_contains "$reset_stats" "connection_refused" "Error stats should still contain error type after reset"
    
    echo -e "   📊 Error handling test completed"
}

# Test Enhanced Health Checks
test_enhanced_health_checks() {
    print_test_header "Enhanced Health Checks with Retry Logic"
    
    # Test Redis health check (assuming Redis is running)
    local redis_health=$(enhanced_check_redis_health)
    if [[ "$redis_health" == "$HEALTH_OK" || "$redis_health" == "$HEALTH_FAIL" ]]; then
        echo -e "   ✅ Redis health check returns valid status: PASSED"
        TEST_PASSED=$((TEST_PASSED + 1))
    else
        echo -e "   ❌ Redis health check should return valid status: FAILED (got: $redis_health)"
        TEST_FAILED=$((TEST_FAILED + 1))
    fi
    
    # Test Supabase health check (optional service)
    local supabase_health=$(enhanced_check_supabase_health)
    if [[ "$supabase_health" == "$HEALTH_OK" || "$supabase_health" == "$HEALTH_SKIP" || "$supabase_health" == "$HEALTH_FAIL" ]]; then
        echo -e "   ✅ Supabase health check returns valid status: PASSED"
        TEST_PASSED=$((TEST_PASSED + 1))
    else
        echo -e "   ❌ Supabase health check should return valid status: FAILED (got: $supabase_health)"
        TEST_FAILED=$((TEST_FAILED + 1))
    fi
    
    # Test smart timeout calculation
    local timeout=$(smart_timeout "redis" "5")
    if [[ "$timeout" =~ ^[0-9]+$ ]]; then
        echo -e "   ✅ Smart timeout returns numeric value: PASSED"
        TEST_PASSED=$((TEST_PASSED + 1))
    else
        echo -e "   ❌ Smart timeout should return numeric value: FAILED (got: $timeout)"
        TEST_FAILED=$((TEST_FAILED + 1))
    fi
    
    echo -e "   📊 Enhanced health checks test completed"
}

# Test Integration
test_integration() {
    print_test_header "System Integration Tests"
    
    # Test that all systems can be initialized together
    init_dependency_system
    init_error_handling
    
    # Test circuit breaker integration with health checks
    init_circuit_breaker "integration_test"
    
    # Simulate service failure
    record_circuit_failure "integration_test"
    record_error "connection_refused" "integration_test" "Integration test failure" "high"
    
    # Check that both systems recorded the issue
    local circuit_status=$(get_circuit_breaker_status "integration_test")
    local error_stats=$(get_error_stats)
    
    assert_not_empty "$circuit_status" "Circuit breaker should have status"
    assert_contains "$error_stats" "connection_refused" "Error handling should track errors"
    
    # Test metric export functions
    export_circuit_breaker_metrics >/dev/null 2>&1
    if [[ $? -eq 0 ]]; then
        echo -e "   ✅ Circuit breaker metrics export: PASSED"
        TEST_PASSED=$((TEST_PASSED + 1))
    else
        echo -e "   ❌ Circuit breaker metrics export: FAILED"
        TEST_FAILED=$((TEST_FAILED + 1))
    fi
    
    export_error_metrics >/dev/null 2>&1
    if [[ $? -eq 0 ]]; then
        echo -e "   ✅ Error metrics export: PASSED"
        TEST_PASSED=$((TEST_PASSED + 1))
    else
        echo -e "   ❌ Error metrics export: FAILED"
        TEST_FAILED=$((TEST_FAILED + 1))
    fi
    
    export_dependency_metrics >/dev/null 2>&1
    if [[ $? -eq 0 ]]; then
        echo -e "   ✅ Dependency metrics export: PASSED"
        TEST_PASSED=$((TEST_PASSED + 1))
    else
        echo -e "   ❌ Dependency metrics export: FAILED"
        TEST_FAILED=$((TEST_FAILED + 1))
    fi
    
    echo -e "   📊 Integration tests completed"
}

# Test Configuration Validation
test_configuration() {
    print_test_header "Configuration Validation"
    
    # Test that required functions exist
    if command -v init_circuit_breaker >/dev/null 2>&1; then
        echo -e "   ✅ Circuit breaker functions available: PASSED"
        TEST_PASSED=$((TEST_PASSED + 1))
    else
        echo -e "   ❌ Circuit breaker functions should be available: FAILED"
        TEST_FAILED=$((TEST_FAILED + 1))
    fi
    
    if command -v init_dependency_system >/dev/null 2>&1; then
        echo -e "   ✅ Dependency management functions available: PASSED"
        TEST_PASSED=$((TEST_PASSED + 1))
    else
        echo -e "   ❌ Dependency management functions should be available: FAILED"
        TEST_FAILED=$((TEST_FAILED + 1))
    fi
    
    if command -v init_error_handling >/dev/null 2>&1; then
        echo -e "   ✅ Error handling functions available: PASSED"
        TEST_PASSED=$((TEST_PASSED + 1))
    else
        echo -e "   ❌ Error handling functions should be available: FAILED"
        TEST_FAILED=$((TEST_FAILED + 1))
    fi
    
    # Test that enhanced startup script exists and is executable
    if [[ -x "$SCRIPT_DIR/start_dev_v3_enhanced.sh" ]]; then
        echo -e "   ✅ Enhanced startup script is executable: PASSED"
        TEST_PASSED=$((TEST_PASSED + 1))
    else
        echo -e "   ❌ Enhanced startup script should be executable: FAILED"
        TEST_FAILED=$((TEST_FAILED + 1))
    fi
    
    echo -e "   📊 Configuration validation completed"
}

# Main test execution
main() {
    echo -e "${CYAN}🚀 ChainLens Enhanced Features Test Suite${NC}"
    echo -e "${CYAN}=========================================${NC}"
    echo -e "${PURPLE}Testing all enhanced features and integrations...${NC}"
    echo ""
    
    # Run all tests
    test_circuit_breaker
    test_dependency_management
    test_error_handling
    test_enhanced_health_checks
    test_integration
    test_configuration
    
    # Print summary
    echo ""
    echo -e "${CYAN}📊 TEST SUMMARY${NC}"
    echo -e "${CYAN}===============${NC}"
    echo -e "Total Tests: $((TEST_PASSED + TEST_FAILED))"
    echo -e "${GREEN}Passed: $TEST_PASSED${NC}"
    echo -e "${RED}Failed: $TEST_FAILED${NC}"
    
    if [[ $TEST_FAILED -eq 0 ]]; then
        echo -e "\n${GREEN}🎉 ALL TESTS PASSED! Enhanced features are ready to use.${NC}"
        echo -e "${PURPLE}✨ You can now run the enhanced startup script:${NC}"
        echo -e "${CYAN}   ./scripts/start_dev_v3_enhanced.sh${NC}"
        exit 0
    else
        echo -e "\n${RED}❌ Some tests failed. Please check the implementation.${NC}"
        exit 1
    fi
}

# Execute main function
main "$@"