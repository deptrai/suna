#!/bin/bash

# Check Bash version and ensure compatibility
if [ -n "$BASH_VERSION" ]; then
    BASH_MAJOR_VERSION=$(echo "$BASH_VERSION" | cut -d'.' -f1)
    if [ "$BASH_MAJOR_VERSION" -lt 4 ]; then
        echo "Warning: Bash 4.0+ recommended for associative arrays. Using compatibility mode."
        USE_COMPAT_MODE=1
    fi
else
    echo "This script requires Bash to run. Re-executing with bash."
    exec bash "$0" "$@"
fi

# ChainLens Enhanced Health Check Library v2.0
# Enhanced với circuit breaker pattern, retry logic, và smart timeout

# Prevent multiple sourcing
if [[ -n "$ENHANCED_HEALTH_CHECKS_LOADED" ]]; then
    return 0
fi
export ENHANCED_HEALTH_CHECKS_LOADED=1

# Source utilities
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/utils.sh"

# Health check result constants
readonly HEALTH_OK="healthy"
readonly HEALTH_FAIL="unhealthy" 
readonly HEALTH_DEGRADED="degraded"
readonly HEALTH_SKIP="skip"
readonly HEALTH_UNKNOWN="unknown"

# Circuit Breaker Configuration
readonly CIRCUIT_FAILURE_THRESHOLD=5
readonly CIRCUIT_RECOVERY_TIMEOUT=30
readonly CIRCUIT_HALF_OPEN_MAX_CALLS=3

# Circuit breaker states - Bash 3.x compatible implementation
if [ "$USE_COMPAT_MODE" = "1" ]; then
    # Use eval-based approach for Bash 3.x compatibility
    CIRCUIT_STATES_PREFIX="__CIRCUIT_STATES__"
    CIRCUIT_FAILURE_COUNTS_PREFIX="__CIRCUIT_FAILURE_COUNTS__"
    CIRCUIT_LAST_FAILURE_TIME_PREFIX="__CIRCUIT_LAST_FAILURE_TIME__"
    CIRCUIT_HALF_OPEN_CALLS_PREFIX="__CIRCUIT_HALF_OPEN_CALLS__"
else
    # Use associative arrays for Bash 4+
    declare -A CIRCUIT_STATES
    declare -A CIRCUIT_FAILURE_COUNTS
    declare -A CIRCUIT_LAST_FAILURE_TIME
    declare -A CIRCUIT_HALF_OPEN_CALLS
fi

# Helper functions for cross-version compatibility
set_circuit_value() {
    local array_name="$1"
    local key="$2"
    local value="$3"
    
    if [ "$USE_COMPAT_MODE" = "1" ]; then
        eval "${array_name}${key}='$value'"
    else
        case "$array_name" in
            "CIRCUIT_STATES")
                CIRCUIT_STATES["$key"]="$value"
                ;;
            "CIRCUIT_FAILURE_COUNTS")
                CIRCUIT_FAILURE_COUNTS["$key"]="$value"
                ;;
            "CIRCUIT_LAST_FAILURE_TIME")
                CIRCUIT_LAST_FAILURE_TIME["$key"]="$value"
                ;;
            "CIRCUIT_HALF_OPEN_CALLS")
                CIRCUIT_HALF_OPEN_CALLS["$key"]="$value"
                ;;
        esac
    fi
}

get_circuit_value() {
    local array_name="$1"
    local key="$2"
    local default_value="${3:-}"
    
    if [ "$USE_COMPAT_MODE" = "1" ]; then
        local var_name="${array_name}${key}"
        eval "echo \${$var_name:-$default_value}"
    else
        case "$array_name" in
            "CIRCUIT_STATES")
                echo "${CIRCUIT_STATES[$key]:-$default_value}"
                ;;
            "CIRCUIT_FAILURE_COUNTS")
                echo "${CIRCUIT_FAILURE_COUNTS[$key]:-$default_value}"
                ;;
            "CIRCUIT_LAST_FAILURE_TIME")
                echo "${CIRCUIT_LAST_FAILURE_TIME[$key]:-$default_value}"
                ;;
            "CIRCUIT_HALF_OPEN_CALLS")
                echo "${CIRCUIT_HALF_OPEN_CALLS[$key]:-$default_value}"
                ;;
        esac
    fi
}

