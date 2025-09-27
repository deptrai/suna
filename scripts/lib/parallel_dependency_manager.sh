#!/bin/bash

# ChainLens Parallel Dependency Management System v3.1
# Enhanced với parallel kill/start operations và advanced process tracking
# BMAD Method: Business-focused, Method-driven, Architecture-aware, Documentation-complete

# Prevent multiple sourcing
if [[ -n "$PARALLEL_DEPENDENCY_MANAGER_LOADED" ]]; then
    return 0
fi
export PARALLEL_DEPENDENCY_MANAGER_LOADED=1

# Source utilities
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/utils.sh"
source "$LIB_DIR/enhanced_health_checks.sh"

# Parallel operation configuration
readonly PARALLEL_KILL_TIMEOUT=30
readonly PARALLEL_START_TIMEOUT=60
readonly PROCESS_CHECK_INTERVAL=1
readonly MAX_PARALLEL_RETRIES=3

# Service definitions và dependency graph - Enhanced for parallel operations
SERVICE_DEPENDENCIES_DATA=""
SERVICE_READINESS_CHECKS_DATA=""
SERVICE_STARTUP_TIMEOUTS_DATA=""
SERVICE_STATUS_DATA=""
SERVICE_START_TIMES_DATA=""
SERVICE_RETRY_COUNTS_DATA=""
SERVICE_PIDS_DATA=""
SERVICE_KILL_JOBS_DATA=""

# Enhanced helper functions for parallel operations
set_service_value() {
    local array_name="$1"
    local key="$2"
    local value="$3"
    local data_var="${array_name}_DATA"
    local current_data
    
    eval "current_data=\${${data_var}}"
    local escaped_key=$(echo "$key" | sed 's/[.\[*^$()+?{|]/\\&/g')
    current_data=$(echo "$current_data" | sed "s/|${escaped_key}:[^|]*//g" | sed "s/^${escaped_key}:[^|]*|*//g" | sed 's/^|//' | sed 's/|$//')
    
    if [[ -n "$current_data" ]]; then
        current_data="${current_data}|${key}:${value}"
    else
        current_data="${key}:${value}"
    fi
    
    eval "${data_var}=\${current_data}"
}

get_service_value() {
    local array_name="$1"
    local key="$2"
    local default_value="${3:-}"
    local data_var="${array_name}_DATA"
    local current_data
    
    eval "current_data=\${${data_var}}"
    local value=$(echo "$current_data" | grep -o "${key}:[^|]*" | cut -d: -f2-)
    
    if [[ -n "$value" ]]; then
        echo "$value"
    else
        echo "$default_value"
    fi
}

get_all_service_keys() {
    local array_name="$1"
    local data_var="${array_name}_DATA"
    local current_data
    
    eval "current_data=\${${data_var}}"
    
    if [[ -n "$current_data" ]]; then
        echo "$current_data" | tr '|' '\n' | cut -d: -f1
    fi
}

# Service startup states - Enhanced for parallel operations
readonly SERVICE_PENDING="pending"
readonly SERVICE_STARTING="starting"
readonly SERVICE_READY="ready"
readonly SERVICE_FAILED="failed"
readonly SERVICE_TIMEOUT="timeout"
readonly SERVICE_KILLING="killing"
readonly SERVICE_KILLED="killed"

