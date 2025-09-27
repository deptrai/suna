#!/bin/bash

# Redis Sentinel Cluster Setup and Testing Script
# Architect Review Approved - Story 1.3 Task 1.1.3
# Usage: ./scripts/setup-redis-sentinel.sh [start|stop|test|status]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKER_COMPOSE_FILE="$PROJECT_ROOT/docker-compose.sentinel.yml"
LOG_FILE="$PROJECT_ROOT/logs/redis-sentinel-setup.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_info() {
    log "${BLUE}[INFO]${NC} $1"
}

log_success() {
    log "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    log "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    log "${RED}[ERROR]${NC} $1"
}

# Create logs directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

# Function to check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    log_info "Docker is running ✓"
}

# Function to start Redis Sentinel cluster
start_sentinel_cluster() {
    log_info "Starting Redis Sentinel cluster..."
    
    # Stop any existing containers
    stop_sentinel_cluster
    
    # Start the cluster
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
    
    log_info "Waiting for containers to start..."
    sleep 10
    
    # Wait for services to be ready
    wait_for_services
    
    log_success "Redis Sentinel cluster started successfully"
}

# Function to stop Redis Sentinel cluster
stop_sentinel_cluster() {
    log_info "Stopping Redis Sentinel cluster..."
    
    docker-compose -f "$DOCKER_COMPOSE_FILE" down -v 2>/dev/null || true
    
    # Clean up orphaned containers
    docker container prune -f >/dev/null 2>&1 || true
    
    log_success "Redis Sentinel cluster stopped"
}

# Function to wait for services to be ready
wait_for_services() {
    local max_attempts=30
    local attempt=1
    
    log_info "Waiting for Redis master to be ready..."
    while [ $attempt -le $max_attempts ]; do
        if docker exec chainlens-redis-master redis-cli ping >/dev/null 2>&1; then
            log_success "Redis master is ready"
            break
        fi
        
        log_info "Attempt $attempt/$max_attempts - waiting for Redis master..."
        sleep 2
        ((attempt++))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        log_error "Redis master failed to start within expected time"
        return 1
    fi
    
    # Wait for sentinels
    log_info "Waiting for Sentinels to be ready..."
    sleep 5
    
    for sentinel_port in 26379 26380 26381; do
        attempt=1
        while [ $attempt -le $max_attempts ]; do
            if docker exec "chainlens-sentinel-$(((sentinel_port - 26379) + 1))" redis-cli -p 26379 ping >/dev/null 2>&1; then
                log_success "Sentinel on port $sentinel_port is ready"
                break
            fi
            
            log_info "Attempt $attempt/$max_attempts - waiting for Sentinel on port $sentinel_port..."
            sleep 2
            ((attempt++))
        done
        
        if [ $attempt -gt $max_attempts ]; then
            log_warning "Sentinel on port $sentinel_port failed to start within expected time"
        fi
    done
}

# Function to test Redis Sentinel cluster
test_sentinel_cluster() {
    log_info "Testing Redis Sentinel cluster functionality..."
    
    # Test Redis master connectivity
    log_info "Testing Redis master connectivity..."
    if docker exec chainlens-redis-master redis-cli ping | grep -q "PONG"; then
        log_success "✓ Redis master connectivity test passed"
    else
        log_error "✗ Redis master connectivity test failed"
        return 1
    fi
    
    # Test replica connectivity
    log_info "Testing replica connectivity..."
    for replica_num in 1 2; do
        if docker exec "chainlens-redis-replica-$replica_num" redis-cli ping | grep -q "PONG"; then
            log_success "✓ Redis replica-$replica_num connectivity test passed"
        else
            log_warning "✗ Redis replica-$replica_num connectivity test failed"
        fi
    done
    
    # Test Sentinel connectivity
    log_info "Testing Sentinel connectivity..."
    for sentinel_num in 1 2 3; do
        if docker exec "chainlens-sentinel-$sentinel_num" redis-cli -p 26379 ping | grep -q "PONG"; then
            log_success "✓ Sentinel-$sentinel_num connectivity test passed"
        else
            log_warning "✗ Sentinel-$sentinel_num connectivity test failed"
        fi
    done
    
    # Test master discovery through Sentinel
    log_info "Testing master discovery through Sentinel..."
    master_addr=$(docker exec chainlens-sentinel-1 redis-cli -p 26379 SENTINEL get-master-addr-by-name chainlens-circuits 2>/dev/null || echo "")
    if [ -n "$master_addr" ]; then
        log_success "✓ Master discovery test passed: $master_addr"
    else
        log_warning "✗ Master discovery test failed"
    fi
    
    # Test data persistence
    log_info "Testing data persistence..."
    test_key="test:circuit:$(date +%s)"
    test_value="circuit_state_test_$(date +%s)"
    
    if docker exec chainlens-redis-master redis-cli set "$test_key" "$test_value" | grep -q "OK"; then
        log_success "✓ Data write test passed"
        
        # Read from replica after short delay
        sleep 2
        read_value=$(docker exec chainlens-redis-replica-1 redis-cli get "$test_key" 2>/dev/null || echo "")
        if [ "$read_value" = "$test_value" ]; then
            log_success "✓ Data replication test passed"
        else
            log_warning "✗ Data replication test failed (expected: $test_value, got: $read_value)"
        fi
        
        # Cleanup test data
        docker exec chainlens-redis-master redis-cli del "$test_key" >/dev/null 2>&1
    else
        log_error "✗ Data write test failed"
    fi
    
    # Test Sentinel monitoring
    log_info "Testing Sentinel monitoring..."
    sentinel_info=$(docker exec chainlens-sentinel-1 redis-cli -p 26379 SENTINEL masters 2>/dev/null || echo "")
    if echo "$sentinel_info" | grep -q "chainlens-circuits"; then
        log_success "✓ Sentinel monitoring test passed"
    else
        log_warning "✗ Sentinel monitoring test failed"
    fi
    
    log_success "Redis Sentinel cluster testing completed"
}

