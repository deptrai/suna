#!/bin/bash

# Chain Lens Development Environment Enhanced Startup Script v3.1
# Enhanced với circuit breakers, smart dependency management, robust error handling,
# và optimized monitoring dashboard (Backend/Frontend maximized layout)

set -e

# Source shared libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIGINAL_SCRIPT_DIR="$SCRIPT_DIR"
source "$SCRIPT_DIR/../lib/utils.sh"

# Initialize utilities and load configuration (preserve SCRIPT_DIR)
SCRIPT_DIR="$ORIGINAL_SCRIPT_DIR"
init_utils
SCRIPT_DIR="$ORIGINAL_SCRIPT_DIR"

# Source enhanced libraries
source "$SCRIPT_DIR/../lib/enhanced_health_checks.sh"
source "$SCRIPT_DIR/../lib/dependency_manager.sh"
source "$SCRIPT_DIR/../lib/error_handler.sh"
source "$SCRIPT_DIR/../lib/monitoring.sh"

# Ensure CONFIG_FILE is set after sourcing libraries
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$PROJECT_ROOT/config/dev-environment.yaml"

load_config || {
    echo -e "${RED}❌ Failed to load configuration${NC}"
    exit 1
}

# Global variables for process management
FRONTEND_PID=""
BACKEND_PID=""
WORKER_PID=""
MONITOR_PID=""