# Initialize parallel dependency system
init_parallel_dependency_system() {
    log_structured "INFO" "parallel_dependency_manager" "Initializing parallel dependency management system v3.1"
    
    # Define service dependencies (child depends on parent)
    set_service_value "SERVICE_DEPENDENCIES" "redis" ""
    set_service_value "SERVICE_DEPENDENCIES" "backend" "redis"
    set_service_value "SERVICE_DEPENDENCIES" "worker" "redis,backend"
    set_service_value "SERVICE_DEPENDENCIES" "frontend" "backend"
    set_service_value "SERVICE_DEPENDENCIES" "monitor" "redis,backend,worker,frontend"
    
    # Define readiness checks for each service
    set_service_value "SERVICE_READINESS_CHECKS" "redis" "enhanced_check_redis_health"
    set_service_value "SERVICE_READINESS_CHECKS" "backend" "enhanced_check_backend_health"
    set_service_value "SERVICE_READINESS_CHECKS" "worker" "enhanced_check_worker_health"
    set_service_value "SERVICE_READINESS_CHECKS" "frontend" "enhanced_check_frontend_health"
    set_service_value "SERVICE_READINESS_CHECKS" "monitor" "check_monitor_health"
    
    # Define startup timeouts (seconds)
    set_service_value "SERVICE_STARTUP_TIMEOUTS" "redis" "10"
    set_service_value "SERVICE_STARTUP_TIMEOUTS" "backend" "30"
    set_service_value "SERVICE_STARTUP_TIMEOUTS" "worker" "20"
    set_service_value "SERVICE_STARTUP_TIMEOUTS" "frontend" "45"
    set_service_value "SERVICE_STARTUP_TIMEOUTS" "monitor" "5"
    
    # Initialize all services as pending
    for service in redis backend worker frontend monitor; do
        set_service_value "SERVICE_STATUS" "$service" "$SERVICE_PENDING"
        set_service_value "SERVICE_START_TIMES" "$service" "0"
        set_service_value "SERVICE_RETRY_COUNTS" "$service" "0"
        set_service_value "SERVICE_PIDS" "$service" ""
        set_service_value "SERVICE_KILL_JOBS" "$service" ""
    done
    
    log_structured "INFO" "parallel_dependency_manager" "Parallel dependency system initialized with enhanced process tracking"
}

# Parallel kill all services
parallel_kill_services() {
    log_structured "INFO" "parallel_dependency_manager" "Starting parallel kill of all services"
    
    local kill_jobs=()
    local services=("redis" "backend" "worker" "frontend" "monitor")
    
    echo -e "${CYAN}🔄 PARALLEL KILL PHASE - Killing all services simultaneously${NC}"
    
    # Start kill jobs for all services in parallel
    for service in "${services[@]}"; do
        if [[ "$(get_service_value "SERVICE_STATUS" "$service")" != "$SERVICE_PENDING" ]]; then
            log_structured "INFO" "parallel_kill" "Starting kill job for service: $service"
            set_service_value "SERVICE_STATUS" "$service" "$SERVICE_KILLING"
            
            # Start background kill job
            (
                case "$service" in
                    "redis")
                        # Kill Redis processes
                        pkill -TERM -f "redis-server" 2>/dev/null || true
                        sleep 2
                        pkill -KILL -f "redis-server" 2>/dev/null || true
                        ;;
                    "backend")
                        # Kill backend processes
                        pkill -TERM -f "uvicorn.*api" 2>/dev/null || true
                        sleep 2
                        pkill -KILL -f "uvicorn.*api" 2>/dev/null || true
                        ;;
                    "worker")
                        # Kill worker processes
                        pkill -TERM -f "dramatiq.*run_agent_background" 2>/dev/null || true
                        sleep 2
                        pkill -KILL -f "dramatiq.*run_agent_background" 2>/dev/null || true
                        ;;
                    "frontend")
                        # Kill frontend processes
                        pkill -TERM -f "node.*next" 2>/dev/null || true
                        sleep 2
                        pkill -KILL -f "node.*next" 2>/dev/null || true
                        ;;
                    "monitor")
                        # Kill monitor processes
                        pkill -TERM -f "enhanced_monitor.sh" 2>/dev/null || true
                        sleep 1
                        pkill -KILL -f "enhanced_monitor.sh" 2>/dev/null || true
                        ;;
                esac
                
                # Mark as killed
                set_service_value "SERVICE_STATUS" "$service" "$SERVICE_KILLED"
                log_structured "INFO" "parallel_kill" "Kill job completed for service: $service"
            ) &
            
            local job_pid=$!
            kill_jobs+=("$job_pid")
            set_service_value "SERVICE_KILL_JOBS" "$service" "$job_pid"
            
            echo -e "   🔄 Started kill job for $service (PID: $job_pid)"
        fi
    done
    
    # Store kill jobs for monitoring
    local jobs_string=$(IFS=','; echo "${kill_jobs[*]}")
    log_structured "INFO" "parallel_kill" "Started ${#kill_jobs[@]} parallel kill jobs: $jobs_string"
    
    return 0
}

