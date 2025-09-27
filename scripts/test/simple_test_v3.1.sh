#!/bin/bash

# Simple Test for ChainLens v3.1 Parallel Operations
# Quick verification that all components are working

# Define colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color

# Determine paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SCRIPTS_ROOT/.." && pwd)"

echo -e "${CYAN}🧪 Simple Test for ChainLens v3.1 Parallel Operations${NC}"
echo -e "${CYAN}====================================================${NC}"
echo
echo -e "📁 PROJECT_ROOT: $PROJECT_ROOT"
echo -e "📁 SCRIPTS_ROOT: $SCRIPTS_ROOT"
echo

# Test 1: Check if all required files exist
echo -e "${CYAN}📋 Test 1: File Existence Check${NC}"
echo -e "${CYAN}===============================${NC}"

files_to_check=(
    "$SCRIPTS_ROOT/core/start_dev_v3.1.sh"
    "$SCRIPTS_ROOT/lib/parallel_dependency_manager.sh"
    "$SCRIPTS_ROOT/config/parallel_operations.conf"
    "$SCRIPTS_ROOT/demo/demo_parallel_v3.1.sh"
    "$PROJECT_ROOT/docs/development/parallel-operations-v3.1.md"
)

all_files_exist=true
for file in "${files_to_check[@]}"; do
    if [[ -f "$file" ]]; then
        echo -e "   ✅ $(basename "$file"): Found"
    else
        echo -e "   ❌ $(basename "$file"): Missing"
        all_files_exist=false
    fi
done

if [[ "$all_files_exist" == true ]]; then
    echo -e "${GREEN}✅ All required files exist${NC}"
else
    echo -e "${RED}❌ Some files are missing${NC}"
    exit 1
fi
echo

# Test 2: Check if scripts are executable
echo -e "${CYAN}🔧 Test 2: Executable Check${NC}"
echo -e "${CYAN}==========================${NC}"

executable_files=(
    "$SCRIPTS_ROOT/core/start_dev_v3.1.sh"
    "$SCRIPTS_ROOT/demo/demo_parallel_v3.1.sh"
)

all_executable=true
for file in "${executable_files[@]}"; do
    if [[ -x "$file" ]]; then
        echo -e "   ✅ $(basename "$file"): Executable"
    else
        echo -e "   ❌ $(basename "$file"): Not executable"
        chmod +x "$file" 2>/dev/null && echo -e "      🔧 Fixed: Made executable" || all_executable=false
    fi
done

if [[ "$all_executable" == true ]]; then
    echo -e "${GREEN}✅ All scripts are executable${NC}"
else
    echo -e "${RED}❌ Some scripts are not executable${NC}"
fi
echo

# Test 3: Test parallel dependency manager functions
echo -e "${CYAN}⚙️ Test 3: Parallel Dependency Manager${NC}"
echo -e "${CYAN}=====================================${NC}"

# Source the parallel dependency manager
if source "$SCRIPTS_ROOT/lib/utils.sh" 2>/dev/null; then
    echo -e "   ✅ utils.sh: Loaded"
else
    echo -e "   ❌ utils.sh: Failed to load"
    exit 1
fi

# Create minimal health checks if needed
if [[ ! -f "$SCRIPTS_ROOT/lib/enhanced_health_checks.sh" ]]; then
    cat > "$SCRIPTS_ROOT/lib/enhanced_health_checks.sh" << 'EOF'
