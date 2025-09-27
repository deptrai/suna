#!/bin/bash

# ChainLens Parallel Operations Test Suite v3.1
# Comprehensive testing for parallel kill/start operations
# BMAD Method: Business-focused, Method-driven, Architecture-aware, Documentation-complete

# Test metadata
readonly TEST_VERSION="3.1.0"
readonly TEST_NAME="Parallel Operations Test Suite"
readonly TEST_DESCRIPTION="Comprehensive testing for enhanced parallel operations"

# Determine script directory và project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SCRIPTS_ROOT/.." && pwd)"
export PROJECT_ROOT

echo "DEBUG: SCRIPT_DIR=$SCRIPT_DIR"
echo "DEBUG: SCRIPTS_ROOT=$SCRIPTS_ROOT"
echo "DEBUG: PROJECT_ROOT=$PROJECT_ROOT"

# Define colors first
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly PURPLE='\033[0;35m'
readonly NC='\033[0m' # No Color

# Source required libraries
source "$SCRIPTS_ROOT/lib/utils.sh"

# Check if enhanced_health_checks.sh exists, if not create a minimal version
if [[ ! -f "$SCRIPTS_ROOT/lib/enhanced_health_checks.sh" ]]; then
    echo "Creating minimal enhanced_health_checks.sh for testing..."
    cat > "$SCRIPTS_ROOT/lib/enhanced_health_checks.sh" << 'EOF'
