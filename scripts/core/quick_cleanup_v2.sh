#!/bin/bash

# ChainLens Development Environment Quick Cleanup Script (Production-Ready v2.0)
# Script dọn dẹp nhanh môi trường phát triển ChainLens - Chuẩn Production

set -e

# Source shared libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIGINAL_SCRIPT_DIR="$SCRIPT_DIR"
source "$SCRIPT_DIR/../lib/utils.sh"

# Initialize utilities and load configuration (preserve SCRIPT_DIR)
SCRIPT_DIR="$ORIGINAL_SCRIPT_DIR"
init_utils
SCRIPT_DIR="$ORIGINAL_SCRIPT_DIR"

source "$SCRIPT_DIR/../lib/health_checks.sh"
source "$SCRIPT_DIR/../lib/monitoring.sh"

# Ensure CONFIG_FILE is set after sourcing libraries
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$PROJECT_ROOT/config/dev-environment.yaml"
load_config || {
    echo -e "${RED}❌ Failed to load configuration${NC}"
    exit 1
}

# Initialize cleanup system
init_cleanup_system() {
    local quiet_mode="$1"

    log_structured "INFO" "cleanup" "Initializing ChainLens development environment cleanup"

    if [[ "$quiet_mode" != "--quiet" ]]; then
        echo -e "${CYAN}🧹 CHAINLENS DEVELOPMENT ENVIRONMENT CLEANUP v2.0${NC}"
        echo -e "${CYAN}=============================================${NC}"
        echo -e "📁 Project root: ${PROJECT_ROOT}"
        echo ""

        echo -e "${YELLOW}⚠️ WARNING: This will clean all development data and stop all services${NC}"
        echo -e "${YELLOW}⚠️ Infrastructure services (Redis, Supabase) will also be affected${NC}"
        echo ""
    fi
}

# Phase 1: Stop all services
phase1_stop_all_services() {
    echo -e "${CYAN}🛑 PHASE 1: STOP ALL SERVICES${NC}"
    echo -e "${CYAN}=============================${NC}"
    
    log_structured "INFO" "phase1" "Stopping all services"
    
    local force_timeout=$(get_config_value "timeouts.graceful_shutdown" "5")
    validate_timeout "$force_timeout" || force_timeout=5
    
    # Stop monitoring first
    echo -e "🛑 Stopping monitoring..."
    kill_processes_by_pattern "monitor.sh" "TERM" "monitoring"
    kill_processes_by_pattern "logs/monitor.sh" "TERM" "monitoring"
    cleanup_monitoring
    
    # Stop application services
    echo -e "🛑 Stopping application services..."
    kill_processes_by_pattern "next.*dev" "TERM" "frontend"
    kill_processes_by_pattern "uvicorn.*api" "TERM" "backend"
    kill_processes_by_pattern "dramatiq.*run_agent_background" "TERM" "worker"
    kill_processes_by_pattern "spawn_main" "KILL" "worker_spawn"
    
    # Wait a moment for graceful shutdown
    sleep "$force_timeout"
    
    # Force kill any remaining processes (more aggressive)
    echo -e "🔨 Force killing remaining processes..."
    kill_processes_by_pattern "next.*dev" "KILL" "frontend"
    kill_processes_by_pattern "uvicorn.*api" "KILL" "backend"
    kill_processes_by_pattern "dramatiq.*run_agent_background" "KILL" "worker"
    kill_processes_by_pattern "spawn_main" "KILL" "worker_spawn"
    kill_processes_by_pattern "monitor.sh" "KILL" "monitoring"

    # Additional cleanup for orphaned processes
    echo -e "🧹 Cleaning up orphaned processes..."
    pkill -f "dramatiq" 2>/dev/null || true
    pkill -f "run_agent_background" 2>/dev/null || true
    pkill -9 -f "dramatiq" 2>/dev/null || true

    # Kill by port (backup method)
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true

    # Wait for processes to die
    sleep 2
    
    echo -e "${GREEN}✅ All services stopped${NC}"
    log_structured "INFO" "phase1" "All services stopped"
    echo ""
}