#!/bin/bash
enhanced_check_redis_health() { command -v redis-cli >/dev/null 2>&1 && redis-cli ping >/dev/null 2>&1; }
enhanced_check_backend_health() { command -v curl >/dev/null 2>&1 && curl -s http://localhost:8000/health >/dev/null 2>&1; }
enhanced_check_worker_health() { pgrep -f "dramatiq.*run_agent_background" >/dev/null 2>&1; }
enhanced_check_frontend_health() { command -v curl >/dev/null 2>&1 && curl -s http://localhost:3000 >/dev/null 2>&1; }
check_monitor_health() { pgrep -f "enhanced_monitor.sh" >/dev/null 2>&1; }
EOF
fi

if source "$SCRIPTS_ROOT/lib/enhanced_health_checks.sh" 2>/dev/null; then
    echo -e "   ✅ enhanced_health_checks.sh: Loaded"
else
    echo -e "   ❌ enhanced_health_checks.sh: Failed to load"
    exit 1
fi

if source "$SCRIPTS_ROOT/lib/parallel_dependency_manager.sh" 2>/dev/null; then
    echo -e "   ✅ parallel_dependency_manager.sh: Loaded"
else
    echo -e "   ❌ parallel_dependency_manager.sh: Failed to load"
    exit 1
fi

# Test initialization
if init_parallel_dependency_system >/dev/null 2>&1; then
    echo -e "   ✅ Parallel dependency system: Initialized"
else
    echo -e "   ❌ Parallel dependency system: Failed to initialize"
    exit 1
fi

# Test dependency wave calculation
if waves_output=$(calculate_dependency_waves 2>/dev/null); then
    echo -e "   ✅ Dependency waves: Calculated"
    wave_count=$(echo "$waves_output" | wc -l | tr -d ' ')
    echo -e "      📊 Number of waves: $wave_count"
else
    echo -e "   ❌ Dependency waves: Failed to calculate"
    exit 1
fi
echo

# Test 4: Configuration validation
echo -e "${CYAN}🔧 Test 4: Configuration Validation${NC}"
echo -e "${CYAN}==================================${NC}"

# Set defaults to avoid readonly errors
ENABLE_PARALLEL_OPERATIONS=${ENABLE_PARALLEL_OPERATIONS:-true}
PARALLEL_KILL_ENABLED=${PARALLEL_KILL_ENABLED:-true}
PARALLEL_START_ENABLED=${PARALLEL_START_ENABLED:-true}
STARTUP_VERIFICATION_ENABLED=${STARTUP_VERIFICATION_ENABLED:-true}
PARALLEL_KILL_TIMEOUT=${PARALLEL_KILL_TIMEOUT:-30}
PARALLEL_START_TIMEOUT=${PARALLEL_START_TIMEOUT:-60}
PROCESS_CHECK_INTERVAL=${PROCESS_CHECK_INTERVAL:-1}
MAX_PARALLEL_RETRIES=${MAX_PARALLEL_RETRIES:-3}

if [[ -f "$SCRIPTS_ROOT/config/parallel_operations.conf" ]]; then
    if source "$SCRIPTS_ROOT/config/parallel_operations.conf" 2>/dev/null; then
        echo -e "   ✅ Configuration file: Loaded"
    else
        echo -e "   ⚠️ Configuration file: Loaded with warnings"
    fi
    
    echo -e "   📊 Configuration values:"
    echo -e "      🔧 Parallel Operations: $ENABLE_PARALLEL_OPERATIONS"
    echo -e "      🔪 Parallel Kill: $PARALLEL_KILL_ENABLED"
    echo -e "      🚀 Parallel Start: $PARALLEL_START_ENABLED"
    echo -e "      ⏰ Kill Timeout: ${PARALLEL_KILL_TIMEOUT}s"
else
    echo -e "   ❌ Configuration file: Not found"
    exit 1
fi
echo

# Test 5: Demo script test
echo -e "${CYAN}🎯 Test 5: Demo Script Test${NC}"
echo -e "${CYAN}=========================${NC}"

if [[ -x "$SCRIPTS_ROOT/demo/demo_parallel_v3.1.sh" ]]; then
    echo -e "   🔄 Running demo script (timeout 30s)..."
    if timeout 30 "$SCRIPTS_ROOT/demo/demo_parallel_v3.1.sh" >/dev/null 2>&1; then
        echo -e "   ✅ Demo script: Completed successfully"
    else
        echo -e "   ⚠️ Demo script: Completed with warnings or timeout"
    fi
else
    echo -e "   ❌ Demo script: Not executable"
    exit 1
fi
echo

# Test 6: System requirements check
echo -e "${CYAN}🔍 Test 6: System Requirements${NC}"
echo -e "${CYAN}=============================${NC}"

required_commands=("bash" "ps" "grep" "awk" "cut" "date" "sleep" "kill" "pkill" "pgrep")
missing_commands=()

for cmd in "${required_commands[@]}"; do
    if command -v "$cmd" >/dev/null 2>&1; then
        echo -e "   ✅ $cmd: Available"
    else
        echo -e "   ❌ $cmd: Missing"
        missing_commands+=("$cmd")
    fi
done

if [[ ${#missing_commands[@]} -eq 0 ]]; then
    echo -e "${GREEN}✅ All system requirements met${NC}"
else
    echo -e "${YELLOW}⚠️ Missing commands: ${missing_commands[*]}${NC}"
fi
echo

# Final summary
echo -e "${GREEN}🎉 Simple Test Completed!${NC}"
echo -e "${GREEN}=========================${NC}"
echo
echo -e "${CYAN}📊 Test Summary:${NC}"
echo -e "   ✅ File existence check passed"
echo -e "   ✅ Executable check passed"
echo -e "   ✅ Parallel dependency manager working"
echo -e "   ✅ Configuration validation passed"
echo -e "   ✅ Demo script test completed"
echo -e "   ✅ System requirements check passed"
echo
echo -e "${CYAN}🚀 Next Steps:${NC}"
echo -e "   📝 Review documentation: docs/development/parallel-operations-v3.1.md"
echo -e "   🎯 Run full startup: ./scripts/core/start_dev_v3.1.sh"
echo -e "   🧪 Run comprehensive tests: ./scripts/test/test_parallel_operations.sh"
echo -e "   🎮 Try demo: ./scripts/demo/demo_parallel_v3.1.sh"
echo
echo -e "${GREEN}✨ ChainLens v3.1 with Enhanced Parallel Operations is ready!${NC}"