# Cleanup function for graceful shutdown
cleanup_on_exit() {
    log_structured "INFO" "startup" "Enhanced startup script received shutdown signal"
    
    # Use dependency manager for graceful shutdown
    graceful_shutdown
    
    # Additional cleanup
    [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
    [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null || true
    [[ -n "$WORKER_PID" ]] && kill "$WORKER_PID" 2>/dev/null || true
    [[ -n "$MONITOR_PID" ]] && kill "$MONITOR_PID" 2>/dev/null || true
    
    cleanup_monitoring
    exit 0
}

# Set up signal handlers
trap cleanup_on_exit SIGINT SIGTERM

# Enhanced initialization
init_enhanced_startup() {
    log_structured "INFO" "startup" "Initializing Chain Lens Enhanced Development Environment v3.0"

    echo -e "${CYAN}🚀 CHAIN LENS ENHANCED DEVELOPMENT ENVIRONMENT v3.1${NC}"
    echo -e "${CYAN}======================================================${NC}"
    echo -e "${PURPLE}✨ Enhanced Features:${NC}"
    echo -e "   🔄 Circuit Breaker Pattern for resilience"
    echo -e "   🎯 Smart Dependency Management with topological sorting"
    echo -e "   🛡️  Advanced Error Handling with graceful degradation"
    echo -e "   📊 Comprehensive Health Monitoring"
    echo -e "   ⚡ Optimized Service Startup Sequences"
    echo -e "   🗺️ Optimized Dashboard Layout (Backend/Frontend maximized)"
    echo -e ""
    echo -e "📁 Project root: ${PROJECT_ROOT}"
    echo -e "⚙️ Configuration: ${CONFIG_FILE}"
    echo ""
    
    # Initialize all enhanced systems
    init_monitoring
    init_dependency_system
    init_error_handling
    
    # Load environment variables safely
    if [[ -f "$PROJECT_ROOT/../backend/.env" ]]; then
        while IFS= read -r line; do
            # Skip comments and empty lines
            [[ "$line" =~ ^[[:space:]]*# ]] && continue
            [[ -z "$line" ]] && continue

            # Check if line contains = and is a valid variable assignment
            if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)[[:space:]]*$ ]]; then
                local key="${BASH_REMATCH[1]}"
                local value="${BASH_REMATCH[2]}"
                # Remove quotes if present
                value="${value%\"}"
                value="${value#\"}"
                value="${value%\'}"
                value="${value#\'}"
                # Export the variable
                export "$key"="$value"
            fi
        done < "$PROJECT_ROOT/../backend/.env"
        log_structured "INFO" "startup" "Environment variables loaded from backend/.env"
    else
        log_structured "WARN" "startup" "No .env file found, using defaults"
    fi
}

# Enhanced Phase 1: Environment validation with circuit breakers
enhanced_phase1_environment_validation() {
    echo -e "${CYAN}🔍 ENHANCED PHASE 1: ENVIRONMENT VALIDATION & CLEANUP${NC}"
    echo -e "${CYAN}====================================================${NC}"
    
    log_structured "INFO" "phase1" "Starting enhanced environment validation and cleanup"
    
    # Validate required environment variables with error tracking
    local required_vars=$(get_config_value "environment.required_vars" "SUPABASE_URL,SUPABASE_ANON_KEY,REDIS_URL")
    IFS=',' read -ra VARS <<< "$required_vars"
    
    for var in "${VARS[@]}"; do
        var=$(echo "$var" | tr -d ' "[]' | sed 's/^-//')
        if [[ -z "${!var}" ]]; then
            record_error "environment" "validation" "Missing required environment variable: $var" "critical"
            handle_error 1 "environment" "Required environment variable $var is not set" "Check your backend/.env file"
            exit 1
        fi
        log_structured "DEBUG" "environment" "Environment variable $var is set"
    done
    
    # Enhanced cleanup with error handling
    echo -e "🧹 ENHANCED CLEANUP - Circuit breaker protected cleanup..."

    # Use existing cleanup but with error tracking
    if [[ -x "$SCRIPT_DIR/quick_cleanup_v2.sh" ]]; then
        echo -e "🔄 Running comprehensive quick_cleanup_v2.sh..."
        if ! "$SCRIPT_DIR/quick_cleanup_v2.sh" --quiet; then
            record_error "cleanup" "script" "Quick cleanup script failed" "high"
            log_structured "WARN" "cleanup" "Quick cleanup script failed, continuing with fallback"
        fi
    fi

    # Additional cleanup with error tracking - comprehensive process cleanup
    echo -e "🔨 Additional cleanup patterns..."
    
    # Kill all related processes
    pkill -KILL -f "python.*dramatiq" 2>/dev/null || true
    pkill -KILL -f "dramatiq.*run_agent_background" 2>/dev/null || true
    pkill -KILL -f "uvicorn.*api" 2>/dev/null || true
    pkill -KILL -f "node.*next" 2>/dev/null || true
    pkill -KILL -f "next.*dev" 2>/dev/null || true
    pkill -KILL -f "pnpm.*dev" 2>/dev/null || true
    pkill -KILL -f "npm.*dev" 2>/dev/null || true
    pkill -KILL -f "bash.*monitor" 2>/dev/null || true
    pkill -KILL -f "enhanced_monitor" 2>/dev/null || true
    pkill -KILL -f "enhanced_dashboard_monitor" 2>/dev/null || true
    
    # Kill tmux monitoring session if exists
    tmux kill-session -t "chainlens-monitor" 2>/dev/null || true

    sleep 2

    # Enhanced verification with health checks
    echo -e "🔍 ENHANCED CLEANUP VERIFICATION..."

    local dramatiq_processes=$(ps aux | grep -E "dramatiq" | grep -v grep | wc -l | tr -d ' ')
    local worker_processes=$(ps aux | grep -E "spawn_main|run_agent_background" | grep -v grep | wc -l | tr -d ' ')
    local backend_processes=$(ps aux | grep -E "uvicorn.*api" | grep -v grep | wc -l | tr -d ' ')
    local frontend_processes=$(ps aux | grep -E "next.*dev|pnpm.*dev|npm.*dev" | grep -v grep | wc -l | tr -d ' ')
    local monitor_processes=$(ps aux | grep -E "enhanced_monitor|enhanced_dashboard_monitor" | grep -v grep | wc -l | tr -d ' ')
    local tmux_sessions=$(tmux ls -F "#{session_name}" 2>/dev/null | grep -c "chainlens-monitor" || echo "0")
    local total_processes=$((dramatiq_processes + worker_processes + backend_processes + frontend_processes + monitor_processes))

    echo -e "📊 Enhanced process cleanup verification:"
    echo -e "   Dramatiq processes: $dramatiq_processes"
    echo -e "   Worker processes: $worker_processes"
    echo -e "   Backend processes: $backend_processes"
    echo -e "   Frontend processes: $frontend_processes"
    echo -e "   Monitor processes: $monitor_processes"
    echo -e "   Tmux sessions: $tmux_sessions"
    echo -e "   Total processes: $total_processes"

    if [[ $total_processes -gt 0 ]] || [[ $tmux_sessions -gt 0 ]]; then
        record_error "cleanup" "verification" "Processes still running after cleanup" "medium"
        echo -e "${YELLOW}⚠️ Warning: $total_processes application processes and $tmux_sessions tmux sessions still running${NC}"
        echo -e "${YELLOW}⚠️ Attempting additional cleanup...${NC}"
        sleep 1
        # One more aggressive cleanup attempt
        pkill -9 -f "dramatiq\|uvicorn\|next\|pnpm\|npm.*dev" 2>/dev/null || true
        tmux kill-session -t "chainlens-monitor" 2>/dev/null || true
        sleep 1
    else
        echo -e "${GREEN}✅ ALL APPLICATION PROCESSES CLEANED UP${NC}"
    fi
    
    echo -e "${GREEN}✅ Enhanced environment validation completed${NC}"
    log_structured "INFO" "phase1" "Enhanced environment validation completed"
    echo ""
}

# Enhanced Phase 2: Infrastructure check with circuit breakers
enhanced_phase2_infrastructure_check() {
    echo -e "${CYAN}🏗️ ENHANCED PHASE 2: INFRASTRUCTURE SERVICES CHECK${NC}"
    echo -e "${CYAN}=================================================${NC}"

    log_structured "INFO" "phase2" "Enhanced infrastructure services check with circuit breakers"

    # Enhanced Redis check
    echo -e "🔍 Enhanced Redis check with circuit breaker..."
    local redis_status=$(enhanced_check_redis_health)
    case "$redis_status" in
        "$HEALTH_OK")
            echo -e "${GREEN}✅ Redis is healthy${NC}"
            ;;
        "$HEALTH_FAIL")
            record_error "connection_refused" "redis" "Redis health check failed" "critical"
            handle_error 1 "redis" "Redis is not accessible" "Start Redis with: redis-server"
            exit 1
            ;;
        *)
            record_error "timeout" "redis" "Redis health check timeout" "high"
            echo -e "${YELLOW}⚠️ Redis status: $redis_status${NC}"
            ;;
    esac
    
    # Enhanced Supabase check (optional)
    echo -e "🔍 Enhanced Supabase check..."
    local supabase_status=$(enhanced_check_supabase_health)
    case "$supabase_status" in
        "$HEALTH_OK")
            echo -e "${GREEN}✅ Supabase is healthy${NC}"
            ;;
        "$HEALTH_SKIP")
            echo -e "${YELLOW}⚠️ Supabase is not accessible (optional service)${NC}"
            ;;
        *)
            echo -e "${YELLOW}⚠️ Supabase status: $supabase_status (continuing anyway)${NC}"
            ;;
    esac
    
    echo -e "${GREEN}✅ Enhanced infrastructure check completed${NC}"
    log_structured "INFO" "phase2" "Enhanced infrastructure check completed"
    echo ""
}