# Phase 2: Clear Redis data
phase2_clear_redis_data() {
    echo -e "${CYAN}🗄️ PHASE 2: CLEAR REDIS DATA${NC}"
    echo -e "${CYAN}============================${NC}"
    
    log_structured "INFO" "phase2" "Clearing Redis data"
    
    # Check if Redis is accessible
    if [[ "$(check_redis_health)" == "$HEALTH_OK" ]]; then
        echo -e "🔄 Flushing Redis database..."
        
        # Get Redis info before cleanup
        local redis_keys_before=$(redis-cli dbsize 2>/dev/null || echo "0")
        log_structured "INFO" "redis_cleanup" "Redis keys before cleanup: $redis_keys_before"
        
        # Flush all Redis data
        redis-cli flushall 2>/dev/null || {
            handle_error 1 "redis" "Failed to flush Redis data" "Check Redis connection and permissions"
        }
        
        # Clear Dramatiq queues specifically
        redis-cli del "dramatiq:default" 2>/dev/null || true
        redis-cli del "dramatiq:default.DQ" 2>/dev/null || true
        redis-cli del "dramatiq:default.XQ" 2>/dev/null || true
        
        # Verify cleanup
        local redis_keys_after=$(redis-cli dbsize 2>/dev/null || echo "0")
        log_structured "INFO" "redis_cleanup" "Redis keys after cleanup: $redis_keys_after"
        
        echo -e "${GREEN}✅ Redis data cleared (keys: $redis_keys_before → $redis_keys_after)${NC}"
    else
        echo -e "${YELLOW}⚠️ Redis not accessible, skipping data cleanup${NC}"
        log_structured "WARN" "phase2" "Redis not accessible, skipping data cleanup"
    fi
    
    echo ""
}