# Initialize circuit breaker for service
init_circuit_breaker() {
    local service="$1"
    set_circuit_value "CIRCUIT_STATES" "$service" "CLOSED"
    set_circuit_value "CIRCUIT_FAILURE_COUNTS" "$service" "0"
    set_circuit_value "CIRCUIT_LAST_FAILURE_TIME" "$service" "0"
    set_circuit_value "CIRCUIT_HALF_OPEN_CALLS" "$service" "0"
}

# Check circuit breaker state
check_circuit_breaker() {
    local service="$1"
    local current_time=$(date +%s)
    
    # Initialize if not exists
    local current_state=$(get_circuit_value "CIRCUIT_STATES" "$service")
    if [[ -z "$current_state" ]]; then
        init_circuit_breaker "$service"
        current_state="CLOSED"
    fi
    
    case "$current_state" in
        "CLOSED")
            return 0  # Allow calls
            ;;
        "OPEN")
            # Check if recovery timeout has passed
            local last_failure_time=$(get_circuit_value "CIRCUIT_LAST_FAILURE_TIME" "$service" "0")
            local time_diff=$((current_time - last_failure_time))
            if [[ $time_diff -ge $CIRCUIT_RECOVERY_TIMEOUT ]]; then
                set_circuit_value "CIRCUIT_STATES" "$service" "HALF_OPEN"
                set_circuit_value "CIRCUIT_HALF_OPEN_CALLS" "$service" "0"
                log_structured "INFO" "circuit_breaker" "Circuit breaker for $service moved to HALF_OPEN"
                return 0
            fi
            return 1  # Block calls
            ;;
        "HALF_OPEN")
            local half_open_calls=$(get_circuit_value "CIRCUIT_HALF_OPEN_CALLS" "$service" "0")
            if [[ $half_open_calls -lt $CIRCUIT_HALF_OPEN_MAX_CALLS ]]; then
                return 0  # Allow limited calls
            fi
            return 1  # Block additional calls
            ;;
    esac
}

# Record circuit breaker success
record_circuit_success() {
    local service="$1"
    local current_state=$(get_circuit_value "CIRCUIT_STATES" "$service" "CLOSED")
    
    case "$current_state" in
        "CLOSED")
            set_circuit_value "CIRCUIT_FAILURE_COUNTS" "$service" "0"
            ;;
        "HALF_OPEN")
            local current_calls=$(get_circuit_value "CIRCUIT_HALF_OPEN_CALLS" "$service" "0")
            local new_calls=$((current_calls + 1))
            set_circuit_value "CIRCUIT_HALF_OPEN_CALLS" "$service" "$new_calls"
            if [[ $new_calls -ge $CIRCUIT_HALF_OPEN_MAX_CALLS ]]; then
                set_circuit_value "CIRCUIT_STATES" "$service" "CLOSED"
                set_circuit_value "CIRCUIT_FAILURE_COUNTS" "$service" "0"
                log_structured "INFO" "circuit_breaker" "Circuit breaker for $service recovered to CLOSED"
            fi
            ;;
    esac
}

# Record circuit breaker failure
record_circuit_failure() {
    local service="$1"
    local current_time=$(date +%s)
    local current_state=$(get_circuit_value "CIRCUIT_STATES" "$service" "CLOSED")
    
    case "$current_state" in
        "CLOSED")
            local current_failures=$(get_circuit_value "CIRCUIT_FAILURE_COUNTS" "$service" "0")
            local new_failures=$((current_failures + 1))
            set_circuit_value "CIRCUIT_FAILURE_COUNTS" "$service" "$new_failures"
            if [[ $new_failures -ge $CIRCUIT_FAILURE_THRESHOLD ]]; then
                set_circuit_value "CIRCUIT_STATES" "$service" "OPEN"
                set_circuit_value "CIRCUIT_LAST_FAILURE_TIME" "$service" "$current_time"
                log_structured "WARN" "circuit_breaker" "Circuit breaker for $service opened due to failures" "{\"failure_count\":$new_failures}"
            fi
            ;;
        "HALF_OPEN")
            set_circuit_value "CIRCUIT_STATES" "$service" "OPEN"
            set_circuit_value "CIRCUIT_LAST_FAILURE_TIME" "$service" "$current_time"
            log_structured "WARN" "circuit_breaker" "Circuit breaker for $service returned to OPEN"
            ;;
    esac
}

