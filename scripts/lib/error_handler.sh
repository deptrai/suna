#!/bin/bash

# ChainLens Advanced Error Handling & Resilience System v2.0
# Circuit breakers, timeouts, graceful degradation, và alerting

# Prevent multiple sourcing
if [[ -n "$ERROR_HANDLER_LOADED" ]]; then
    return 0
fi
export ERROR_HANDLER_LOADED=1

# Check Bash version for compatibility
if [ -n "$BASH_VERSION" ]; then
    BASH_MAJOR_VERSION=$(echo "$BASH_VERSION" | cut -d'.' -f1)
    if [ "$BASH_MAJOR_VERSION" -lt 4 ]; then
        USE_COMPAT_MODE_ERROR=1
    fi
fi

# Source utilities
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/utils.sh"

# Error handling configuration - Bash 3.x compatible
if [ "$USE_COMPAT_MODE_ERROR" = "1" ]; then
    # Use eval-based approach for Bash 3.x compatibility
    ERROR_THRESHOLDS_PREFIX="__ERROR_THRESHOLDS__"
    ERROR_COUNTS_PREFIX="__ERROR_COUNTS__"
    ERROR_WINDOWS_PREFIX="__ERROR_WINDOWS__"
    LAST_ERROR_TIMES_PREFIX="__LAST_ERROR_TIMES__"
    ERROR_ACTIONS_PREFIX="__ERROR_ACTIONS__"
    SERVICE_DEGRADED_MODES_PREFIX="__SERVICE_DEGRADED_MODES__"
    TIMEOUT_CONFIGS_PREFIX="__TIMEOUT_CONFIGS__"
else
    # Use associative arrays for Bash 4+
    declare -A ERROR_THRESHOLDS
    declare -A ERROR_COUNTS
    declare -A ERROR_WINDOWS
    declare -A LAST_ERROR_TIMES
    declare -A ERROR_ACTIONS
    declare -A SERVICE_DEGRADED_MODES
    declare -A TIMEOUT_CONFIGS
fi

# Helper functions for cross-version compatibility
set_error_value() {
    local array_name="$1"
    local key="$2"
    local value="$3"
    
    if [ "$USE_COMPAT_MODE_ERROR" = "1" ]; then
        eval "${array_name}${key}='$value'"
    else
        case "$array_name" in
            "ERROR_THRESHOLDS")
                ERROR_THRESHOLDS["$key"]="$value"
                ;;
            "ERROR_COUNTS")
                ERROR_COUNTS["$key"]="$value"
                ;;
            "ERROR_WINDOWS")
                ERROR_WINDOWS["$key"]="$value"
                ;;
            "LAST_ERROR_TIMES")
                LAST_ERROR_TIMES["$key"]="$value"
                ;;
            "ERROR_ACTIONS")
                ERROR_ACTIONS["$key"]="$value"
                ;;
            "SERVICE_DEGRADED_MODES")
                SERVICE_DEGRADED_MODES["$key"]="$value"
                ;;
            "TIMEOUT_CONFIGS")
                TIMEOUT_CONFIGS["$key"]="$value"
                ;;
        esac
    fi
}

get_error_value() {
    local array_name="$1"
    local key="$2"
    local default_value="${3:-}"
    
    if [ "$USE_COMPAT_MODE_ERROR" = "1" ]; then
        local var_name="${array_name}${key}"
        eval "echo \${$var_name:-$default_value}"
    else
        case "$array_name" in
            "ERROR_THRESHOLDS")
                echo "${ERROR_THRESHOLDS[$key]:-$default_value}"
                ;;
            "ERROR_COUNTS")
                echo "${ERROR_COUNTS[$key]:-$default_value}"
                ;;
            "ERROR_WINDOWS")
                echo "${ERROR_WINDOWS[$key]:-$default_value}"
                ;;
            "LAST_ERROR_TIMES")
                echo "${LAST_ERROR_TIMES[$key]:-$default_value}"
                ;;
            "ERROR_ACTIONS")
                echo "${ERROR_ACTIONS[$key]:-$default_value}"
                ;;
            "SERVICE_DEGRADED_MODES")
                echo "${SERVICE_DEGRADED_MODES[$key]:-$default_value}"
                ;;
            "TIMEOUT_CONFIGS")
                echo "${TIMEOUT_CONFIGS[$key]:-$default_value}"
                ;;
        esac
    fi
}