# Function to show cluster status
show_cluster_status() {
    log_info "Redis Sentinel Cluster Status"
    echo "="*50
    
    # Check if containers are running
    containers=("chainlens-redis-master" "chainlens-redis-replica-1" "chainlens-redis-replica-2" "chainlens-sentinel-1" "chainlens-sentinel-2" "chainlens-sentinel-3")
    
    for container in "${containers[@]}"; do
        if docker ps --format "table {{.Names}}" | grep -q "^$container$"; then
            status="${GREEN}RUNNING${NC}"
            # Get container health
            uptime=$(docker ps --format "table {{.Names}}\t{{.Status}}" | grep "$container" | awk '{print $2, $3, $4}')
            log_info "$container: $status ($uptime)"
        else
            status="${RED}STOPPED${NC}"
            log_info "$container: $status"
        fi
    done
    
    echo "="*50
    
    # Show network connectivity if cluster is running
    if docker ps --format "table {{.Names}}" | grep -q "chainlens-redis-master"; then
        log_info "Network Connectivity:"
        
        # Master status
        master_info=$(docker exec chainlens-redis-master redis-cli info replication 2>/dev/null | grep -E "role:|connected_slaves:" || echo "unavailable")
        log_info "Master: $master_info"
        
        # Sentinel status
        for i in 1 2 3; do
            sentinel_info=$(docker exec "chainlens-sentinel-$i" redis-cli -p 26379 SENTINEL masters 2>/dev/null | head -20 | grep -E "name|ip|port|flags" || echo "unavailable")
            if [ "$sentinel_info" != "unavailable" ]; then
                log_info "Sentinel-$i: monitoring active"
            else
                log_warning "Sentinel-$i: monitoring unavailable"
            fi
        done
    fi
}

# Function to run Circuit Breaker integration tests
run_integration_tests() {
    log_info "Running Circuit Breaker integration tests..."
    
    cd "$PROJECT_ROOT"
    
    # Check if test dependencies are available
    if [ -f "package.json" ] && [ -d "node_modules" ]; then
        log_info "Running Jest integration tests..."
        if pnpm test:integration --testNamePattern="Redis Sentinel" --verbose; then
            log_success "Integration tests passed ✓"
        else
            log_warning "Some integration tests failed - check logs for details"
        fi
    else
        log_warning "Node.js dependencies not found - skipping Jest tests"
    fi
    
    # Basic connectivity test as fallback
    log_info "Running basic connectivity verification..."
    test_sentinel_cluster
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [start|stop|test|status|integration]"
    echo ""
    echo "Commands:"
    echo "  start       - Start Redis Sentinel cluster"
    echo "  stop        - Stop Redis Sentinel cluster"
    echo "  test        - Test cluster functionality"
    echo "  status      - Show cluster status"
    echo "  integration - Run Circuit Breaker integration tests"
    echo ""
    echo "Examples:"
    echo "  $0 start     # Start the cluster"
    echo "  $0 test      # Test cluster after starting"
    echo "  $0 status    # Check current status"
    echo "  $0 stop      # Stop the cluster"
}

# Main execution
main() {
    local command=${1:-""}
    
    case "$command" in
        "start")
            check_docker
            start_sentinel_cluster
            ;;
        "stop")
            check_docker
            stop_sentinel_cluster
            ;;
        "test")
            check_docker
            test_sentinel_cluster
            ;;
        "status")
            check_docker
            show_cluster_status
            ;;
        "integration")
            check_docker
            run_integration_tests
            ;;
        "restart")
            check_docker
            stop_sentinel_cluster
            sleep 2
            start_sentinel_cluster
            ;;
        "")
            show_usage
            exit 1
            ;;
        *)
            log_error "Unknown command: $command"
            show_usage
            exit 1
            ;;
    esac
}

# Trap for cleanup on script exit
trap 'log_info "Script execution completed"' EXIT

# Execute main function with all arguments
main "$@"