# Enhanced retry logic với exponential backoff
retry_with_backoff() {
    local max_attempts="$1"
    local base_delay="$2"
    local max_delay="$3"
    shift 3
    
    local attempt=1
    local delay="$base_delay"
    
    while [[ $attempt -le $max_attempts ]]; do
        if "$@"; then
            return 0
        fi
        
        if [[ $attempt -lt $max_attempts ]]; then
            log_structured "DEBUG" "retry" "Attempt $attempt failed, retrying in ${delay}s" "{\"attempt\":$attempt,\"max_attempts\":$max_attempts,\"delay\":$delay}"
            sleep "$delay"
            
            # Exponential backoff với jitter
            delay=$(( delay * 2 ))
            if [[ $delay -gt $max_delay ]]; then
                delay="$max_delay"
            fi
            
            # Add jitter (±25%)
            local jitter=$(( delay / 4 ))
            local random_jitter=$(( RANDOM % (jitter * 2 + 1) - jitter ))
            delay=$(( delay + random_jitter ))
            if [[ $delay -lt 1 ]]; then
                delay=1
            fi
        fi
        
        attempt=$((attempt + 1))
    done
    
    return 1
}

# Smart timeout với adaptive timing
smart_timeout() {
    local service="$1"
    local base_timeout="$2"
    local current_state=$(get_circuit_value "CIRCUIT_STATES" "$service" "CLOSED")
    
    # Adjust timeout based on circuit breaker state
    case "$current_state" in
        "OPEN")
            echo 1  # Very short timeout for circuit breaker
            ;;
        "HALF_OPEN")
            echo $((base_timeout / 2))  # Reduced timeout during recovery
            ;;
        *)
            echo "$base_timeout"  # Normal timeout
            ;;
    esac
}

# Enhanced Redis health check với circuit breaker
enhanced_check_redis_health() {
    local service="redis"
    
    # Check circuit breaker
    if ! check_circuit_breaker "$service"; then
        log_structured "DEBUG" "health_check" "Redis health check blocked by circuit breaker"
        echo "$HEALTH_FAIL"
        return 1
    fi
    
    local base_timeout=$(get_config_value "timeouts.api_health_check" "3")
    local timeout=$(smart_timeout "$service" "$base_timeout")
    local current_state=$(get_circuit_value "CIRCUIT_STATES" "$service" "CLOSED")
    
    log_structured "DEBUG" "health_check" "Checking Redis health with enhanced logic" "{\"timeout\":$timeout,\"circuit_state\":\"$current_state\"}"
    
    # Enhanced check với retry logic
    if retry_with_backoff 3 1 2 _check_redis_ping "$timeout"; then
        record_circuit_success "$service"
        echo "$HEALTH_OK"
        return 0
    else
        record_circuit_failure "$service"
        echo "$HEALTH_FAIL"
        return 1
    fi
}

# Internal Redis ping check
_check_redis_ping() {
    local timeout="$1"
    
    if command -v timeout >/dev/null 2>&1; then
        if timeout "$timeout" redis-cli ping 2>/dev/null | grep -q "PONG"; then
            return 0
        fi
    elif command -v perl >/dev/null 2>&1; then
        if perl -e "alarm($timeout); exec('redis-cli', 'ping')" 2>/dev/null | grep -q "PONG"; then
            return 0
        fi
    else
        # Fallback without timeout command
        if redis-cli ping 2>/dev/null | grep -q "PONG"; then
            return 0
        fi
    fi
    return 1
}