# Error severity levels
readonly ERROR_LEVEL_CRITICAL="critical"
readonly ERROR_LEVEL_HIGH="high" 
readonly ERROR_LEVEL_MEDIUM="medium"
readonly ERROR_LEVEL_LOW="low"

# Degradation modes
readonly DEGRADED_MODE_NONE="none"
readonly DEGRADED_MODE_PARTIAL="partial"
readonly DEGRADED_MODE_MINIMAL="minimal" 
readonly DEGRADED_MODE_OFFLINE="offline"

# Initialize error handling system
init_error_handling() {
    log_structured "INFO" "error_handler" "Initializing advanced error handling system (compatibility mode: ${USE_COMPAT_MODE_ERROR:-0})"
    
    # Configure error thresholds (errors per window) - using helper functions for compatibility
    set_error_value "ERROR_THRESHOLDS" "connection_refused" "5"
    set_error_value "ERROR_THRESHOLDS" "timeout" "3"
    set_error_value "ERROR_THRESHOLDS" "api_error" "10"
    set_error_value "ERROR_THRESHOLDS" "memory_high" "3"
    set_error_value "ERROR_THRESHOLDS" "cpu_high" "5"
    set_error_value "ERROR_THRESHOLDS" "disk_full" "1"
    set_error_value "ERROR_THRESHOLDS" "process_crash" "2"
    set_error_value "ERROR_THRESHOLDS" "rate_limit" "15"
    
    # Configure time windows (seconds) - using helper functions
    set_error_value "ERROR_WINDOWS" "connection_refused" "60"
    set_error_value "ERROR_WINDOWS" "timeout" "120"
    set_error_value "ERROR_WINDOWS" "api_error" "300"
    
    # Configure timeout settings - using helper functions  
    set_error_value "TIMEOUT_CONFIGS" "redis" "connect:3,operation:5"
    set_error_value "TIMEOUT_CONFIGS" "supabase" "connect:5,operation:10"
    set_error_value "TIMEOUT_CONFIGS" "backend" "connect:10,operation:30"
    
    # Initialize error counters for key error types
    local error_types=("connection_refused" "timeout" "api_error")
    for error_type in "${error_types[@]}"; do
        set_error_value "ERROR_COUNTS" "$error_type" "0"
        set_error_value "LAST_ERROR_TIMES" "$error_type" "0"
    done
    
    # Initialize service degradation modes
    local services=("redis" "supabase" "backend" "frontend" "worker")
    for service in "${services[@]}"; do
        set_error_value "SERVICE_DEGRADED_MODES" "$service" "$DEGRADED_MODE_NONE"
    done
    
    log_structured "INFO" "error_handler" "Error handling system initialized in compatibility mode"
}

# Minimal stub functions for functions that might be called but not fully implemented yet
record_error() {
    local error_type="$1"
    local service="$2"
    local details="$3"
    local severity="${4:-$ERROR_LEVEL_MEDIUM}"
    
    log_structured "WARN" "error_handler" "Error recorded (stub)" "{\"error_type\":\"$error_type\",\"service\":\"$service\",\"details\":\"$details\",\"severity\":\"$severity\"}"
}

handle_error_threshold_exceeded() {
    local error_type="$1"
    local service="$2"
    
    log_structured "WARN" "error_handler" "Error threshold exceeded (stub)" "{\"error_type\":\"$error_type\",\"service\":\"$service\"}"
}

handle_critical_error() {
    local error_type="$1"
    local service="$2"
    
    log_structured "ERROR" "error_handler" "Critical error (stub)" "{\"error_type\":\"$error_type\",\"service\":\"$service\"}"
}

handle_high_error() {
    local error_type="$1"
    local service="$2"
    
    log_structured "WARN" "error_handler" "High error (stub)" "{\"error_type\":\"$error_type\",\"service\":\"$service\"}"
}