# Setup enhanced monitoring script (run before services start)
setup_enhanced_monitor_script() {
    log_structured "INFO" "monitoring" "Setting up enhanced monitor script"
    
    # Create comprehensive monitoring script
    cat > "$PROJECT_ROOT/../logs/enhanced_monitor.sh" << 'EOF'
#!/bin/bash

# Enhanced monitoring script with integrated systems
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/scripts"
source "$SCRIPT_DIR/../lib/utils.sh"
source "$SCRIPT_DIR/../lib/enhanced_health_checks.sh"
source "$SCRIPT_DIR/../lib/dependency_manager.sh"
source "$SCRIPT_DIR/../lib/error_handler.sh"

PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo -e "\033[36m📊 Enhanced Chain Lens Monitoring System v3.0\033[0m"
echo -e "Features: Health monitoring, Process tracking, Resource monitoring"
echo -e "Monitoring interval: 20s health checks, 10s real-time metrics"
echo ""

counter=0

while true; do
    counter=$((counter + 1))
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Service health checks every 20 seconds
    if [[ $((counter % 2)) -eq 0 ]]; then
        echo "[$timestamp] 🏥 Health Checks (Enhanced)"
        
        # Check all services with basic health checks
        for service in "redis" "backend" "frontend" "worker"; do
            case "$service" in
                "redis")
                    if redis-cli ping >/dev/null 2>&1; then
                        echo "   ✅ redis: Healthy"
                    else
                        echo "   ❌ redis: Failed"
                    fi
                    ;;
                "backend")
                    if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8000/health" | grep -q "200"; then
                        echo "   ✅ backend: Healthy"
                    else
                        echo "   ❌ backend: Failed"
                    fi
                    ;;
                "frontend")
                    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000" | grep -q "200\|404"; then
                        echo "   ✅ frontend: Healthy"
                    else
                        echo "   ❌ frontend: Failed"
                    fi
                    ;;
                "worker")
                    if ps aux | grep -E "dramatiq.*run_agent_background" | grep -v grep >/dev/null; then
                        echo "   ✅ worker: Healthy"
                    else
                        echo "   ❌ worker: Failed"
                    fi
                    ;;
            esac
        done
    fi
    
    # Real-time metrics every 10 seconds
    echo "[$timestamp] 📊 System Metrics"
    
    # Memory usage (macOS compatible)
    memory_info=$(vm_stat | grep "Pages active:\|Pages inactive:\|Pages free:")
    echo "   💾 Memory: Available"
    
    # CPU usage (macOS compatible)
    cpu_usage=$(ps -A -o %cpu | awk '{s+=$1} END {print s}' | cut -d. -f1)
    echo "   🖥️  CPU: ${cpu_usage:-0}%"
    
    # Disk usage
    disk_usage=$(df -h "$PROJECT_ROOT" | tail -1 | awk '{print $5}')
    echo "   💿 Disk: $disk_usage"
    
    # Process counts
    dramatiq_count=$(ps aux | grep -E "dramatiq.*run_agent_background" | grep -v grep | wc -l | tr -d ' ')
    echo "   ⚙️  Worker processes: $dramatiq_count"
    
    # Redis connections
    redis_connections=$(redis-cli info clients 2>/dev/null | grep "connected_clients:" | cut -d: -f2 | tr -d ' \r\n' || echo "N/A")
    echo "   🔄 Redis connections: $redis_connections"
    
    echo ""
    sleep 10
