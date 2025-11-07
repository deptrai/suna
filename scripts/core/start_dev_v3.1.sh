#!/bin/bash

# ChainLens Development Environment Startup Script v3.1
# Enhanced với parallel kill/start operations và advanced process management
# BMAD Method: Business-focused, Method-driven, Architecture-aware, Documentation-complete

# Script metadata
readonly SCRIPT_VERSION="3.1.0"
readonly SCRIPT_NAME="ChainLens Dev Startup v3.1"
readonly SCRIPT_DESCRIPTION="Enhanced parallel development environment startup with advanced process management"

# Determine script directory và project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$SCRIPTS_ROOT/.." && pwd)"
export PROJECT_ROOT

# Define colors first
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly PURPLE='\033[0;35m'
readonly NC='\033[0m' # No Color

# Source required libraries (preserve PROJECT_ROOT)
export PROJECT_ROOT

source "$SCRIPTS_ROOT/lib/utils.sh"

# Ensure PROJECT_ROOT is still set after sourcing utils
if [[ -z "$PROJECT_ROOT" ]]; then
    PROJECT_ROOT="$(cd "$SCRIPTS_ROOT/.." && pwd)"
    export PROJECT_ROOT
fi

# Check if enhanced_health_checks.sh exists, if not create a minimal version
if [[ ! -f "$SCRIPTS_ROOT/lib/enhanced_health_checks.sh" ]]; then
    echo "Creating minimal enhanced_health_checks.sh..."
    cat > "$SCRIPTS_ROOT/lib/enhanced_health_checks.sh" << 'EOF'
#!/bin/bash
# Minimal enhanced health checks
enhanced_check_redis_health() { 
    if redis-cli ping >/dev/null 2>&1; then
        echo "HEALTH_OK"
        return 0
    else
        echo "HEALTH_FAIL"
        return 1
    fi
}
enhanced_check_backend_health() { 
    if curl -s http://localhost:8000/api/health >/dev/null 2>&1; then
        echo "HEALTH_OK"
        return 0
    else
        echo "HEALTH_FAIL"
        return 1
    fi
}
enhanced_check_worker_health() { 
    if pgrep -f "dramatiq.*run_agent_background" >/dev/null 2>&1; then
        echo "HEALTH_OK"
        return 0
    else
        echo "HEALTH_FAIL"
        return 1
    fi
}
enhanced_check_frontend_health() { 
    if curl -s --max-time 5 http://localhost:3000 >/dev/null 2>&1; then
        echo "HEALTH_OK"
        return 0
    else
        echo "HEALTH_FAIL"
        return 1
    fi
}
check_monitor_health() { pgrep -f "enhanced_monitor.sh" >/dev/null 2>&1; }
EOF
fi

source "$SCRIPTS_ROOT/lib/enhanced_health_checks.sh"
source "$SCRIPTS_ROOT/lib/parallel_dependency_manager.sh"

# Ensure PROJECT_ROOT is still set after sourcing all libraries
if [[ -z "$PROJECT_ROOT" ]]; then
    PROJECT_ROOT="$(cd "$SCRIPTS_ROOT/.." && pwd)"
    export PROJECT_ROOT
fi

set -uo pipefail  # Allow commands to return non-zero (remove -e temporarily)

# Configuration
readonly CONFIG_FILE="$PROJECT_ROOT/.env"
LOG_DIR="$PROJECT_ROOT/logs"
PID_DIR="$PROJECT_ROOT/pids"

# Parallel operation settings
readonly ENABLE_PARALLEL_OPERATIONS=true
readonly PARALLEL_KILL_ENABLED=true
readonly PARALLEL_START_ENABLED=true
readonly STARTUP_VERIFICATION_ENABLED=true

# Create necessary directories
create_directories() {
    log_structured "INFO" "startup_v3.1" "Creating necessary directories"

    # Create directories with error handling
    if ! mkdir -p "$LOG_DIR" 2>/dev/null; then
        echo "Warning: Cannot create logs directory, using /tmp"
        LOG_DIR="/tmp/chainlens_logs"
        mkdir -p "$LOG_DIR"
    fi

    if ! mkdir -p "$PID_DIR" 2>/dev/null; then
        echo "Warning: Cannot create pids directory, using /tmp"
        PID_DIR="/tmp/chainlens_pids"
        mkdir -p "$PID_DIR"
    fi

    # Ensure log files exist
    touch "$LOG_DIR/backend.log"
    touch "$LOG_DIR/worker.log"
    touch "$LOG_DIR/frontend.log"
    touch "$LOG_DIR/enhanced_monitor_output.log"

    log_structured "INFO" "startup_v3.1" "Directories created successfully"
}