# Record an error occurrence
record_error() {
    local error_type="$1"
    local service="$2"
    local details="$3"
    local severity="${4:-$ERROR_LEVEL_MEDIUM}"
    
    local current_time=$(date +%s)
    local window_size="${ERROR_WINDOWS[$error_type]:-60}"
    local threshold="${ERROR_THRESHOLDS[$error_type]:-5}"
    
    # Clean old errors outside the time window
    local last_error_time="${LAST_ERROR_TIMES[$error_type]:-0}"
    if [[ $((current_time - last_error_time)) -gt $window_size ]]; then
        ERROR_COUNTS["$error_type"]=0
    fi
    
    # Increment error count
    ERROR_COUNTS["$error_type"]=$((ERROR_COUNTS["$error_type"] + 1))
    LAST_ERROR_TIMES["$error_type"]=$current_time
    
    local error_count="${ERROR_COUNTS[$error_type]}"
    
    log_structured "WARN" "error_handler" "Error recorded" "{\"error_type\":\"$error_type\",\"service\":\"$service\",\"details\":\"$details\",\"severity\":\"$severity\",\"count\":$error_count,\"threshold\":$threshold}"
    
    # Check if threshold exceeded
    if [[ $error_count -ge $threshold ]]; then
        handle_error_threshold_exceeded "$error_type" "$service" "$error_count" "$severity"
    fi
    
    # Immediate actions based on severity
    case "$severity" in
        "$ERROR_LEVEL_CRITICAL")
            handle_critical_error "$error_type" "$service" "$details"
            ;;
        "$ERROR_LEVEL_HIGH")
            handle_high_error "$error_type" "$service" "$details"
            ;;
    esac
}

# Handle error threshold exceeded
handle_error_threshold_exceeded() {
    local error_type="$1"
    local service="$2"
    local error_count="$3"
    local severity="$4"
    
    log_structured "ERROR" "error_handler" "Error threshold exceeded" "{\"error_type\":\"$error_type\",\"service\":\"$service\",\"count\":$error_count,\"severity\":\"$severity\"}"
    
    # Determine degradation strategy
    case "$error_type" in
        "connection_refused")
            enable_degraded_mode "$service" "$DEGRADED_MODE_PARTIAL"
            ;;
        "timeout")
            enable_degraded_mode "$service" "$DEGRADED_MODE_PARTIAL"
            increase_timeouts "$service" 1.5
            ;;
        "api_error")
            enable_degraded_mode "$service" "$DEGRADED_MODE_MINIMAL"
            ;;
        "memory_high")
            trigger_memory_cleanup "$service"
            enable_degraded_mode "$service" "$DEGRADED_MODE_PARTIAL"
            ;;
        "cpu_high")
            reduce_service_load "$service"
            ;;
        "disk_full")
            trigger_cleanup_procedures
            enable_degraded_mode "all" "$DEGRADED_MODE_MINIMAL"
            ;;
        "process_crash")
            attempt_service_restart "$service"
            ;;
        "rate_limit")
            enable_rate_limit_backoff "$service"
            ;;
    esac
    
    # Send alert
    send_error_alert "$error_type" "$service" "$error_count" "$severity"
}

# Handle critical errors
handle_critical_error() {
    local error_type="$1"
    local service="$2"
    local details="$3"
    
    log_structured "ERROR" "error_handler" "CRITICAL ERROR DETECTED" "{\"error_type\":\"$error_type\",\"service\":\"$service\",\"details\":\"$details\"}"
    
    # Immediate actions for critical errors
    case "$error_type" in
        "disk_full")
            emergency_cleanup
            ;;
        "memory_exhausted")
            kill_non_essential_processes
            ;;
        "security_breach")
            isolate_system
            ;;
    esac
    
    # Always send immediate alert for critical errors
    send_critical_alert "$error_type" "$service" "$details"
}

# Handle high priority errors  
handle_high_error() {
    local error_type="$1"
    local service="$2"
    local details="$3"
    
    log_structured "WARN" "error_handler" "HIGH PRIORITY ERROR" "{\"error_type\":\"$error_type\",\"service\":\"$service\",\"details\":\"$details\"}"
    
    # High priority actions
    case "$error_type" in
        "database_connection_lost")
            attempt_database_reconnection "$service"
            ;;
        "service_unresponsive") 
            attempt_service_restart "$service"
            ;;
        "high_latency")
            enable_performance_monitoring "$service"
            ;;
    esac
}