# Enhanced Frontend health check với smart detection
enhanced_check_frontend_health() {
    local service="frontend"
    
    if ! check_circuit_breaker "$service"; then
        log_structured "DEBUG" "health_check" "Frontend health check blocked by circuit breaker"
        echo "$HEALTH_FAIL"
        return 1
    fi
    
    local host=$(get_config_value "services.application.frontend.host" "localhost")
    local port=$(get_config_value "services.application.frontend.port" "3000")
    local base_timeout=$(get_config_value "timeouts.api_health_check" "5")
    local timeout=$(smart_timeout "$service" "$base_timeout")
    
    log_structured "DEBUG" "health_check" "Checking Frontend health with enhanced logic" "{\"host\":\"$host\",\"port\":$port,\"timeout\":$timeout}"
    
    # Check if Next.js is in hot-reload state
    if _is_nextjs_compiling "$host" "$port"; then
        log_structured "INFO" "health_check" "Frontend is compiling (Next.js hot reload)"
        echo "$HEALTH_DEGRADED"
        return 0
    fi
    
    # Enhanced check với retry
    if retry_with_backoff 3 1 5 _check_frontend_http "$host" "$port" "$timeout"; then
        record_circuit_success "$service"
        echo "$HEALTH_OK"
        return 0
    else
        record_circuit_failure "$service"
        echo "$HEALTH_FAIL"
        return 1
    fi
}

# Check if Next.js is compiling
_is_nextjs_compiling() {
    local host="$1"
    local port="$2"
    
    # Check for compilation indicators
    local response=$(curl -s --max-time 1 "http://${host}:${port}/" 2>/dev/null || echo "")
    
    if echo "$response" | grep -q "compiling\|bundling\|hot.*reload"; then
        return 0
    fi
    
    return 1
}

# Internal frontend HTTP check
_check_frontend_http() {
    local host="$1"
    local port="$2"
    local timeout="$3"

    local response_code=$(curl -s --max-time "$timeout" -o /dev/null -w "%{http_code}" "http://${host}:${port}/" 2>/dev/null)

    # Accept 200, 404, and 500 (500 means frontend is running but has config issues)
    if [[ "$response_code" == "200" || "$response_code" == "404" || "$response_code" == "500" ]]; then
        return 0
    fi

    return 1
}

# Enhanced Backend health check
enhanced_check_backend_health() {
    local service="backend"
    
    if ! check_circuit_breaker "$service"; then
        log_structured "DEBUG" "health_check" "Backend health check blocked by circuit breaker"
        echo "$HEALTH_FAIL"
        return 1
    fi
    
    local host=$(get_config_value "services.application.backend.host" "127.0.0.1")
    local port=$(get_config_value "services.application.backend.port" "8000")
    local health_endpoint=$(get_config_value "services.application.backend.health_endpoint" "/health")
    local base_timeout=$(get_config_value "timeouts.api_health_check" "5")
    local timeout=$(smart_timeout "$service" "$base_timeout")
    
    log_structured "DEBUG" "health_check" "Checking Backend health with enhanced logic" "{\"host\":\"$host\",\"port\":$port,\"timeout\":$timeout}"
    
    # Try health endpoint first, fallback to root
    if retry_with_backoff 2 1 2 _check_backend_endpoint "$host" "$port" "$health_endpoint" "$timeout"; then
        record_circuit_success "$service"
        echo "$HEALTH_OK"
        return 0
    elif retry_with_backoff 2 1 2 _check_backend_endpoint "$host" "$port" "/" "$timeout"; then
        record_circuit_success "$service"
        echo "$HEALTH_DEGRADED"  # Working but no health endpoint
        return 0
    else
        record_circuit_failure "$service"
        echo "$HEALTH_FAIL"
        return 1
    fi
}

# Internal backend endpoint check
_check_backend_endpoint() {
    local host="$1"
    local port="$2"
    local endpoint="$3"
    local timeout="$4"
    
    local response_code=$(curl -s --max-time "$timeout" -o /dev/null -w "%{http_code}" "http://${host}:${port}${endpoint}" 2>/dev/null)
    
    if [[ "$response_code" =~ ^2[0-9][0-9]$ ]]; then
        return 0
    fi
    
    return 1
}