# Phase 3: Clear logs and temporary files
phase3_clear_logs_and_temp() {
    echo -e "${CYAN}📄 PHASE 3: CLEAR LOGS & TEMPORARY FILES${NC}"
    echo -e "${CYAN}=======================================${NC}"
    
    log_structured "INFO" "phase3" "Clearing logs and temporary files"
    
    # Count files before cleanup
    local log_files_before=$(find "$PROJECT_ROOT/logs" -name "*.log" -o -name "*.jsonl" 2>/dev/null | wc -l)
    local temp_files_before=$(find /tmp -name "chainlens_*" -o -name "dramatiq_*" -o -name "agent_*" 2>/dev/null | wc -l)
    
    echo -e "🗑️ Clearing application logs..."
    
    # Clear log files
    rm -f "$PROJECT_ROOT/logs"/*.log 2>/dev/null || true
    rm -f "$PROJECT_ROOT/logs"/*.jsonl 2>/dev/null || true
    rm -f "$PROJECT_ROOT/logs"/monitor.sh 2>/dev/null || true
    rm -f "$PROJECT_ROOT/logs"/monitor_output.log 2>/dev/null || true
    
    # Clear root level logs
    rm -f "$PROJECT_ROOT"/*.log 2>/dev/null || true
    rm -f "$PROJECT_ROOT"/*.tmp 2>/dev/null || true
    
    echo -e "🗑️ Clearing temporary files..."
    
    # Clear temporary files
    rm -f /tmp/chainlens_* 2>/dev/null || true
    rm -rf /tmp/dramatiq_* 2>/dev/null || true
    rm -rf /tmp/agent_* 2>/dev/null || true
    rm -rf /tmp/playwright_* 2>/dev/null || true
    
    # Clear Python cache
    find "$PROJECT_ROOT" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
    find "$PROJECT_ROOT" -name "*.pyc" -delete 2>/dev/null || true
    
    # Clear Node.js cache (if exists)
    rm -rf "$PROJECT_ROOT/frontend/.next" 2>/dev/null || true
    rm -rf "$PROJECT_ROOT/frontend/node_modules/.cache" 2>/dev/null || true
    
    # Count files after cleanup
    local log_files_after=$(find "$PROJECT_ROOT/logs" -name "*.log" -o -name "*.jsonl" 2>/dev/null | wc -l)
    local temp_files_after=$(find /tmp -name "chainlens_*" -o -name "dramatiq_*" -o -name "agent_*" 2>/dev/null | wc -l)
    
    echo -e "${GREEN}✅ Logs and temporary files cleared${NC}"
    echo -e "   Log files: $log_files_before → $log_files_after"
    echo -e "   Temp files: $temp_files_before → $temp_files_after"
    
    log_structured "INFO" "phase3" "Logs and temporary files cleared" "{\"log_files_before\":$log_files_before,\"log_files_after\":$log_files_after,\"temp_files_before\":$temp_files_before,\"temp_files_after\":$temp_files_after}"
    echo ""
}

# Phase 4: Verify cleanup
phase4_verify_cleanup() {
    echo -e "${CYAN}🔍 PHASE 4: VERIFY CLEANUP${NC}"
    echo -e "${CYAN}=========================${NC}"
    
    log_structured "INFO" "phase4" "Verifying cleanup completion"
    
    # Check for remaining processes
    echo -e "🔍 Checking for remaining processes..."
    
    local frontend_procs=$(pgrep -f "next.*dev" 2>/dev/null | wc -l)
    local backend_procs=$(pgrep -f "uvicorn.*api" 2>/dev/null | wc -l)
    local worker_procs=$(pgrep -f "dramatiq.*run_agent_background" 2>/dev/null | wc -l)
    local spawn_procs=$(pgrep -f "spawn_main" 2>/dev/null | wc -l)
    local monitor_procs=$(pgrep -f "monitor.sh" 2>/dev/null | wc -l)
    
    local total_procs=$((frontend_procs + backend_procs + worker_procs + spawn_procs + monitor_procs))
    
    echo -e "   Frontend processes: $frontend_procs"
    echo -e "   Backend processes:  $backend_procs"
    echo -e "   Worker processes:   $worker_procs"
    echo -e "   Spawn processes:    $spawn_procs"
    echo -e "   Monitor processes:  $monitor_procs"
    echo -e "   Total processes:    $total_procs"
    
    # Check Redis status
    echo -e "🔍 Checking Redis status..."
    if [[ "$(check_redis_health)" == "$HEALTH_OK" ]]; then
        local redis_keys=$(redis-cli dbsize 2>/dev/null || echo "unknown")
        echo -e "   Redis: ${GREEN}Running${NC} (keys: $redis_keys)"
    else
        echo -e "   Redis: ${YELLOW}Not accessible${NC}"
    fi
    
    # Check Supabase status
    echo -e "🔍 Checking Supabase status..."
    if [[ "$(check_supabase_health)" == "$HEALTH_OK" ]]; then
        echo -e "   Supabase: ${GREEN}Running${NC}"
    else
        echo -e "   Supabase: ${YELLOW}Not accessible${NC}"
    fi
    
    # Check disk space freed
    echo -e "🔍 Checking disk space..."
    local logs_size=$(du -sh "$PROJECT_ROOT/logs" 2>/dev/null | cut -f1 || echo "0B")
    echo -e "   Logs directory size: $logs_size"
    
    echo -e "${GREEN}✅ Cleanup verification completed${NC}"
    log_structured "INFO" "phase4" "Cleanup verification completed" "{\"remaining_processes\":$total_procs,\"logs_size\":\"$logs_size\"}"
    echo ""
}

# Display cleanup summary
display_cleanup_summary() {
    echo -e "${CYAN}🎯 CLEANUP SUMMARY${NC}"
    echo -e "${CYAN}==================${NC}"
    
    # Final process count
    local total_remaining=$(pgrep -f "next.*dev|uvicorn.*api|dramatiq.*run_agent_background|spawn_main|monitor.sh" 2>/dev/null | wc -l)
    
    if [[ $total_remaining -eq 0 ]]; then
        echo -e "${GREEN}✅ Complete cleanup successful${NC}"
        echo -e "   All ChainLens processes stopped"
        echo -e "   All logs and temporary files cleared"
        echo -e "   Redis data flushed"
        log_structured "INFO" "cleanup" "Complete cleanup successful"
    else
        echo -e "${YELLOW}⚠️ Partial cleanup completed${NC}"
        echo -e "   $total_remaining processes still running"
        echo -e "   Manual intervention may be required"
        log_structured "WARN" "cleanup" "Partial cleanup completed" "{\"remaining_processes\":$total_remaining}"
    fi
    
    echo ""
    echo -e "🏗️ Infrastructure Status:"
    
    # Check infrastructure
    if [[ "$(check_redis_health)" == "$HEALTH_OK" ]]; then
        echo -e "   Redis: ${GREEN}Running${NC} (data cleared)"
    else
        echo -e "   Redis: ${YELLOW}Not accessible${NC}"
    fi
    
    if [[ "$(check_supabase_health)" == "$HEALTH_OK" ]]; then
        echo -e "   Supabase: ${GREEN}Running${NC}"
    else
        echo -e "   Supabase: ${YELLOW}Not accessible${NC}"
    fi
    
    echo ""
    echo -e "📁 Clean State:"
    echo -e "   Logs directory: Cleared"
    echo -e "   Temporary files: Cleared"
    echo -e "   Python cache: Cleared"
    echo -e "   Node.js cache: Cleared"
    echo ""
    echo -e "${YELLOW}💡 Next Steps:${NC}"
    echo -e "   Start fresh environment: ${CYAN}scripts/start_dev.sh${NC}"
    echo -e "   Check infrastructure:     ${CYAN}redis-cli ping && curl localhost:54321/health${NC}"
    echo ""
    echo -e "${GREEN}🎉 Environment cleanup completed - Ready for fresh start!${NC}"
    
    log_structured "INFO" "cleanup" "Environment cleanup completed" "{\"status\":\"ready_for_fresh_start\"}"
}

# Main execution
main() {
    # Initialize system with quiet mode support
    init_cleanup_system "$1"

    # Execute cleanup phases
    phase1_stop_all_services
    phase2_clear_redis_data
    phase3_clear_logs_and_temp
    phase4_verify_cleanup

    # Display summary (skip if quiet)
    if [[ "$1" != "--quiet" ]]; then
        display_cleanup_summary
    fi
}

# Execute main function
main "$@"