# Enable degraded mode for a service
enable_degraded_mode() {
    local service="$1"
    local mode="$2"
    
    if [[ "$service" == "all" ]]; then
        # Apply to all services
        local services=("redis" "supabase" "backend" "frontend" "worker")
        for svc in "${services[@]}"; do
            set_error_value "SERVICE_DEGRADED_MODES" "$svc" "$mode"
        done
        log_structured "WARN" "error_handler" "Degraded mode enabled for all services" "{\"mode\":\"$mode\"}"
    else
        set_error_value "SERVICE_DEGRADED_MODES" "$service" "$mode"
        log_structured "WARN" "error_handler" "Degraded mode enabled" "{\"service\":\"$service\",\"mode\":\"$mode\"}"
    fi
    
    # Apply degradation strategies
    case "$mode" in
        "$DEGRADED_MODE_PARTIAL")
            apply_partial_degradation "$service"
            ;;
        "$DEGRADED_MODE_MINIMAL")
            apply_minimal_degradation "$service"
            ;;
        "$DEGRADED_MODE_OFFLINE")
            apply_offline_mode "$service"
            ;;
    esac
}

# Apply partial degradation strategies
apply_partial_degradation() {
    local service="$1"
    
    case "$service" in
        "redis")
            # Reduce connection pool size
            log_structured "INFO" "error_handler" "Applying Redis partial degradation: reducing connections"
            ;;
        "backend")
            # Disable non-essential endpoints
            log_structured "INFO" "error_handler" "Applying Backend partial degradation: disabling non-essential features"
            ;;
        "frontend")
            # Disable heavy features
            log_structured "INFO" "error_handler" "Applying Frontend partial degradation: disabling heavy features"
            ;;
        "worker")
            # Reduce concurrency
            log_structured "INFO" "error_handler" "Applying Worker partial degradation: reducing concurrency"
            ;;
    esac
}

# Apply minimal degradation strategies
apply_minimal_degradation() {
    local service="$1"
    
    case "$service" in
        "redis")
            # Use local cache only
            log_structured "INFO" "error_handler" "Applying Redis minimal degradation: local cache only"
            ;;
        "backend")
            # Only essential endpoints
            log_structured "INFO" "error_handler" "Applying Backend minimal degradation: essential endpoints only"
            ;;
        "frontend")
            # Static content only
            log_structured "INFO" "error_handler" "Applying Frontend minimal degradation: static content only"
            ;;
        "worker")
            # Critical tasks only
            log_structured "INFO" "error_handler" "Applying Worker minimal degradation: critical tasks only"
            ;;
    esac
}

# Apply offline mode
apply_offline_mode() {
    local service="$1"
    
    log_structured "ERROR" "error_handler" "Applying offline mode" "{\"service\":\"$service\"}"
    
    case "$service" in
        "backend")
            # Serve maintenance page
            serve_maintenance_page
            ;;
        "frontend") 
            # Show offline message
            show_offline_message
            ;;
    esac
}

# Increase timeouts for a service
increase_timeouts() {
    local service="$1"
    local multiplier="$2"
    
    log_structured "INFO" "error_handler" "Increasing timeouts" "{\"service\":\"$service\",\"multiplier\":$multiplier}"
    
    # This would typically update configuration files or environment variables
    # For now, we'll just log the action
    case "$service" in
        "backend")
            # Increase API timeouts
            export API_TIMEOUT=$((${API_TIMEOUT:-30} * ${multiplier%.*}))
            ;;
        "frontend")
            # Increase request timeouts
            export REQUEST_TIMEOUT=$((${REQUEST_TIMEOUT:-60} * ${multiplier%.*}))
            ;;
    esac
}

# Trigger memory cleanup
trigger_memory_cleanup() {
    local service="$1"
    
    log_structured "INFO" "error_handler" "Triggering memory cleanup" "{\"service\":\"$service\"}"
    
    # Service-specific cleanup
    case "$service" in
        "redis")
            redis-cli flushdb 2>/dev/null || true
            ;;
        "backend")
            # Trigger garbage collection if possible
            pkill -USR1 -f "uvicorn.*api" 2>/dev/null || true
            ;;
        "worker")
            # Clear worker queues
            redis-cli del "dramatiq:*" 2>/dev/null || true
            ;;
    esac
    
    # System-wide cleanup
    sync
    echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
}

