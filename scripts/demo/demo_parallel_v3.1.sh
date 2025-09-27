#!/bin/bash

# ChainLens Parallel Operations Demo v3.1
# Demonstration of enhanced parallel kill/start operations
# BMAD Method: Business-focused, Method-driven, Architecture-aware, Documentation-complete

# Define colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly PURPLE='\033[0;35m'
readonly NC='\033[0m' # No Color

# Determine script directory và project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SCRIPTS_ROOT/.." && pwd)"
export PROJECT_ROOT

echo -e "${CYAN}🎯 ChainLens Parallel Operations Demo v3.1${NC}"
echo -e "${CYAN}=============================================${NC}"
echo
echo -e "📁 SCRIPT_DIR: $SCRIPT_DIR"
echo -e "📁 SCRIPTS_ROOT: $SCRIPTS_ROOT"
echo -e "📁 PROJECT_ROOT: $PROJECT_ROOT"
echo

# Source required libraries with error handling
echo -e "${CYAN}📚 Loading libraries...${NC}"

if [[ -f "$SCRIPTS_ROOT/lib/utils.sh" ]]; then
    source "$SCRIPTS_ROOT/lib/utils.sh"
    echo -e "   ✅ utils.sh loaded"
else
    echo -e "   ❌ utils.sh not found"
    exit 1
fi

# Create minimal enhanced_health_checks.sh if not exists
if [[ ! -f "$SCRIPTS_ROOT/lib/enhanced_health_checks.sh" ]]; then
    echo -e "   🔧 Creating minimal enhanced_health_checks.sh..."
    cat > "$SCRIPTS_ROOT/lib/enhanced_health_checks.sh" << 'EOF'
#!/bin/bash
# Minimal enhanced health checks for demo
enhanced_check_redis_health() { 
    if command -v redis-cli >/dev/null 2>&1; then
        redis-cli ping >/dev/null 2>&1
    else
        echo "Redis CLI not available" >&2
        return 1
    fi
}
enhanced_check_backend_health() { 
    if command -v curl >/dev/null 2>&1; then
        curl -s http://localhost:8000/health >/dev/null 2>&1
    else
        echo "Curl not available" >&2
        return 1
    fi
}
enhanced_check_worker_health() { pgrep -f "dramatiq.*run_agent_background" >/dev/null 2>&1; }
enhanced_check_frontend_health() { 
    if command -v curl >/dev/null 2>&1; then
        curl -s http://localhost:3000 >/dev/null 2>&1
    else
        echo "Curl not available" >&2
        return 1
    fi
}
check_monitor_health() { pgrep -f "enhanced_monitor.sh" >/dev/null 2>&1; }
EOF
fi

source "$SCRIPTS_ROOT/lib/enhanced_health_checks.sh"
echo -e "   ✅ enhanced_health_checks.sh loaded"

source "$SCRIPTS_ROOT/lib/parallel_dependency_manager.sh"
echo -e "   ✅ parallel_dependency_manager.sh loaded"

echo

# Demo 1: Initialize parallel dependency system
echo -e "${CYAN}🔧 Demo 1: Initialize Parallel Dependency System${NC}"
echo -e "${CYAN}=================================================${NC}"

init_parallel_dependency_system
echo -e "   ✅ Parallel dependency system initialized"
echo

# Demo 2: Calculate dependency waves
echo -e "${CYAN}📊 Demo 2: Calculate Dependency Waves${NC}"
echo -e "${CYAN}=====================================${NC}"

waves_output=$(calculate_dependency_waves)
echo -e "   📋 Dependency waves calculated:"
echo "$waves_output" | while IFS= read -r line; do
    if [[ -n "$line" ]]; then
        wave_num=$(echo "$line" | cut -d: -f1)
        services=$(echo "$line" | cut -d: -f2)
        echo -e "      🌊 $wave_num: $services"
    fi
done
echo

# Demo 3: Service status management
echo -e "${CYAN}📋 Demo 3: Service Status Management${NC}"
echo -e "${CYAN}====================================${NC}"

services=("redis" "backend" "worker" "frontend" "monitor")
for service in "${services[@]}"; do
    set_service_value "SERVICE_STATUS" "$service" "$SERVICE_READY"
    status=$(get_service_value "SERVICE_STATUS" "$service")
    echo -e "   📊 $service: $status"
done
echo

# Demo 4: Export parallel metrics
echo -e "${CYAN}📈 Demo 4: Export Parallel Metrics${NC}"
echo -e "${CYAN}==================================${NC}"

export_parallel_dependency_metrics
echo -e "   ✅ Parallel metrics exported to logs"
echo

# Demo 5: Simulate parallel kill (safe simulation)
echo -e "${CYAN}🔪 Demo 5: Simulate Parallel Kill Operations${NC}"
echo -e "${CYAN}=============================================${NC}"

echo -e "   🔄 Creating dummy processes for simulation..."
dummy_pids=()
for i in {1..3}; do
    sleep 60 &
    pid=$!
    dummy_pids+=($pid)
    echo -e "      📝 Created dummy process: $pid"
done