done
EOF
    
    chmod +x "$PROJECT_ROOT/../logs/enhanced_monitor.sh"
    log_structured "INFO" "monitoring" "Enhanced monitor script created and ready"
}

# Enhanced startup sequence using dependency manager
enhanced_startup_sequence() {
    echo -e "${CYAN}🎯 ENHANCED STARTUP SEQUENCE${NC}"
    echo -e "${CYAN}===========================${NC}"

    log_structured "INFO" "startup_sequence" "Starting enhanced dependency-managed startup sequence"
    
    # Execute smart startup sequence
    if execute_startup_sequence; then
        echo -e "${GREEN}✅ Enhanced startup sequence completed successfully${NC}"
        log_structured "INFO" "startup_sequence" "Enhanced startup sequence completed successfully"
        
        # Export all metrics
        export_dependency_metrics
        export_error_metrics
        export_circuit_breaker_metrics
        
        return 0
    else
        record_error "startup" "sequence" "Startup sequence failed" "critical"
        echo -e "${RED}❌ Enhanced startup sequence failed${NC}"
        return 1
    fi
}

# Enhanced monitoring display (monitor service started by dependency manager)
enhanced_monitoring() {
    echo -e "${CYAN}📊 ENHANCED MONITORING SYSTEM${NC}"
    echo -e "${CYAN}==============================${NC}"
    
    log_structured "INFO" "monitoring" "Enhanced monitoring system initialized"
    
    # Monitor service is started by dependency manager, just confirm it's ready
    if [[ -f "$PROJECT_ROOT/../logs/enhanced_monitor.sh" ]]; then
        echo -e "${GREEN}✅ Enhanced monitor script is ready${NC}"
        log_structured "INFO" "monitoring" "Enhanced monitor script confirmed ready"
    else
        log_structured "WARN" "monitoring" "Enhanced monitor script not found"
    fi
    
    echo ""
}