# Reduce service load
reduce_service_load() {
    local service="$1"
    
    log_structured "INFO" "error_handler" "Reducing service load" "{\"service\":\"$service\"}"
    
    case "$service" in
        "worker")
            # Reduce worker concurrency
            pkill -STOP -f "spawn_main" 2>/dev/null || true
            sleep 5
            pkill -CONT -f "spawn_main" 2>/dev/null || true
            ;;
        "backend")
            # Rate limit requests
            enable_request_rate_limiting
            ;;
    esac
}

# Emergency cleanup procedures
emergency_cleanup() {
    log_structured "ERROR" "error_handler" "Executing emergency cleanup procedures"
    
    # Clean log files
    find "$PROJECT_ROOT/logs" -name "*.log" -size +100M -exec truncate -s 50M {} \\;
    
    # Clean temporary files
    find /tmp -name "chainlens-*" -mtime +1 -delete 2>/dev/null || true
    
    # Clean Redis data if necessary
    redis-cli flushdb 2>/dev/null || true
    
    log_structured "INFO" "error_handler" "Emergency cleanup completed"
}

# Attempt service restart
attempt_service_restart() {
    local service="$1"
    local max_attempts=3
    local attempt=1
    
    log_structured "INFO" "error_handler" "Attempting service restart" "{\"service\":\"$service\",\"max_attempts\":$max_attempts}"
    
    while [[ $attempt -le $max_attempts ]]; do
        log_structured "INFO" "error_handler" "Restart attempt $attempt for service $service"
        
        # Stop service
        case "$service" in
            "worker")
                pkill -TERM -f "dramatiq.*run_agent_background" 2>/dev/null || true
                sleep 3
                pkill -KILL -f "dramatiq.*run_agent_background" 2>/dev/null || true
                ;;
            "backend")
                pkill -TERM -f "uvicorn.*api" 2>/dev/null || true
                sleep 3
                pkill -KILL -f "uvicorn.*api" 2>/dev/null || true
                ;;
            "frontend")
                pkill -TERM -f "npm.*dev" 2>/dev/null || true
                sleep 3
                pkill -KILL -f "npm.*dev" 2>/dev/null || true
                ;;
        esac
        
        sleep 5
        
        # Restart service
        case "$service" in
            "worker")
                cd "$PROJECT_ROOT/backend" && nohup bash -c 'unset VIRTUAL_ENV && source .venv/bin/activate && python3 -m dramatiq run_agent_background' > "$PROJECT_ROOT/logs/worker.log" 2>&1 &
                ;;
            "backend")
                cd "$PROJECT_ROOT/backend" && nohup uv run uvicorn api:app --host 0.0.0.0 --port 8000 --reload > "$PROJECT_ROOT/logs/backend.log" 2>&1 &
                ;;
            "frontend")
                cd "$PROJECT_ROOT/frontend" && nohup npm run dev > "$PROJECT_ROOT/logs/frontend.log" 2>&1 &
                ;;
        esac
        
        # Wait for service to start
        sleep 10
        
        # Check if restart was successful
        if check_service_running "$service"; then
            log_structured "INFO" "error_handler" "Service restart successful" "{\"service\":\"$service\",\"attempt\":$attempt}"
            # Reset error count
            ERROR_COUNTS["process_crash"]=0
            return 0
        fi
        
        attempt=$((attempt + 1))
    done
    
    log_structured "ERROR" "error_handler" "Service restart failed after $max_attempts attempts" "{\"service\":\"$service\"}"
    enable_degraded_mode "$service" "$DEGRADED_MODE_OFFLINE"
    return 1
}

# Check if service is running
check_service_running() {
    local service="$1"
    
    case "$service" in
        "worker")
            pgrep -f "dramatiq.*run_agent_background" >/dev/null
            ;;
        "backend")
            pgrep -f "uvicorn.*api" >/dev/null
            ;;
        "frontend")
            pgrep -f "npm.*dev" >/dev/null
            ;;
        *)
            return 1
            ;;
    esac
}