# Wait for kill completion with timeout
wait_for_kill_completion() {
    log_structured "INFO" "parallel_dependency_manager" "Waiting for parallel kill completion"
    
    local timeout=$PARALLEL_KILL_TIMEOUT
    local start_time=$(date +%s)
    local services=("redis" "backend" "worker" "frontend" "monitor")
    
    echo -e "${CYAN}⏳ WAITING FOR KILL COMPLETION (timeout: ${timeout}s)${NC}"
    
    while [[ $timeout -gt 0 ]]; do
        local all_killed=true
        local active_jobs=0
        
        # Check if all kill jobs are complete
        for service in "${services[@]}"; do
            local job_pid=$(get_service_value "SERVICE_KILL_JOBS" "$service")
            if [[ -n "$job_pid" ]] && kill -0 "$job_pid" 2>/dev/null; then
                active_jobs=$((active_jobs + 1))
                all_killed=false
            fi
        done
        
        if [[ "$all_killed" == true ]]; then
            local elapsed=$(($(date +%s) - start_time))
            echo -e "${GREEN}✅ All kill jobs completed in ${elapsed}s${NC}"
            log_structured "INFO" "parallel_kill" "All kill jobs completed successfully in ${elapsed}s"
            return 0
        fi
        
        echo -e "   ⏳ Waiting for $active_jobs kill jobs to complete... (${timeout}s remaining)"
        sleep $PROCESS_CHECK_INTERVAL
        timeout=$((timeout - PROCESS_CHECK_INTERVAL))
    done
    
    # Timeout reached
    echo -e "${YELLOW}⚠️ Kill timeout reached, forcing completion${NC}"
    log_structured "WARN" "parallel_kill" "Kill timeout reached after ${PARALLEL_KILL_TIMEOUT}s"
    
    # Force kill any remaining jobs
    for service in "${services[@]}"; do
        local job_pid=$(get_service_value "SERVICE_KILL_JOBS" "$service")
        if [[ -n "$job_pid" ]] && kill -0 "$job_pid" 2>/dev/null; then
            kill -KILL "$job_pid" 2>/dev/null || true
            set_service_value "SERVICE_STATUS" "$service" "$SERVICE_KILLED"
        fi
    done
    
    return 1
}

# Verify kill completion
verify_kill_completion() {
    log_structured "INFO" "parallel_dependency_manager" "Verifying kill completion"
    
    echo -e "${CYAN}🔍 KILL VERIFICATION PHASE${NC}"
    
    local remaining_processes=0
    local process_checks=(
        "redis-server:Redis"
        "uvicorn.*api:Backend"
        "dramatiq.*run_agent_background:Worker"
        "node.*next:Frontend"
        "enhanced_monitor.sh:Monitor"
    )
    
    for check in "${process_checks[@]}"; do
        local pattern=$(echo "$check" | cut -d: -f1)
        local name=$(echo "$check" | cut -d: -f2)
        local count=$(ps aux | grep -E "$pattern" | grep -v grep | wc -l | tr -d ' ')
        
        if [[ $count -gt 0 ]]; then
            echo -e "   ❌ $name: $count processes still running"
            remaining_processes=$((remaining_processes + count))
        else
            echo -e "   ✅ $name: All processes killed"
        fi
    done
    
    if [[ $remaining_processes -eq 0 ]]; then
        echo -e "${GREEN}✅ KILL VERIFICATION PASSED - All processes terminated${NC}"
        log_structured "INFO" "parallel_kill" "Kill verification passed - all processes terminated"
        return 0
    else
        echo -e "${YELLOW}⚠️ KILL VERIFICATION PARTIAL - $remaining_processes processes remain${NC}"
        log_structured "WARN" "parallel_kill" "Kill verification partial - $remaining_processes processes remain"
        return 1
    fi
}