# Enhanced Worker health check
enhanced_check_worker_health() {
    local service="worker"
    
    if ! check_circuit_breaker "$service"; then
        log_structured "DEBUG" "health_check" "Worker health check blocked by circuit breaker"
        echo "$HEALTH_FAIL"
        return 1
    fi
    
    log_structured "DEBUG" "health_check" "Checking Worker health with enhanced logic"
    
    # Check for main dramatiq processes
    local dramatiq_count=$(ps aux | grep -E "dramatiq.*run_agent_background" | grep -v grep | wc -l)
    local spawn_count=$(ps aux | grep -E "spawn_main" | grep -v grep | wc -l)
    
    # Smart detection - allow reasonable process counts from config
    local max_dramatiq=$(get_config_value "services.application.worker.max_dramatiq_processes" "3")
    local max_total=$(get_config_value "services.application.worker.max_total_processes" "15")
    
    if [[ $dramatiq_count -ge 1 && $dramatiq_count -le $max_dramatiq && $((dramatiq_count + spawn_count)) -le $max_total ]]; then
        record_circuit_success "$service"
        log_structured "DEBUG" "health_check" "Worker processes healthy" "{\"dramatiq\":$dramatiq_count,\"spawn\":$spawn_count}"
        echo "$HEALTH_OK"
        return 0
    elif [[ $dramatiq_count -gt $max_dramatiq ]]; then
        record_circuit_failure "$service"
        log_structured "WARN" "health_check" "Too many dramatiq processes" "{\"count\":$dramatiq_count,\"max\":$max_dramatiq}"
        echo "$HEALTH_DEGRADED"
        return 1
    else
        record_circuit_failure "$service"
        log_structured "ERROR" "health_check" "No worker processes found" "{\"dramatiq\":$dramatiq_count,\"spawn\":$spawn_count}"
        echo "$HEALTH_FAIL"
        return 1
    fi
}

# Enhanced Supabase health check với graceful fallback
enhanced_check_supabase_health() {
    local service="supabase"
    
    # Supabase is optional - don't use circuit breaker for blocking
    local host=$(get_config_value "services.infrastructure.supabase.host" "localhost")
    local port=$(get_config_value "services.infrastructure.supabase.port" "54321")
    local endpoint=$(get_config_value "services.infrastructure.supabase.health_endpoint" "/rest/v1/")
    local timeout=$(get_config_value "timeouts.api_health_check" "3")
    
    log_structured "DEBUG" "health_check" "Checking Supabase health (optional service)"
    
    # Quick check with single retry
    if retry_with_backoff 2 1 1 _check_supabase_endpoint "$host" "$port" "$endpoint" "$timeout"; then
        echo "$HEALTH_OK"
        return 0
    else
        log_structured "WARN" "health_check" "Supabase not available (optional service)"
        echo "$HEALTH_SKIP"
        return 1
    fi
}

# Internal Supabase endpoint check
_check_supabase_endpoint() {
    local host="$1"
    local port="$2"
    local endpoint="$3"
    local timeout="$4"
    
    if curl -s --max-time "$timeout" "http://${host}:${port}${endpoint}" 2>/dev/null | grep -q "swagger\|openapi"; then
        return 0
    fi
    
    return 1
}

# Get circuit breaker status for monitoring
get_circuit_breaker_status() {
    local service="$1"
    if [[ -n "${CIRCUIT_STATES[$service]}" ]]; then
        echo "${CIRCUIT_STATES[$service]}"
    else
        echo "UNKNOWN"
    fi
}

# Export circuit breaker metrics
export_circuit_breaker_metrics() {
    for service in "${!CIRCUIT_STATES[@]}"; do
        log_structured "INFO" "circuit_breaker_metrics" "Circuit breaker status" "{\"service\":\"$service\",\"state\":\"${CIRCUIT_STATES[$service]}\",\"failure_count\":${CIRCUIT_FAILURE_COUNTS[$service]},\"half_open_calls\":${CIRCUIT_HALF_OPEN_CALLS[$service]}}"
    done
}

# Wrapper functions for enhanced health checks
check_redis_health_enhanced() {
    enhanced_check_redis_health
}

check_frontend_health_enhanced() {
    enhanced_check_frontend_health
}

check_backend_health_enhanced() {
    enhanced_check_backend_health
}

check_worker_health_enhanced() {
    enhanced_check_worker_health
}

check_supabase_health_enhanced() {
    enhanced_check_supabase_health
}