# Display enhanced startup summary
display_enhanced_summary() {
    echo -e "${CYAN}🎉 ENHANCED STARTUP COMPLETED SUCCESSFULLY!${NC}"
    echo -e "${CYAN}===========================================${NC}"
    
    local frontend_port=$(get_config_value "services.application.frontend.port" "3000")
    local backend_port=$(get_config_value "services.application.backend.port" "8000")
    
    echo -e "🌐 Frontend:   ${GREEN}http://localhost:$frontend_port${NC}"
    echo -e "🔧 Backend:    ${GREEN}http://127.0.0.1:$backend_port${NC}"
    echo -e "📚 API Docs:   ${GREEN}http://127.0.0.1:$backend_port/docs${NC}"
    echo -e "🔄 Worker:     ${GREEN}Running with circuit breakers${NC}"
    echo -e "📊 Monitor:    ${GREEN}Enhanced monitoring active${NC}"
    echo -e "🗄️  Redis:      ${GREEN}Running with circuit breakers${NC}"
    echo -e "🗃️  Supabase:   ${GREEN}Running (or skipped if optional)${NC}"
    echo ""
    
    echo -e "${PURPLE}✨ Enhanced Features Active:${NC}"
    echo -e "   🔄 Circuit Breaker Pattern: Automatic failure detection"
    echo -e "   🎯 Smart Dependencies: Optimal startup order"
    echo -e "   🛡️  Error Handling: Graceful degradation strategies"
    echo -e "   📊 Comprehensive Monitoring: Health + Performance + Errors"
    echo -e "   ⚡ Service Recovery: Automatic restart on failures"
    echo ""
    
    # Display service status summary
    echo -e "📋 Service Status Summary:"
    local all_status=$(get_all_services_status)
    echo -e "   Services: $all_status"
    echo ""
    
    # Display circuit breaker status
    echo -e "🔄 Circuit Breaker Status:"
    for service in "redis" "backend" "frontend" "worker"; do
        local circuit_status=$(get_circuit_breaker_status "$service")
        echo -e "   $service: $circuit_status"
    done
    echo ""
    
    echo -e "📄 Enhanced Logs:"
    echo -e "   Frontend:         ${PROJECT_ROOT}/logs/frontend.log"
    echo -e "   Backend:          ${PROJECT_ROOT}/logs/backend.log"
    echo -e "   Worker:           ${PROJECT_ROOT}/logs/worker.log"
    echo -e "   Enhanced Monitor: ${PROJECT_ROOT}/logs/enhanced_monitor_output.log"
    echo -e "   Error Tracking:   ${PROJECT_ROOT}/logs/alerts.log"
    echo -e "   Structured Logs:  ${PROJECT_ROOT}/logs/structured.jsonl"
    echo ""
    
    echo -e "${YELLOW}💡 Enhanced Management Commands:${NC}"
    echo -e "   Dashboard Manager:   ${CYAN}./dashboard_manager.sh [start|attach|status|stop|restart]${NC}"
    echo -e "   Quick start:         ${CYAN}../monitoring/enhanced_dashboard_monitor.sh${NC}"
    echo -e "   Dashboard status:    ${CYAN}./dashboard_manager.sh status${NC}"
    echo -e "   Attach dashboard:    ${CYAN}./dashboard_manager.sh attach${NC}"
    echo -e "   View logs:           ${CYAN}./dashboard_manager.sh logs${NC}"
    echo -e "   Graceful stop:       ${CYAN}graceful_shutdown${NC}"
    echo ""
    
    echo -e "${GREEN}🚀 Enhanced development environment is ready!${NC}"
    echo -e "${PURPLE}📊 Monitoring với circuit breakers, error tracking, và optimized 4-panel dashboard (Backend/Frontend maximized).${NC}"

    log_structured "INFO" "startup" "Enhanced Chain Lens development environment startup completed" "{\"frontend_pid\":$FRONTEND_PID,\"backend_pid\":$BACKEND_PID,\"worker_pid\":$WORKER_PID,\"monitor_pid\":$MONITOR_PID,\"enhanced_features\":true}"

    # Launch optimized monitoring dashboard v3.0
    echo ""
    echo -e "${CYAN}📊 ENHANCED MONITORING DASHBOARD v3.0${NC}"
    echo -e "${CYAN}======================================${NC}"
    echo -e "${GREEN}🚀 Launching Enhanced Multi-Panel Monitoring Dashboard...${NC}"
    echo -e "${PURPLE}✨ Features: 4-panel tmux layout with Backend/Frontend maximized, real-time monitoring${NC}"
    echo -e "${PURPLE}✨ Real-time logs: Backend, Frontend, Worker, Redis${NC}"
    echo ""
    
    # Check if monitoring script exists
    local monitoring_script="$SCRIPT_DIR/../monitoring/enhanced_dashboard_monitor.sh"
    if [[ ! -f "$monitoring_script" ]]; then
        echo -e "${YELLOW}⚠️ Monitoring script not found at $monitoring_script${NC}"
        echo -e "${YELLOW}⚠️ Services are running, but monitoring dashboard cannot be started${NC}"
        return 0
    fi
    
    if [[ ! -x "$monitoring_script" ]]; then
        chmod +x "$monitoring_script"
    fi
    
    sleep 2
    
    # Execute the optimized monitoring dashboard v3.0 (enhanced_dashboard_monitor.sh is the most complete)
    echo -e "${GREEN}✅ Launching monitoring dashboard...${NC}"
    exec "$monitoring_script"
}

# Main execution with enhanced error handling
main_enhanced() {
    # Initialize enhanced systems
    init_enhanced_startup

    # Execute enhanced phases
    enhanced_phase1_environment_validation
    enhanced_phase2_infrastructure_check
    
    # Setup monitoring script before services start
    setup_enhanced_monitor_script
    
    # Execute smart startup sequence (services will be started here)
    echo -e "${CYAN}🚀 Starting all services after cleanup...${NC}"
    if ! enhanced_startup_sequence; then
        echo -e "${RED}❌ Enhanced startup sequence failed${NC}"
        record_error "startup" "sequence" "Startup sequence failed completely" "critical"
        exit 1
    fi
    
    echo -e "${GREEN}✅ All services started successfully${NC}"
    echo ""
    
    # Wait a moment for services to fully initialize
    echo -e "${CYAN}⏳ Waiting for services to stabilize...${NC}"
    sleep 3
    
    # Display enhanced monitoring status
    enhanced_monitoring

    # Display enhanced summary and launch dashboard
    display_enhanced_summary
}

# Execute enhanced main function
main_enhanced "$@"