# Calculate dependency waves for parallel startup
calculate_dependency_waves() {
    log_structured "INFO" "parallel_dependency_manager" "Calculating dependency waves for parallel startup"

    local services=("redis" "backend" "worker" "frontend" "monitor")
    local waves=()
    local processed=()
    local wave_num=0

    # Wave 0: Services with no dependencies
    local wave_0=()
    for service in "${services[@]}"; do
        local deps=$(get_service_value "SERVICE_DEPENDENCIES" "$service")
        if [[ -z "$deps" ]]; then
            wave_0+=("$service")
            processed+=("$service")
        fi
    done
    waves[0]="${wave_0[*]}"

    # Subsequent waves: Services whose dependencies are all processed
    while [[ ${#processed[@]} -lt ${#services[@]} ]]; do
        wave_num=$((wave_num + 1))
        local current_wave=()

        for service in "${services[@]}"; do
            # Skip if already processed
            if [[ " ${processed[*]} " =~ " $service " ]]; then
                continue
            fi

            local deps=$(get_service_value "SERVICE_DEPENDENCIES" "$service")
            local all_deps_ready=true

            if [[ -n "$deps" ]]; then
                IFS=',' read -ra dep_array <<< "$deps"
                for dep in "${dep_array[@]}"; do
                    dep=$(echo "$dep" | tr -d ' ')
                    if [[ ! " ${processed[*]} " =~ " $dep " ]]; then
                        all_deps_ready=false
                        break
                    fi
                done
            fi

            if [[ "$all_deps_ready" == true ]]; then
                current_wave+=("$service")
                processed+=("$service")
            fi
        done

        if [[ ${#current_wave[@]} -eq 0 ]]; then
            log_structured "ERROR" "parallel_dependency_manager" "Circular dependency detected"
            return 1
        fi

        waves[$wave_num]="${current_wave[*]}"
    done

    # Output waves
    for i in "${!waves[@]}"; do
        echo "wave_$i:${waves[$i]}"
    done

    log_structured "INFO" "parallel_dependency_manager" "Calculated $((wave_num + 1)) dependency waves"
}

# Start services in a wave (parallel)
start_wave_services() {
    local wave_services=($1)
    local wave_num=$2

    log_structured "INFO" "parallel_start" "Starting wave $wave_num services: ${wave_services[*]}"
    echo -e "${CYAN}🚀 WAVE $wave_num: Starting ${#wave_services[@]} services in parallel${NC}"

    local start_jobs=()

    # Start all services in this wave in parallel
    for service in "${wave_services[@]}"; do
        echo -e "   🔄 Starting $service..."
        set_service_value "SERVICE_STATUS" "$service" "$SERVICE_STARTING"
        set_service_value "SERVICE_START_TIMES" "$service" "$(date +%s)"

        # Start service in background
        (
            case "$service" in
                "redis")
                    # Redis should already be running, just verify
                    if ! redis-cli ping >/dev/null 2>&1; then
                        log_structured "ERROR" "parallel_start" "Redis is not running"
                        set_service_value "SERVICE_STATUS" "$service" "$SERVICE_FAILED"
                        exit 1
                    fi
                    ;;
                "backend")
                    cd "$PROJECT_ROOT/../backend" || exit 1
                    nohup python3 api.py > "$PROJECT_ROOT/../logs/backend.log" 2>&1 &
                    local backend_pid=$!
                    set_service_value "SERVICE_PIDS" "$service" "$backend_pid"
                    ;;
                "worker")
                    cd "$PROJECT_ROOT/../backend" || exit 1
                    nohup uv run dramatiq --processes 4 --threads 4 run_agent_background > "$PROJECT_ROOT/../logs/worker.log" 2>&1 &
                    local worker_pid=$!
                    set_service_value "SERVICE_PIDS" "$service" "$worker_pid"
                    ;;
                "frontend")
                    cd "$PROJECT_ROOT/../frontend" || exit 1
                    nohup npm run dev > "$PROJECT_ROOT/../logs/frontend.log" 2>&1 &
                    local frontend_pid=$!
                    set_service_value "SERVICE_PIDS" "$service" "$frontend_pid"
                    ;;
                "monitor")
                    if [[ -x "$PROJECT_ROOT/../logs/enhanced_monitor.sh" ]]; then
                        nohup "$PROJECT_ROOT/../logs/enhanced_monitor.sh" > "$PROJECT_ROOT/../logs/enhanced_monitor_output.log" 2>&1 &
                        local monitor_pid=$!
                        set_service_value "SERVICE_PIDS" "$service" "$monitor_pid"
                        echo "$monitor_pid" > "$PROJECT_ROOT/../logs/enhanced_monitor.pid"
                    fi
                    ;;
            esac

            # Wait for service to be ready
            local timeout=$(get_service_value "SERVICE_STARTUP_TIMEOUTS" "$service" "30")
            local readiness_check=$(get_service_value "SERVICE_READINESS_CHECKS" "$service")

            if wait_for_service_ready "$service" "$readiness_check" "$timeout"; then
                set_service_value "SERVICE_STATUS" "$service" "$SERVICE_READY"
                log_structured "INFO" "parallel_start" "Service $service started successfully"
            else
                set_service_value "SERVICE_STATUS" "$service" "$SERVICE_FAILED"
                log_structured "ERROR" "parallel_start" "Service $service failed to start"
                exit 1
            fi
        ) &

        local job_pid=$!
        start_jobs+=("$job_pid")
        echo -e "     Started job for $service (PID: $job_pid)"
    done

    # Wait for all services in this wave to complete
    local all_success=true
    for job_pid in "${start_jobs[@]}"; do
        if ! wait "$job_pid"; then
            all_success=false
        fi
    done

    if [[ "$all_success" == true ]]; then
        echo -e "${GREEN}✅ Wave $wave_num completed successfully${NC}"
        log_structured "INFO" "parallel_start" "Wave $wave_num completed successfully"
        return 0
    else
        echo -e "${RED}❌ Wave $wave_num failed${NC}"
        log_structured "ERROR" "parallel_start" "Wave $wave_num failed"
        return 1
    fi
}

# Wait for service to be ready
wait_for_service_ready() {
    local service="$1"
    local readiness_check="$2"
    local timeout="$3"

    local elapsed=0
    while [[ $elapsed -lt $timeout ]]; do
        if [[ -n "$readiness_check" ]] && command -v "$readiness_check" >/dev/null 2>&1; then
            if "$readiness_check" >/dev/null 2>&1; then
                return 0
            fi
        fi

        sleep $PROCESS_CHECK_INTERVAL
        elapsed=$((elapsed + PROCESS_CHECK_INTERVAL))
    done

    return 1
}

# Execute parallel startup sequence
execute_parallel_startup_sequence() {
    log_structured "INFO" "parallel_dependency_manager" "Starting parallel startup sequence"

    echo -e "${CYAN}🎯 PARALLEL STARTUP SEQUENCE${NC}"
    echo -e "${CYAN}============================${NC}"

    # Calculate dependency waves
    local waves_output
    if ! waves_output=$(calculate_dependency_waves); then
        log_structured "ERROR" "parallel_startup" "Failed to calculate dependency waves"
        return 1
    fi

    # Execute each wave
    while IFS= read -r wave_line; do
        if [[ -n "$wave_line" ]]; then
            local wave_num=$(echo "$wave_line" | cut -d: -f1 | sed 's/wave_//')
            local wave_services=$(echo "$wave_line" | cut -d: -f2)

            if ! start_wave_services "$wave_services" "$wave_num"; then
                log_structured "ERROR" "parallel_startup" "Wave $wave_num failed, aborting startup"
                return 1
            fi

            # Brief pause between waves
            sleep 2
        fi
    done <<< "$waves_output"

    echo -e "${GREEN}✅ Parallel startup sequence completed successfully${NC}"
    log_structured "INFO" "parallel_startup" "Parallel startup sequence completed successfully"
    return 0
}

# Enhanced graceful shutdown with parallel operations
parallel_graceful_shutdown() {
    log_structured "INFO" "parallel_dependency_manager" "Initiating parallel graceful shutdown"

    echo -e "${CYAN}🛑 PARALLEL GRACEFUL SHUTDOWN${NC}"
    echo -e "${CYAN}==============================${NC}"

    # Step 1: Parallel kill all services
    if ! parallel_kill_services; then
        log_structured "ERROR" "parallel_shutdown" "Parallel kill failed"
        return 1
    fi

    # Step 2: Wait for kill completion
    if ! wait_for_kill_completion; then
        log_structured "WARN" "parallel_shutdown" "Kill completion timeout"
    fi

    # Step 3: Verify kill completion
    verify_kill_completion

    log_structured "INFO" "parallel_dependency_manager" "Parallel graceful shutdown completed"
    return 0
}

# Get enhanced service status with parallel info
get_parallel_service_status() {
    local service="$1"
    local status=$(get_service_value "SERVICE_STATUS" "$service" "unknown")
    local pid=$(get_service_value "SERVICE_PIDS" "$service" "")
    local start_time=$(get_service_value "SERVICE_START_TIMES" "$service" "0")
    local retry_count=$(get_service_value "SERVICE_RETRY_COUNTS" "$service" "0")

    echo "{\"status\":\"$status\",\"pid\":\"$pid\",\"start_time\":$start_time,\"retries\":$retry_count}"
}

# Export parallel metrics for monitoring
export_parallel_dependency_metrics() {
    local services=("redis" "backend" "worker" "frontend" "monitor")
    local json_parts=()

    for service in "${services[@]}"; do
        local service_status=$(get_parallel_service_status "$service")
        json_parts+=("\"$service\":$service_status")
    done

    local json="{$(IFS=','; echo "${json_parts[*]}")}"
    log_structured "INFO" "parallel_dependency_metrics" "Enhanced service status with parallel info" "$json"
}