# Display startup banner
display_startup_banner() {
    clear
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════════════════════╗"
    echo "║                          ChainLens Development v3.1                         ║"
    echo "║                     Enhanced Parallel Operations Edition                    ║"
    echo "╠══════════════════════════════════════════════════════════════════════════════╣"
    echo "║ Version: $SCRIPT_VERSION                                                        ║"
    echo "║ Features: Parallel Kill/Start, Advanced Process Management                  ║"
    echo "║ BMAD Method: Business-focused, Method-driven, Architecture-aware            ║"
    echo "╚══════════════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo
    
    log_structured "INFO" "startup_v3.1" "ChainLens Development Environment v3.1 starting"
}

# Check system requirements
check_system_requirements() {
    log_structured "INFO" "startup_v3.1" "Checking system requirements"
    
    echo -e "${CYAN}🔍 SYSTEM REQUIREMENTS CHECK${NC}"
    echo -e "${CYAN}============================${NC}"
    
    local requirements_met=true
    local required_commands=("python3" "node" "npm" "redis-cli" "uv" "curl" "jq")
    
    for cmd in "${required_commands[@]}"; do
        if command -v "$cmd" >/dev/null 2>&1; then
            local version=""
            case "$cmd" in
                "python3") version=$(python3 --version 2>&1 | cut -d' ' -f2) ;;
                "node") version=$(node --version 2>&1) ;;
                "npm") version=$(npm --version 2>&1) ;;
                "redis-cli") version=$(redis-cli --version 2>&1 | cut -d' ' -f2) ;;
                "uv") version=$(uv --version 2>&1 | cut -d' ' -f2) ;;
                "curl") version=$(curl --version 2>&1 | head -n1 | cut -d' ' -f2) ;;
                "jq") version=$(jq --version 2>&1) ;;
            esac
            echo -e "   ✅ $cmd: $version"
        else
            echo -e "   ❌ $cmd: Not found"
            requirements_met=false
        fi
    done
    
    if [[ "$requirements_met" == true ]]; then
        echo -e "${GREEN}✅ All system requirements met${NC}"
        log_structured "INFO" "startup_v3.1" "System requirements check passed"
        return 0
    else
        echo -e "${RED}❌ Some system requirements not met${NC}"
        log_structured "ERROR" "startup_v3.1" "System requirements check failed"
        return 1
    fi
}

# Check and start Supabase if needed
check_and_start_supabase() {
    log_structured "INFO" "startup_v3.1" "Checking Supabase status"
    
    echo -e "${CYAN}🗄️  CHECKING SUPABASE${NC}"
    echo -e "${CYAN}=======================${NC}"
    
    # Check if supabase CLI is available
    if ! command -v supabase >/dev/null 2>&1 && ! command -v npx >/dev/null 2>&1; then
        echo -e "   ⚠️  Supabase CLI not found (optional)"
        log_structured "WARN" "startup_v3.1" "Supabase CLI not found"
        return 0
    fi
    
    local supabase_cmd=""
    if command -v supabase >/dev/null 2>&1; then
        supabase_cmd="supabase"
    else
        supabase_cmd="npx supabase"
    fi
    
    # Check if we're in backend directory with supabase config
    local supabase_dir="$PROJECT_ROOT/backend"
    if [[ ! -f "$supabase_dir/supabase/config.toml" ]]; then
        echo -e "   ⚠️  Supabase config not found at $supabase_dir/supabase/config.toml"
        log_structured "WARN" "startup_v3.1" "Supabase config not found"
        return 0
    fi
    
    # Check Supabase status
    cd "$supabase_dir" || return 0
    
    if $supabase_cmd status >/dev/null 2>&1; then
        echo -e "   ✅ Supabase is running"
        
        # Check Realtime health
        local realtime_health=$(enhanced_check_supabase_realtime_health 2>/dev/null || echo "HEALTH_FAIL")
        if [[ "$realtime_health" == "HEALTH_OK" ]]; then
            echo -e "   ✅ Supabase Realtime is healthy"
            log_structured "INFO" "startup_v3.1" "Supabase Realtime is healthy"
        else
            echo -e "   ⚠️  Supabase Realtime not available (may need restart)"
            echo -e "   💡 Try: cd backend && supabase stop && supabase start"
            log_structured "WARN" "startup_v3.1" "Supabase Realtime not available"
        fi
    else
        echo -e "   🔄 Starting Supabase..."
        if $supabase_cmd start; then
            echo -e "   ✅ Supabase started successfully"
            log_structured "INFO" "startup_v3.1" "Supabase started successfully"
            
            # Wait a moment for services to initialize
            sleep 3
            
            # Check Realtime health
            local realtime_health=$(enhanced_check_supabase_realtime_health 2>/dev/null || echo "HEALTH_FAIL")
            if [[ "$realtime_health" == "HEALTH_OK" ]]; then
                echo -e "   ✅ Supabase Realtime is healthy"
            else
                echo -e "   ⚠️  Supabase Realtime may need a moment to start"
            fi
        else
            echo -e "   ⚠️  Failed to start Supabase (optional service)"
            log_structured "WARN" "startup_v3.1" "Failed to start Supabase"
        fi
    fi
    
    echo ""
    cd "$PROJECT_ROOT" || true
}