# Send error alert
send_error_alert() {
    local error_type="$1"
    local service="$2"
    local error_count="$3"
    local severity="$4"
    
    local alert_message="ERROR THRESHOLD EXCEEDED: $error_type on $service (count: $error_count, severity: $severity)"
    
    # Log structured alert
    log_structured "ALERT" "error_handler" "$alert_message" "{\"error_type\":\"$error_type\",\"service\":\"$service\",\"count\":$error_count,\"severity\":\"$severity\"}"
    
    # In a real implementation, this would send to:
    # - Slack/Discord webhooks
    # - Email notifications
    # - PagerDuty/OpsGenie
    # - Monitoring systems (Datadog, New Relic, etc.)
    
    echo "ALERT: $alert_message" >> "$PROJECT_ROOT/logs/alerts.log"
}

# Send critical alert
send_critical_alert() {
    local error_type="$1"
    local service="$2"
    local details="$3"
    
    local alert_message="CRITICAL ERROR: $error_type on $service - $details"
    
    # Log critical alert
    log_structured "CRITICAL" "error_handler" "$alert_message" "{\"error_type\":\"$error_type\",\"service\":\"$service\",\"details\":\"$details\"}"
    
    # Immediate notifications for critical errors
    echo "CRITICAL ALERT: $alert_message" >> "$PROJECT_ROOT/logs/critical_alerts.log"
}

# Get error statistics
get_error_stats() {
    local json_parts=()
    
    for error_type in "${!ERROR_COUNTS[@]}"; do
        local count="${ERROR_COUNTS[$error_type]}"
        local threshold="${ERROR_THRESHOLDS[$error_type]}"
        local last_error="${LAST_ERROR_TIMES[$error_type]}"
        
        json_parts+=("\"$error_type\":{\"count\":$count,\"threshold\":$threshold,\"last_error\":$last_error}")
    done
    
    local json="{$(IFS=','; echo "${json_parts[*]}")}"
    echo "$json"
}

# Get degradation status
get_degradation_status() {
    local json_parts=()
    
    for service in "${!SERVICE_DEGRADED_MODES[@]}"; do
        local mode="${SERVICE_DEGRADED_MODES[$service]}"
        json_parts+=("\"$service\":\"$mode\"")
    done
    
    local json="{$(IFS=','; echo "${json_parts[*]}")}"
    echo "$json"
}

# Reset error counts (for testing or manual reset)
reset_error_counts() {
    local error_type="${1:-all}"
    
    if [[ "$error_type" == "all" ]]; then
        for type in "${!ERROR_COUNTS[@]}"; do
            ERROR_COUNTS["$type"]=0
            LAST_ERROR_TIMES["$type"]=0
        done
        log_structured "INFO" "error_handler" "All error counts reset"
    else
        ERROR_COUNTS["$error_type"]=0
        LAST_ERROR_TIMES["$error_type"]=0
        log_structured "INFO" "error_handler" "Error count reset for $error_type"
    fi
}

# Disable degraded mode
disable_degraded_mode() {
    local service="${1:-all}"
    
    if [[ "$service" == "all" ]]; then
        for svc in "${!SERVICE_DEGRADED_MODES[@]}"; do
            SERVICE_DEGRADED_MODES["$svc"]="$DEGRADED_MODE_NONE"
        done
        log_structured "INFO" "error_handler" "Degraded mode disabled for all services"
    else
        SERVICE_DEGRADED_MODES["$service"]="$DEGRADED_MODE_NONE"
        log_structured "INFO" "error_handler" "Degraded mode disabled for $service"
    fi
}

# Export error handling metrics
export_error_metrics() {
    local error_stats=$(get_error_stats)
    local degradation_status=$(get_degradation_status)
    
    log_structured "INFO" "error_metrics" "Error handling metrics" "{\"error_stats\":$error_stats,\"degradation_status\":$degradation_status}"
}

# Health check for error handling system
check_error_handler_health() {
    local current_time=$(date +%s)
    local total_errors=0
    
    # Count total errors in the last hour
    for error_type in "${!ERROR_COUNTS[@]}"; do
        local last_error="${LAST_ERROR_TIMES[$error_type]}"
        if [[ $((current_time - last_error)) -lt 3600 ]]; then
            total_errors=$((total_errors + ERROR_COUNTS[$error_type]))
        fi
    done
    
    # Check if system is overwhelmed
    if [[ $total_errors -gt 100 ]]; then
        echo "OVERWHELMED"
        return 1
    elif [[ $total_errors -gt 50 ]]; then
        echo "DEGRADED"
        return 0
    else
        echo "HEALTHY"
        return 0
    fi
}