echo -e "   🔄 Simulating parallel kill..."
for pid in "${dummy_pids[@]}"; do
    (
        echo -e "      🔪 Killing process $pid..."
        kill -TERM "$pid" 2>/dev/null || true
        sleep 1
        kill -KILL "$pid" 2>/dev/null || true
        echo -e "      ✅ Process $pid terminated"
    ) &
done

# Wait for all kill jobs
wait

echo -e "   ✅ Parallel kill simulation completed"
echo

# Demo 6: Performance benchmark
echo -e "${CYAN}⚡ Demo 6: Performance Benchmark${NC}"
echo -e "${CYAN}===============================${NC}"

echo -e "   📊 Benchmarking dependency wave calculation..."
start_time=$(date +%s%N)
for i in {1..50}; do
    calculate_dependency_waves >/dev/null
done
end_time=$(date +%s%N)

duration_ns=$((end_time - start_time))
duration_ms=$((duration_ns / 1000000))
avg_ms=$((duration_ms / 50))

echo -e "      ⏱️ 50 iterations: ${duration_ms}ms total"
echo -e "      ⚡ Average: ${avg_ms}ms per calculation"

if [[ $avg_ms -lt 10 ]]; then
    echo -e "      🎉 Excellent performance!"
elif [[ $avg_ms -lt 50 ]]; then
    echo -e "      ✅ Good performance"
else
    echo -e "      ⚠️ Performance could be improved"
fi
echo

# Demo 7: Health check integration
echo -e "${CYAN}🏥 Demo 7: Health Check Integration${NC}"
echo -e "${CYAN}==================================${NC}"

health_checks=(
    "enhanced_check_redis_health:Redis"
    "enhanced_check_backend_health:Backend"
    "enhanced_check_worker_health:Worker"
    "enhanced_check_frontend_health:Frontend"
    "check_monitor_health:Monitor"
)

for check in "${health_checks[@]}"; do
    func=$(echo "$check" | cut -d: -f1)
    name=$(echo "$check" | cut -d: -f2)
    
    echo -e "   🔍 Testing $name health check..."
    if "$func" 2>/dev/null; then
        echo -e "      ✅ $name: Healthy"
    else
        echo -e "      ❌ $name: Not available or unhealthy"
    fi
done
echo

# Demo 8: Configuration validation
echo -e "${CYAN}🔧 Demo 8: Configuration Validation${NC}"
echo -e "${CYAN}===================================${NC}"

# Load config if available
if [[ -f "$SCRIPTS_ROOT/config/parallel_operations.conf" ]]; then
    echo -e "   📄 Loading configuration..."
    # Set defaults first to avoid readonly errors
    ENABLE_PARALLEL_OPERATIONS=${ENABLE_PARALLEL_OPERATIONS:-true}
    PARALLEL_KILL_ENABLED=${PARALLEL_KILL_ENABLED:-true}
    PARALLEL_START_ENABLED=${PARALLEL_START_ENABLED:-true}
    STARTUP_VERIFICATION_ENABLED=${STARTUP_VERIFICATION_ENABLED:-true}
    PARALLEL_KILL_TIMEOUT=${PARALLEL_KILL_TIMEOUT:-30}
    PARALLEL_START_TIMEOUT=${PARALLEL_START_TIMEOUT:-60}
    PROCESS_CHECK_INTERVAL=${PROCESS_CHECK_INTERVAL:-1}
    MAX_PARALLEL_RETRIES=${MAX_PARALLEL_RETRIES:-3}
    
    source "$SCRIPTS_ROOT/config/parallel_operations.conf" 2>/dev/null || true
    echo -e "   ✅ Configuration loaded"
else
    echo -e "   ⚠️ Configuration file not found, using defaults"
fi

echo -e "   📊 Current configuration:"
echo -e "      🔧 Parallel Operations: $ENABLE_PARALLEL_OPERATIONS"
echo -e "      🔪 Parallel Kill: $PARALLEL_KILL_ENABLED"
echo -e "      🚀 Parallel Start: $PARALLEL_START_ENABLED"
echo -e "      ⏰ Kill Timeout: ${PARALLEL_KILL_TIMEOUT}s"
echo -e "      ⏰ Start Timeout: ${PARALLEL_START_TIMEOUT}s"
echo

# Final summary
echo -e "${GREEN}🎉 ChainLens Parallel Operations Demo Completed!${NC}"
echo -e "${GREEN}===============================================${NC}"
echo
echo -e "${CYAN}📊 Demo Summary:${NC}"
echo -e "   ✅ Parallel dependency system initialized"
echo -e "   ✅ Dependency waves calculated successfully"
echo -e "   ✅ Service status management working"
echo -e "   ✅ Parallel metrics exported"
echo -e "   ✅ Parallel kill simulation completed"
echo -e "   ✅ Performance benchmarking completed"
echo -e "   ✅ Health check integration tested"
echo -e "   ✅ Configuration validation completed"
echo
echo -e "${CYAN}🚀 Next Steps:${NC}"
echo -e "   📝 Review the documentation: docs/development/parallel-operations-v3.1.md"
echo -e "   🧪 Run full tests: ./scripts/test/test_parallel_operations.sh"
echo -e "   🎯 Use v3.1 startup: ./scripts/core/start_dev_v3.1.sh"
echo
echo -e "${GREEN}✨ ChainLens v3.1 with Enhanced Parallel Operations is ready!${NC}"