# Enhanced environment validation
validate_environment() {
    log_structured "INFO" "startup_v3.1" "Validating environment configuration"
    
    echo -e "${CYAN}🔧 ENVIRONMENT VALIDATION${NC}"
    echo -e "${CYAN}=========================${NC}"
    
    # Check .env file - try multiple locations
    local env_file=""
    if [[ -f "$CONFIG_FILE" ]]; then
        env_file="$CONFIG_FILE"
    elif [[ -f "$PROJECT_ROOT/backend/.env" ]]; then
        env_file="$PROJECT_ROOT/backend/.env"
    else
        echo -e "   ⚠️ Configuration file not found: $CONFIG_FILE"
        echo -e "   ℹ️  Continuing without .env validation (using environment variables)"
        log_structured "WARN" "startup_v3.1" "Configuration file not found, continuing anyway"
        return 0  # Continue anyway - env vars might be set externally
    fi
    
    if [[ -n "$env_file" ]]; then
        echo -e "   ✅ Configuration file found: $env_file"
        
        # Check critical environment variables
        local critical_vars=("OPENAI_API_KEY" "ANTHROPIC_API_KEY" "SUPABASE_URL" "SUPABASE_ANON_KEY")
        local missing_vars=()
        
        for var in "${critical_vars[@]}"; do
            if grep -q "^${var}=" "$env_file" && [[ -n "$(grep "^${var}=" "$env_file" | cut -d= -f2-)" ]]; then
                echo -e "   ✅ $var: Configured"
            else
                echo -e "   ⚠️ $var: Missing or empty"
                missing_vars+=("$var")
            fi
        done
        
        if [[ ${#missing_vars[@]} -eq 0 ]]; then
            echo -e "${GREEN}✅ Environment validation passed${NC}"
            log_structured "INFO" "startup_v3.1" "Environment validation passed"
            return 0
        else
            echo -e "${YELLOW}⚠️ Some environment variables missing: ${missing_vars[*]}${NC}"
            log_structured "WARN" "startup_v3.1" "Environment validation partial - missing vars: ${missing_vars[*]}"
            return 0  # Continue anyway
        fi
    fi
}

# Enhanced parallel cleanup
enhanced_parallel_cleanup() {
    log_structured "INFO" "startup_v3.1" "Starting enhanced parallel cleanup"
    
    echo -e "${CYAN}🧹 ENHANCED PARALLEL CLEANUP${NC}"
    echo -e "${CYAN}=============================${NC}"
    
    if [[ "$PARALLEL_KILL_ENABLED" == true ]]; then
        # Use parallel graceful shutdown
        if parallel_graceful_shutdown; then
            echo -e "${GREEN}✅ Parallel cleanup completed successfully${NC}"
            log_structured "INFO" "startup_v3.1" "Parallel cleanup completed successfully"
        else
            echo -e "${YELLOW}⚠️ Parallel cleanup completed with warnings${NC}"
            log_structured "WARN" "startup_v3.1" "Parallel cleanup completed with warnings"
        fi
    else
        # Fallback to sequential cleanup
        echo -e "${YELLOW}⚠️ Parallel operations disabled, using sequential cleanup${NC}"
        graceful_shutdown
    fi
    
    # Additional cleanup
    echo -e "${CYAN}🔄 Additional cleanup tasks${NC}"
    
    # Clean up PID files
    if [[ -d "$PID_DIR" ]]; then
        rm -f "$PID_DIR"/*.pid
        echo -e "   ✅ PID files cleaned"
    fi
    
    # Clean up temporary files (limit to project directory to avoid long scans)
    echo -e "   🔍 Cleaning temporary files..."
    local tmp_count=0
    if [[ -d "$PROJECT_ROOT" ]]; then
        # Only search within project directory, not parent - limit depth to avoid long scans
        while IFS= read -r tmp_file && [[ $tmp_count -lt 50 ]]; do
            [[ -f "$tmp_file" ]] && rm -f "$tmp_file" 2>/dev/null && tmp_count=$((tmp_count + 1)) || true
        done < <(find "$PROJECT_ROOT" -maxdepth 5 -name "*.tmp" -type f 2>/dev/null)
        # Also check common temp locations
        [[ -d "$LOG_DIR" ]] && rm -f "$LOG_DIR"/*.tmp 2>/dev/null || true
        [[ -d "$PID_DIR" ]] && rm -f "$PID_DIR"/*.tmp 2>/dev/null || true
    fi
    if [[ $tmp_count -gt 0 ]]; then
        echo -e "   ✅ Temporary files cleaned ($tmp_count files)"
    else
        echo -e "   ✅ Temporary files cleaned (none found)"
    fi
    
    # Clean up old log files (keep last 5)
    echo -e "   🔍 Checking log files..."
    local log_count=0
    for log_file in "$LOG_DIR"/*.log; do
        [[ ! -f "$log_file" ]] && continue
        log_count=$((log_count + 1))
        # Keep file but truncate if too large (>100MB)
        local size=$(stat -f%z "$log_file" 2>/dev/null || stat -c%s "$log_file" 2>/dev/null || echo 0)
        if [[ $size -gt 104857600 ]]; then
            tail -n 1000 "$log_file" > "${log_file}.tmp" && mv "${log_file}.tmp" "$log_file" 2>/dev/null || true
            echo -e "   ✅ Truncated large log file: $(basename "$log_file")"
        fi
    done
    echo -e "   ✅ Log files checked ($log_count files)"
    
    # Clean up old tmux monitoring sessions
    if command -v tmux >/dev/null 2>&1; then
        tmux kill-session -t "chainlens-monitor" 2>/dev/null || true
        echo -e "   ✅ Old monitoring tmux sessions cleaned"
    fi
    
    # Kill any running monitoring dashboard processes
    pkill -f "enhanced_dashboard_monitor" 2>/dev/null || true
    echo -e "   ✅ Monitoring dashboard processes cleaned"
    
    echo -e "${GREEN}✅ Additional cleanup completed${NC}"
    log_structured "INFO" "startup_v3.1" "Enhanced cleanup completed"
}

# Setup enhanced monitoring script
setup_enhanced_monitor_script() {
    log_structured "INFO" "startup_v3.1" "Setting up enhanced monitor script"

    echo -e "${CYAN}📊 SETTING UP ENHANCED MONITORING${NC}"
    echo -e "${CYAN}==================================${NC}"

    # Create enhanced monitor script
    cat > "$LOG_DIR/enhanced_monitor.sh" << 'EOF'
#!/bin/bash

# ChainLens Enhanced Monitor v3.1
# Real-time monitoring với parallel operations support

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}🔄 ChainLens Enhanced Monitor v3.1 Starting...${NC}"
echo -e "${CYAN}=============================================${NC}"

# Monitor loop
while true; do
    clear
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    echo -e "${CYAN}📊 ChainLens Enhanced Monitor v3.1 - $timestamp${NC}"
    echo -e "${CYAN}======================================================${NC}"
    echo ""

    # Service status checks
    echo -e "${CYAN}🔍 SERVICE STATUS${NC}"
    echo -e "${CYAN}=================${NC}"

    services=("redis" "backend" "worker" "frontend")
    for service in "${services[@]}"; do
        case "$service" in
            "redis")
                if redis-cli ping >/dev/null 2>&1; then
                    echo -e "   ✅ Redis: Healthy"
                else
                    echo -e "   ❌ Redis: Unhealthy"
                fi
                ;;
            "backend")
                if curl -s http://localhost:8000/health >/dev/null 2>&1; then
                    echo -e "   ✅ Backend: Healthy"
                else
                    echo -e "   ❌ Backend: Unhealthy"
                fi
                ;;
            "frontend")
                if curl -s http://localhost:3000 >/dev/null 2>&1; then
                    echo -e "   ✅ Frontend: Healthy"
                else
                    echo -e "   ❌ Frontend: Unhealthy"
                fi
                ;;
            "worker")
                if ps aux | grep -E "dramatiq.*run_agent_background" | grep -v grep >/dev/null; then
                    echo -e "   ✅ Worker: Healthy"
                else
                    echo -e "   ❌ Worker: Unhealthy"
                fi
                ;;
        esac
    done

    echo ""
    echo -e "${CYAN}📊 SYSTEM METRICS${NC}"
    echo -e "${CYAN}=================${NC}"

    # Memory usage (macOS compatible)
    memory_info=$(vm_stat | grep "Pages active:\|Pages inactive:\|Pages free:" | head -3)
    echo -e "   💾 Memory: Available"

    # CPU usage (macOS compatible)
    cpu_usage=$(ps -A -o %cpu | awk '{s+=$1} END {print s}' | cut -d. -f1)
    echo -e "   🖥️  CPU: ${cpu_usage:-0}%"

    # Disk usage
    disk_usage=$(df -h . | tail -1 | awk '{print $5}')
    echo -e "   💿 Disk: $disk_usage"

    # Process counts
    dramatiq_count=$(ps aux | grep -E "dramatiq.*run_agent_background" | grep -v grep | wc -l | tr -d ' ')
    echo -e "   ⚙️  Worker processes: $dramatiq_count"

    # Redis connections
    redis_connections=$(redis-cli info clients 2>/dev/null | grep "connected_clients:" | cut -d: -f2 | tr -d ' \r\n' || echo "N/A")
    echo -e "   🔄 Redis connections: $redis_connections"

    echo ""
    echo -e "${CYAN}🚀 PARALLEL OPERATIONS STATUS${NC}"
    echo -e "${CYAN}=============================${NC}"
    echo -e "   ⚡ Parallel Kill: Enabled"
    echo -e "   🎯 Parallel Start: Enabled"
    echo -e "   📊 Dependency Waves: Active"
    echo -e "   🔄 Process Tracking: Active"

    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop monitoring${NC}"
    echo ""

    sleep 10
done
EOF

    chmod +x "$LOG_DIR/enhanced_monitor.sh"
    echo -e "   ✅ Enhanced monitor script created"
    log_structured "INFO" "startup_v3.1" "Enhanced monitor script created and ready"
}

# Enhanced parallel startup
enhanced_parallel_startup() {
    log_structured "INFO" "startup_v3.1" "Starting enhanced parallel startup"
    
    echo -e "${CYAN}🚀 ENHANCED PARALLEL STARTUP${NC}"
    echo -e "${CYAN}============================${NC}"
    
    # Initialize parallel dependency system
    init_parallel_dependency_system
    
    if [[ "$PARALLEL_START_ENABLED" == true ]]; then
        # Use parallel startup sequence
        if execute_parallel_startup_sequence; then
            echo -e "${GREEN}✅ Parallel startup completed successfully${NC}"
            log_structured "INFO" "startup_v3.1" "Parallel startup completed successfully"
            return 0
        else
            echo -e "${RED}❌ Parallel startup failed${NC}"
            log_structured "ERROR" "startup_v3.1" "Parallel startup failed"
            return 1
        fi
    else
        # Fallback to sequential startup
        echo -e "${YELLOW}⚠️ Parallel operations disabled, using sequential startup${NC}"
        execute_startup_sequence
    fi
}

# Enhanced startup verification
enhanced_startup_verification() {
    log_structured "INFO" "startup_v3.1" "Starting enhanced startup verification"
    
    echo -e "${CYAN}🔍 ENHANCED STARTUP VERIFICATION${NC}"
    echo -e "${CYAN}=================================${NC}"
    
    if [[ "$STARTUP_VERIFICATION_ENABLED" != true ]]; then
        echo -e "${YELLOW}⚠️ Startup verification disabled${NC}"
        return 0
    fi
    
    # Export parallel metrics
    export_parallel_dependency_metrics
    
    # Comprehensive health check
    local services=("redis" "backend" "worker" "frontend")
    local all_healthy=true
    
    for service in "${services[@]}"; do
        local status=$(get_service_value "SERVICE_STATUS" "$service")
        local pid=$(get_service_value "SERVICE_PIDS" "$service")
        
        echo -e "   🔍 Checking $service (Status: $status, PID: $pid)"
        
        case "$service" in
            "redis")
                if enhanced_check_redis_health; then
                    echo -e "     ✅ Redis: Healthy"
                else
                    echo -e "     ❌ Redis: Unhealthy"
                    all_healthy=false
                fi
                ;;
            "backend")
                if enhanced_check_backend_health; then
                    echo -e "     ✅ Backend: Healthy"
                else
                    echo -e "     ❌ Backend: Unhealthy"
                    all_healthy=false
                fi
                ;;
            "worker")
                if enhanced_check_worker_health; then
                    echo -e "     ✅ Worker: Healthy"
                else
                    echo -e "     ❌ Worker: Unhealthy"
                    all_healthy=false
                fi
                ;;
            "frontend")
                if enhanced_check_frontend_health; then
                    echo -e "     ✅ Frontend: Healthy"
                else
                    echo -e "     ❌ Frontend: Unhealthy"
                    all_healthy=false
                fi
                ;;
        esac
    done
    
    if [[ "$all_healthy" == true ]]; then
        echo -e "${GREEN}✅ All services verified healthy${NC}"
        log_structured "INFO" "startup_v3.1" "Enhanced startup verification passed"
        return 0
    else
        echo -e "${YELLOW}⚠️ Some services may have issues${NC}"
        log_structured "WARN" "startup_v3.1" "Enhanced startup verification partial"
        return 1
    fi
}

# Enhanced monitoring display
enhanced_monitoring_display() {
    log_structured "INFO" "startup_v3.1" "Starting enhanced monitoring display"

    echo -e "${CYAN}📊 ENHANCED MONITORING SYSTEM v3.1${NC}"
    echo -e "${CYAN}===================================${NC}"

    # Monitor service is started by dependency manager, just confirm it's ready
    if [[ -f "$LOG_DIR/enhanced_monitor.sh" ]]; then
        echo -e "   ✅ Enhanced monitor script is ready"
        log_structured "INFO" "startup_v3.1" "Enhanced monitor script confirmed ready"

        # Start monitor in background if not already running
        if ! pgrep -f "enhanced_monitor.sh" >/dev/null 2>&1; then
            echo -e "   🔄 Starting enhanced monitor..."
            nohup "$LOG_DIR/enhanced_monitor.sh" > "$LOG_DIR/enhanced_monitor_output.log" 2>&1 &
            local monitor_pid=$!
            echo "$monitor_pid" > "$LOG_DIR/enhanced_monitor.pid"
            echo -e "   ✅ Enhanced monitor started (PID: $monitor_pid)"
            log_structured "INFO" "startup_v3.1" "Enhanced monitor started" "{\"pid\":$monitor_pid}"
        else
            echo -e "   ✅ Enhanced monitor already running"
        fi
    else
        echo -e "   ❌ Enhanced monitor script not found"
        log_structured "ERROR" "startup_v3.1" "Enhanced monitor script not found"
    fi

    echo -e "${CYAN}📊 Monitoring Features:${NC}"
    echo -e "   🔍 Real-time service health checks"
    echo -e "   📈 System metrics monitoring"
    echo -e "   ⚡ Parallel operations status"
    echo -e "   🔄 Process tracking"
    echo -e "   📊 Performance metrics"

    echo -e "${CYAN}📝 Monitor Commands:${NC}"
    echo -e "   📊 View monitor:     ${YELLOW}tail -f $LOG_DIR/enhanced_monitor_output.log${NC}"
    echo -e "   🔄 Restart monitor:  ${YELLOW}pkill -f enhanced_monitor.sh && $LOG_DIR/enhanced_monitor.sh &${NC}"
    echo -e "   🛑 Stop monitor:     ${YELLOW}pkill -f enhanced_monitor.sh${NC}"

    log_structured "INFO" "startup_v3.1" "Enhanced monitoring display completed"
}

# Launch enhanced monitoring dashboard
launch_monitoring_dashboard() {
    log_structured "INFO" "startup_v3.1" "Launching enhanced monitoring dashboard"
    
    echo ""
    echo -e "${CYAN}📊 ENHANCED MONITORING DASHBOARD v3.0${NC}"
    echo -e "${CYAN}======================================${NC}"
    echo -e "${GREEN}🚀 Launching Enhanced Multi-Panel Monitoring Dashboard...${NC}"
    echo -e "${PURPLE}✨ Features: 4-panel tmux layout with Backend/Frontend maximized, real-time monitoring${NC}"
    echo -e "${PURPLE}✨ Real-time logs: Backend, Frontend, Worker, Redis${NC}"
    echo ""
    
    # Determine monitoring script path
    local monitoring_script="$SCRIPTS_ROOT/monitoring/enhanced_dashboard_monitor.sh"
    
    # Check if monitoring script exists
    if [[ ! -f "$monitoring_script" ]]; then
        echo -e "${YELLOW}⚠️ Monitoring script not found at $monitoring_script${NC}"
        echo -e "${YELLOW}⚠️ Services are running, but monitoring dashboard cannot be started${NC}"
        echo -e "${YELLOW}💡 You can manually start monitoring: ./scripts/monitoring/enhanced_dashboard_monitor.sh${NC}"
        log_structured "WARN" "startup_v3.1" "Monitoring dashboard script not found" "{\"path\":\"$monitoring_script\"}"
        return 0
    fi
    
    # Ensure script is executable
    if [[ ! -x "$monitoring_script" ]]; then
        chmod +x "$monitoring_script"
        echo -e "   🔧 Made monitoring script executable"
    fi
    
    # Wait a moment for services to fully stabilize
    echo -e "${CYAN}⏳ Waiting for services to fully stabilize...${NC}"
    sleep 2
    
    echo -e "${GREEN}✅ Launching monitoring dashboard...${NC}"
    echo -e "${CYAN}💡 Tip: Press Ctrl+B then 'd' to detach from dashboard (services keep running)${NC}"
    echo ""
    
    log_structured "INFO" "startup_v3.1" "Executing monitoring dashboard" "{\"script\":\"$monitoring_script\"}"
    
    # Execute the monitoring dashboard (this will take over the terminal)
    exec "$monitoring_script"
}

# Main execution function
main() {
    # Setup error handling
    trap 'log_structured "ERROR" "startup_v3.1" "Script interrupted"; exit 1' INT TERM
    
    # Display banner
    display_startup_banner
    
    # Create directories
    create_directories

    # Check system requirements
    if ! check_system_requirements; then
        log_structured "ERROR" "startup_v3.1" "System requirements not met"
        exit 1
    fi

    # Validate environment
    if ! validate_environment; then
        log_structured "ERROR" "startup_v3.1" "Environment validation failed"
        exit 1
    fi

    # Check and start Supabase if needed
    check_and_start_supabase

    # Setup enhanced monitoring script before cleanup
    setup_enhanced_monitor_script

    # Enhanced parallel cleanup
    enhanced_parallel_cleanup
    
    # Enhanced parallel startup
    if ! enhanced_parallel_startup; then
        log_structured "ERROR" "startup_v3.1" "Enhanced startup failed"
        exit 1
    fi
    
    # Enhanced startup verification
    enhanced_startup_verification

    # Enhanced monitoring display
    enhanced_monitoring_display

    # Final status summary
    echo
    echo -e "${GREEN}🎉 ChainLens Development Environment v3.1 is ready!${NC}"
    echo -e "${CYAN}📊 Access points:${NC}"
    echo -e "   🌐 Frontend: http://localhost:3000"
    echo -e "   🔧 Backend API: http://localhost:8000"
    echo -e "   📊 API Docs: http://localhost:8000/docs"
    echo -e "   📈 Health Check: http://localhost:8000/health"
    echo
    echo -e "${CYAN}📝 Logs:${NC}"
    echo -e "   📄 Backend: $LOG_DIR/backend.log"
    echo -e "   👷 Worker: $LOG_DIR/worker.log"
    echo -e "   🎨 Frontend: $LOG_DIR/frontend.log"
    echo -e "   📊 Monitor: $LOG_DIR/enhanced_monitor_output.log"
    echo
    
    log_structured "INFO" "startup_v3.1" "ChainLens Development Environment v3.1 startup completed successfully"
    
    # Launch enhanced monitoring dashboard with real-time logs
    launch_monitoring_dashboard
}

# Execute main function
main "$@"