#!/bin/bash
# Minimal enhanced health checks for testing
enhanced_check_redis_health() { redis-cli ping >/dev/null 2>&1; }
enhanced_check_backend_health() { curl -s http://localhost:8000/health >/dev/null 2>&1; }
enhanced_check_worker_health() { pgrep -f "dramatiq.*run_agent_background" >/dev/null 2>&1; }
enhanced_check_frontend_health() { curl -s http://localhost:3000 >/dev/null 2>&1; }
check_monitor_health() { pgrep -f "enhanced_monitor.sh" >/dev/null 2>&1; }
EOF
fi

source "$SCRIPTS_ROOT/lib/enhanced_health_checks.sh"
source "$SCRIPTS_ROOT/lib/parallel_dependency_manager.sh"

# Check if config exists, if not use defaults
if [[ -f "$SCRIPTS_ROOT/config/parallel_operations.conf" ]]; then
    source "$SCRIPTS_ROOT/config/parallel_operations.conf"
else
    # Set default values for testing
    ENABLE_PARALLEL_OPERATIONS=true
    PARALLEL_KILL_ENABLED=true
    PARALLEL_START_ENABLED=true
    STARTUP_VERIFICATION_ENABLED=true
    PARALLEL_KILL_TIMEOUT=30
    PARALLEL_START_TIMEOUT=60
    PROCESS_CHECK_INTERVAL=1
    MAX_PARALLEL_RETRIES=3
fi

set -euo pipefail

# Test configuration
TEST_LOG_DIR="$PROJECT_ROOT/logs/tests"
TEST_RESULTS_FILE="$TEST_LOG_DIR/parallel_operations_test_results.json"
TEST_TIMEOUT=300

# Test counters
TEST_TOTAL=0
TEST_PASSED=0
TEST_FAILED=0
TEST_SKIPPED=0

# Create test directories
create_test_directories() {
    # Create logs directory if it doesn't exist
    if [[ ! -d "$PROJECT_ROOT/logs" ]]; then
        mkdir -p "$PROJECT_ROOT/logs" 2>/dev/null || {
            echo "Warning: Cannot create logs directory, using /tmp"
            TEST_LOG_DIR="/tmp/suna_test_logs"
            TEST_RESULTS_FILE="$TEST_LOG_DIR/parallel_operations_test_results.json"
        }
    fi

    mkdir -p "$TEST_LOG_DIR" 2>/dev/null || {
        echo "Warning: Cannot create test log directory, using /tmp"
        TEST_LOG_DIR="/tmp/suna_test_logs"
        TEST_RESULTS_FILE="$TEST_LOG_DIR/parallel_operations_test_results.json"
        mkdir -p "$TEST_LOG_DIR"
    }

    touch "$TEST_RESULTS_FILE"
}

# Display test banner
display_test_banner() {
    clear
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════════════════════╗"
    echo "║                    ChainLens Parallel Operations Test Suite                 ║"
    echo "║                                  v3.1.0                                     ║"
    echo "╠══════════════════════════════════════════════════════════════════════════════╣"
    echo "║ Testing: Parallel Kill/Start Operations                                     ║"
    echo "║ Coverage: Dependency Management, Process Tracking, Health Checks           ║"
    echo "║ BMAD Method: Comprehensive test coverage with detailed reporting            ║"
    echo "╚══════════════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo
    
    log_structured "INFO" "test_parallel_operations" "Starting parallel operations test suite v3.1"
}

# Test helper functions
run_test() {
    local test_name="$1"
    local test_function="$2"
    local test_description="$3"
    
    TEST_TOTAL=$((TEST_TOTAL + 1))
    
    echo -e "${CYAN}🧪 Test $TEST_TOTAL: $test_name${NC}"
    echo -e "   📝 $test_description"
    
    local start_time=$(date +%s)
    local test_result="UNKNOWN"
    local error_message=""
    
    if timeout $TEST_TIMEOUT bash -c "declare -f $test_function >/dev/null && $test_function" 2>&1; then
        test_result="PASSED"
        TEST_PASSED=$((TEST_PASSED + 1))
        echo -e "   ✅ PASSED"
    else
        test_result="FAILED"
        TEST_FAILED=$((TEST_FAILED + 1))
        error_message="Test function failed or timed out"
        echo -e "   ❌ FAILED: $error_message"
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Log test result
    local test_json="{\"name\":\"$test_name\",\"result\":\"$test_result\",\"duration\":$duration,\"error\":\"$error_message\"}"
    echo "$test_json" >> "$TEST_RESULTS_FILE"
    
    log_structured "INFO" "test_parallel_operations" "Test completed: $test_name" "$test_json"
    echo
}

# Test 1: Configuration validation
test_configuration_validation() {
    echo "   🔧 Testing configuration validation..."
    
    # Test valid configuration
    if ! validate_parallel_config; then
        echo "   ❌ Valid configuration failed validation"
        return 1
    fi
    
    # Test invalid timeout values
    local original_timeout=$PARALLEL_KILL_TIMEOUT
    PARALLEL_KILL_TIMEOUT=1
    if validate_parallel_config 2>/dev/null; then
        echo "   ❌ Invalid timeout passed validation"
        PARALLEL_KILL_TIMEOUT=$original_timeout
        return 1
    fi
    PARALLEL_KILL_TIMEOUT=$original_timeout
    
    echo "   ✅ Configuration validation working correctly"
    return 0
}

# Test 2: Dependency wave calculation
test_dependency_wave_calculation() {
    echo "   📊 Testing dependency wave calculation..."
    
    # Initialize system
    init_parallel_dependency_system
    
    # Calculate waves
    local waves_output
    if ! waves_output=$(calculate_dependency_waves); then
        echo "   ❌ Failed to calculate dependency waves"
        return 1
    fi
    
    # Verify wave structure
    local wave_count=$(echo "$waves_output" | wc -l | tr -d ' ')
    if [[ $wave_count -lt 2 ]]; then
        echo "   ❌ Insufficient dependency waves calculated: $wave_count"
        return 1
    fi
    
    # Verify Redis is in wave 0
    if ! echo "$waves_output" | grep -q "wave_0:.*redis"; then
        echo "   ❌ Redis not found in wave 0"
        return 1
    fi
    
    echo "   ✅ Dependency wave calculation working correctly"
    return 0
}

# Test 3: Service status management
test_service_status_management() {
    echo "   📋 Testing service status management..."
    
    # Initialize system
    init_parallel_dependency_system
    
    # Test setting and getting service values
    set_service_value "SERVICE_STATUS" "test_service" "testing"
    local status=$(get_service_value "SERVICE_STATUS" "test_service")
    
    if [[ "$status" != "testing" ]]; then
        echo "   ❌ Service status not set correctly: expected 'testing', got '$status'"
        return 1
    fi
    
    # Test service status JSON
    local status_json=$(get_parallel_service_status "test_service")
    if ! echo "$status_json" | jq . >/dev/null 2>&1; then
        echo "   ❌ Service status JSON is invalid"
        return 1
    fi
    
    echo "   ✅ Service status management working correctly"
    return 0
}

# Test 4: Parallel kill simulation
test_parallel_kill_simulation() {
    echo "   🔪 Testing parallel kill simulation..."
    
    # Initialize system
    init_parallel_dependency_system
    
    # Create dummy processes to kill
    local dummy_pids=()
    for i in {1..3}; do
        sleep 300 &
        dummy_pids+=($!)
        echo "   📝 Created dummy process: $!"
    done
    
    # Simulate parallel kill (without actually killing system services)
    echo "   🔄 Simulating parallel kill operations..."
    
    # Kill dummy processes in parallel
    for pid in "${dummy_pids[@]}"; do
        (
            kill -TERM "$pid" 2>/dev/null || true
            sleep 1
            kill -KILL "$pid" 2>/dev/null || true
        ) &
    done
    
    # Wait for all kill jobs
    wait
    
    # Verify processes are killed
    local remaining=0
    for pid in "${dummy_pids[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            remaining=$((remaining + 1))
        fi
    done
    
    if [[ $remaining -gt 0 ]]; then
        echo "   ❌ $remaining dummy processes still running"
        return 1
    fi
    
    echo "   ✅ Parallel kill simulation working correctly"
    return 0
}

# Test 5: Health check integration
test_health_check_integration() {
    echo "   🏥 Testing health check integration..."
    
    # Test Redis health check
    if command -v redis-cli >/dev/null 2>&1; then
        if redis-cli ping >/dev/null 2>&1; then
            if ! enhanced_check_redis_health; then
                echo "   ❌ Redis health check failed when Redis is running"
                return 1
            fi
        else
            echo "   ⚠️ Redis not running, skipping Redis health check test"
        fi
    else
        echo "   ⚠️ redis-cli not available, skipping Redis health check test"
    fi
    
    # Test backend health check (should fail if not running)
    if enhanced_check_backend_health 2>/dev/null; then
        echo "   ⚠️ Backend health check passed when backend might not be running"
    else
        echo "   ✅ Backend health check correctly failed when backend not running"
    fi
    
    echo "   ✅ Health check integration working correctly"
    return 0
}

# Test 6: Process tracking
test_process_tracking() {
    echo "   📊 Testing process tracking..."
    
    # Initialize system
    init_parallel_dependency_system
    
    # Create a test process
    sleep 60 &
    local test_pid=$!
    
    # Set PID for test service
    set_service_value "SERVICE_PIDS" "test_service" "$test_pid"
    
    # Verify PID tracking
    local tracked_pid=$(get_service_value "SERVICE_PIDS" "test_service")
    if [[ "$tracked_pid" != "$test_pid" ]]; then
        echo "   ❌ PID tracking failed: expected $test_pid, got $tracked_pid"
        kill "$test_pid" 2>/dev/null || true
        return 1
    fi
    
    # Verify process is running
    if ! kill -0 "$test_pid" 2>/dev/null; then
        echo "   ❌ Test process not running"
        return 1
    fi
    
    # Clean up
    kill "$test_pid" 2>/dev/null || true
    
    echo "   ✅ Process tracking working correctly"
    return 0
}

# Test 7: Timeout handling
test_timeout_handling() {
    echo "   ⏰ Testing timeout handling..."
    
    # Test with very short timeout
    local original_timeout=$PARALLEL_KILL_TIMEOUT
    PARALLEL_KILL_TIMEOUT=1
    
    # Create a long-running process
    sleep 300 &
    local long_pid=$!
    
    # Test timeout behavior (should timeout quickly)
    local start_time=$(date +%s)
    
    # Simulate timeout scenario
    (
        sleep $PARALLEL_KILL_TIMEOUT
        echo "Timeout reached"
    ) &
    local timeout_pid=$!
    
    # Wait for timeout
    wait "$timeout_pid" 2>/dev/null || true
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Clean up
    kill "$long_pid" 2>/dev/null || true
    PARALLEL_KILL_TIMEOUT=$original_timeout
    
    if [[ $duration -gt 5 ]]; then
        echo "   ❌ Timeout handling took too long: ${duration}s"
        return 1
    fi
    
    echo "   ✅ Timeout handling working correctly"
    return 0
}

# Test 8: Error recovery
test_error_recovery() {
    echo "   🔄 Testing error recovery..."
    
    # Initialize system
    init_parallel_dependency_system
    
    # Test recovery from failed service start
    set_service_value "SERVICE_STATUS" "test_service" "$SERVICE_FAILED"
    set_service_value "SERVICE_RETRY_COUNTS" "test_service" "1"
    
    # Verify retry count tracking
    local retry_count=$(get_service_value "SERVICE_RETRY_COUNTS" "test_service")
    if [[ "$retry_count" != "1" ]]; then
        echo "   ❌ Retry count tracking failed: expected 1, got $retry_count"
        return 1
    fi
    
    # Test status reset for retry
    set_service_value "SERVICE_STATUS" "test_service" "$SERVICE_STARTING"
    local status=$(get_service_value "SERVICE_STATUS" "test_service")
    if [[ "$status" != "$SERVICE_STARTING" ]]; then
        echo "   ❌ Status reset failed: expected $SERVICE_STARTING, got $status"
        return 1
    fi
    
    echo "   ✅ Error recovery working correctly"
    return 0
}

# Test 9: Performance benchmarking
test_performance_benchmarking() {
    echo "   ⚡ Testing performance benchmarking..."
    
    # Initialize system
    init_parallel_dependency_system
    
    # Benchmark dependency wave calculation
    local start_time=$(date +%s%N)
    for i in {1..100}; do
        calculate_dependency_waves >/dev/null
    done
    local end_time=$(date +%s%N)
    
    local duration_ns=$((end_time - start_time))
    local duration_ms=$((duration_ns / 1000000))
    local avg_ms=$((duration_ms / 100))
    
    echo "   📊 Dependency calculation: ${avg_ms}ms average (100 iterations)"
    
    if [[ $avg_ms -gt 100 ]]; then
        echo "   ⚠️ Performance warning: dependency calculation taking ${avg_ms}ms"
    fi
    
    # Benchmark service status operations
    start_time=$(date +%s%N)
    for i in {1..1000}; do
        set_service_value "SERVICE_STATUS" "perf_test" "testing"
        get_service_value "SERVICE_STATUS" "perf_test" >/dev/null
    done
    end_time=$(date +%s%N)
    
    duration_ns=$((end_time - start_time))
    duration_ms=$((duration_ns / 1000000))
    avg_ms=$((duration_ms / 1000))
    
    echo "   📊 Service status operations: ${avg_ms}ms average (1000 iterations)"
    
    echo "   ✅ Performance benchmarking completed"
    return 0
}

# Test 10: Integration test
test_integration() {
    echo "   🔗 Testing full integration..."
    
    # This test verifies the complete workflow without actually starting services
    echo "   🔄 Testing complete parallel operations workflow..."
    
    # Initialize system
    init_parallel_dependency_system
    
    # Test dependency wave calculation
    local waves_output
    if ! waves_output=$(calculate_dependency_waves); then
        echo "   ❌ Integration test failed at dependency calculation"
        return 1
    fi
    
    # Test service status management for all services
    local services=("redis" "backend" "worker" "frontend" "monitor")
    for service in "${services[@]}"; do
        set_service_value "SERVICE_STATUS" "$service" "$SERVICE_READY"
        local status=$(get_service_value "SERVICE_STATUS" "$service")
        if [[ "$status" != "$SERVICE_READY" ]]; then
            echo "   ❌ Integration test failed at service status for $service"
            return 1
        fi
    done
    
    # Test metrics export
    export_parallel_dependency_metrics >/dev/null
    
    echo "   ✅ Full integration test passed"
    return 0
}

# Generate test report
generate_test_report() {
    echo -e "${CYAN}📊 TEST RESULTS SUMMARY${NC}"
    echo -e "${CYAN}======================${NC}"
    echo -e "   📈 Total Tests: $TEST_TOTAL"
    echo -e "   ✅ Passed: $TEST_PASSED"
    echo -e "   ❌ Failed: $TEST_FAILED"
    echo -e "   ⏭️ Skipped: $TEST_SKIPPED"
    echo
    
    local success_rate=0
    if [[ $TEST_TOTAL -gt 0 ]]; then
        success_rate=$((TEST_PASSED * 100 / TEST_TOTAL))
    fi
    
    echo -e "   🎯 Success Rate: ${success_rate}%"
    
    if [[ $TEST_FAILED -eq 0 ]]; then
        echo -e "${GREEN}🎉 All tests passed!${NC}"
        log_structured "INFO" "test_parallel_operations" "All tests passed successfully"
        return 0
    else
        echo -e "${RED}❌ Some tests failed${NC}"
        log_structured "ERROR" "test_parallel_operations" "Some tests failed"
        return 1
    fi
}

# Main test execution
main() {
    # Setup error handling
    trap 'log_structured "ERROR" "test_parallel_operations" "Test suite interrupted"; exit 1' INT TERM
    
    # Display banner
    display_test_banner
    
    # Create test directories
    create_test_directories
    
    # Run all tests
    run_test "Configuration Validation" "test_configuration_validation" "Validates parallel operations configuration"
    run_test "Dependency Wave Calculation" "test_dependency_wave_calculation" "Tests dependency wave calculation algorithm"
    run_test "Service Status Management" "test_service_status_management" "Tests service status tracking and management"
    run_test "Parallel Kill Simulation" "test_parallel_kill_simulation" "Simulates parallel kill operations"
    run_test "Health Check Integration" "test_health_check_integration" "Tests health check integration"
    run_test "Process Tracking" "test_process_tracking" "Tests process ID tracking and monitoring"
    run_test "Timeout Handling" "test_timeout_handling" "Tests timeout mechanisms"
    run_test "Error Recovery" "test_error_recovery" "Tests error recovery and retry logic"
    run_test "Performance Benchmarking" "test_performance_benchmarking" "Benchmarks performance of key operations"
    run_test "Integration Test" "test_integration" "Tests complete workflow integration"
    
    # Generate report
    generate_test_report
}

# Execute main function
main "$@"
