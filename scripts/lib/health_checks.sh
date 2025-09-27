#!/bin/bash

# ChainLens Development Scripts - Health Check Library
# Thư viện kiểm tra sức khỏe hệ thống

# Source utilities
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/utils.sh"

# Health check result constants - Only set if not already defined
if [[ -z "$HEALTH_OK" ]]; then
    readonly HEALTH_OK="healthy"
    readonly HEALTH_FAIL="unhealthy"
    readonly HEALTH_SKIP="skip"
    readonly HEALTH_UNKNOWN="unknown"
fi

# Check infrastructure services (Kiểm tra dịch vụ hạ tầng)
check_redis_health() {
    local timeout=$(get_config_value "timeouts.api_health_check" "3")
    validate_timeout "$timeout" || return 1

    log_structured "DEBUG" "health_check" "Checking Redis health"

    # Use perl for timeout on macOS (more portable than timeout command)
    if command -v perl >/dev/null 2>&1; then
        if perl -e "alarm($timeout); exec('redis-cli', 'ping')" 2>/dev/null | grep -q "PONG"; then
            echo "$HEALTH_OK"
            return 0
        fi
    else
        # Fallback without timeout
        if redis-cli ping 2>/dev/null | grep -q "PONG"; then
            echo "$HEALTH_OK"
            return 0
        fi
    fi

    log_structured "ERROR" "redis" "Connection refused"
    echo "$HEALTH_FAIL"
    return 1
}

check_supabase_health() {
    local host=$(get_config_value "services.infrastructure.supabase.host" "localhost")
    local port=$(get_config_value "services.infrastructure.supabase.port" "54321")
    local endpoint=$(get_config_value "services.infrastructure.supabase.health_endpoint" "/rest/v1/")
    local timeout=$(get_config_value "timeouts.api_health_check" "3")

    validate_timeout "$timeout" || return 1
    validate_port "$port" || return 1

    local url="http://${host}:${port}${endpoint}"
    log_structured "DEBUG" "health_check" "Checking Supabase health at $url"

    # Simple curl check (timeout handled by curl itself)
    if curl -s --max-time "$timeout" "$url" 2>/dev/null | grep -q "swagger"; then
        echo "$HEALTH_OK"
        return 0
    fi

    log_structured "ERROR" "supabase" "Connection refused"
    echo "$HEALTH_FAIL"
    return 1
}

# Check application services (Kiểm tra dịch vụ ứng dụng)
check_frontend_health() {
    local host=$(get_config_value "services.application.frontend.host" "localhost")
    local port=$(get_config_value "services.application.frontend.port" "3000")
    local endpoint=$(get_config_value "services.application.frontend.health_endpoint" "/")
    local timeout=$(get_config_value "timeouts.api_health_check" "3")
    
    validate_timeout "$timeout" || return 1
    validate_port "$port" || return 1
    
    local url="http://${host}:${port}${endpoint}"
    log_structured "DEBUG" "health_check" "Checking Frontend health at $url"
    
    local response_code=$(curl -s --max-time "$timeout" -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
    
    if [[ "$response_code" == "200" ]]; then
        echo "$HEALTH_OK"
        return 0
    elif [[ "$response_code" == "000" ]]; then
        # Connection refused - could be hot reload, try once more
        sleep 1
        response_code=$(curl -s --max-time 2 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
        if [[ "$response_code" == "200" ]]; then
            echo "$HEALTH_OK"
            return 0
        fi
        handle_service_error "frontend" "connection_refused"
    else
        handle_service_error "frontend" "not_found" "HTTP $response_code"
    fi
    
    echo "$HEALTH_FAIL"
    return 1
}

check_backend_health() {
    local host=$(get_config_value "services.application.backend.host" "127.0.0.1")
    local port=$(get_config_value "services.application.backend.port" "8000")
    local endpoint=$(get_config_value "services.application.backend.health_endpoint" "/api/health")
    local timeout=$(get_config_value "timeouts.api_health_check" "3")
    
    validate_timeout "$timeout" || return 1
    validate_port "$port" || return 1
    
    local url="http://${host}:${port}${endpoint}"
    log_structured "DEBUG" "health_check" "Checking Backend health at $url"
    
    local response=$(curl -s --max-time "$timeout" "$url" 2>/dev/null)
    local response_code=$(curl -s --max-time "$timeout" -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
    
    if [[ "$response_code" == "200" ]]; then
        # Try to parse JSON response for more detailed health info
        if command -v jq >/dev/null 2>&1 && echo "$response" | jq -e '.status' >/dev/null 2>&1; then
            local status=$(echo "$response" | jq -r '.status')
            if [[ "$status" == "healthy" || "$status" == "ok" ]]; then
                echo "$HEALTH_OK"
                return 0
            fi
        else
            echo "$HEALTH_OK"
            return 0
        fi
    elif [[ "$response_code" == "000" ]]; then
        handle_service_error "backend" "connection_refused"
    else
        handle_service_error "backend" "not_found" "HTTP $response_code"
    fi
    
    echo "$HEALTH_FAIL"
    return 1
}

check_worker_health() {
    local pattern=$(get_config_value "services.application.worker.process_pattern" "dramatiq.*run_agent_background")
    local max_processes=$(get_config_value "services.application.worker.max_processes" "3")
    
    log_structured "DEBUG" "health_check" "Checking Worker health (pattern: $pattern)"
    
    local process_count=$(get_process_count "$pattern")
    
    if [[ "$process_count" -gt 0 && "$process_count" -le "$max_processes" ]]; then
        echo "$HEALTH_OK"
        return 0
    elif [[ "$process_count" -eq 0 ]]; then
        handle_service_error "worker" "not_found" "No worker processes found"
        echo "$HEALTH_FAIL"
        return 1
    else
        handle_service_error "worker" "process_conflict" "Too many worker processes: $process_count (max: $max_processes)"
        echo "$HEALTH_FAIL"
        return 1
    fi
}

# Check external services (Kiểm tra dịch vụ bên ngoài)
check_external_service() {
    local service_name="$1"
    local api_key_var="$2"
    local timeout=$(get_config_value "timeouts.external_service" "5")
    
    validate_timeout "$timeout" || return 1
    
    # Skip if API key is not set or is test key
    local api_key="${!api_key_var}"
    if [[ -z "$api_key" || "$api_key" == "test-key" ]]; then
        log_structured "DEBUG" "health_check" "Skipping $service_name (no API key)"
        echo "$HEALTH_SKIP"
        return 0
    fi
    
    log_structured "DEBUG" "health_check" "Checking $service_name external service"
    
    case "$service_name" in
        "openai")
            local endpoint=$(get_config_value "services.external.openai.endpoint")
            local auth_header=$(get_config_value "services.external.openai.auth_header")
            local auth_prefix=$(get_config_value "services.external.openai.auth_prefix")
            
            if curl -s --max-time "$timeout" -H "$auth_header: $auth_prefix $api_key" "$endpoint" >/dev/null 2>&1; then
                echo "$HEALTH_OK"
                return 0
            fi
            ;;
        "anthropic")
            local endpoint=$(get_config_value "services.external.anthropic.endpoint")
            local auth_header=$(get_config_value "services.external.anthropic.auth_header")
            
            # Anthropic requires POST with empty body for health check
            if curl -s --max-time "$timeout" -X POST -H "$auth_header: $api_key" -H "Content-Type: application/json" -d '{}' "$endpoint" 2>/dev/null | grep -q "error"; then
                echo "$HEALTH_OK"
                return 0
            fi
            ;;
        "stripe")
            local endpoint=$(get_config_value "services.external.stripe.endpoint")
            local limit_param=$(get_config_value "services.external.stripe.limit_param")
            
            if curl -s --max-time "$timeout" -u "$api_key:" "${endpoint}${limit_param}" >/dev/null 2>&1; then
                echo "$HEALTH_OK"
                return 0
            fi
            ;;
        *)
            # Generic external service check
            local endpoint=$(get_config_value "services.external.${service_name}.endpoint")
            local auth_header=$(get_config_value "services.external.${service_name}.auth_header" "Authorization")
            local auth_prefix=$(get_config_value "services.external.${service_name}.auth_prefix" "Bearer")
            
            if [[ -n "$endpoint" ]]; then
                if curl -s --max-time "$timeout" -H "$auth_header: $auth_prefix $api_key" "$endpoint" >/dev/null 2>&1; then
                    echo "$HEALTH_OK"
                    return 0
                fi
            fi
            ;;
    esac
    
    handle_service_error "$service_name" "connection_refused"
    echo "$HEALTH_FAIL"
    return 1
}

# Comprehensive health check functions (Hàm kiểm tra sức khỏe toàn diện)
check_all_infrastructure() {
    log_structured "INFO" "health_check" "Checking all infrastructure services"
    
    local redis_status=$(check_redis_health)
    local supabase_status=$(check_supabase_health)
    
    local results="{\"redis\":\"$redis_status\",\"supabase\":\"$supabase_status\"}"
    log_structured "INFO" "health_check" "Infrastructure health check completed" "$results"
    
    if [[ "$redis_status" == "$HEALTH_OK" && "$supabase_status" == "$HEALTH_OK" ]]; then
        return 0
    else
        return 1
    fi
}

check_all_application_services() {
    log_structured "INFO" "health_check" "Checking all application services"
    
    local frontend_status=$(check_frontend_health)
    local backend_status=$(check_backend_health)
    local worker_status=$(check_worker_health)
    
    local results="{\"frontend\":\"$frontend_status\",\"backend\":\"$backend_status\",\"worker\":\"$worker_status\"}"
    log_structured "INFO" "health_check" "Application services health check completed" "$results"
    
    if [[ "$frontend_status" == "$HEALTH_OK" && "$backend_status" == "$HEALTH_OK" && "$worker_status" == "$HEALTH_OK" ]]; then
        return 0
    else
        return 1
    fi
}

check_all_external_services() {
    log_structured "INFO" "health_check" "Checking all external services"
    
    # Load environment variables
    if [[ -f "$PROJECT_ROOT/backend/.env" ]]; then
        source "$PROJECT_ROOT/backend/.env"
    fi
    
    local services=("openai" "anthropic" "tavily" "firecrawl" "daytona" "langfuse" "stripe" "composio" "pipedream")
    local api_key_vars=("OPENAI_API_KEY" "ANTHROPIC_API_KEY" "TAVILY_API_KEY" "FIRECRAWL_API_KEY" "DAYTONA_API_KEY" "LANGFUSE_PUBLIC_KEY" "STRIPE_SECRET_KEY" "COMPOSIO_API_KEY" "PIPEDREAM_CLIENT_ID")
    
    local results="{"
    local all_ok=true
    
    for i in "${!services[@]}"; do
        local service="${services[$i]}"
        local api_key_var="${api_key_vars[$i]}"
        local status=$(check_external_service "$service" "$api_key_var")
        
        results="$results\"$service\":\"$status\""
        if [[ $i -lt $((${#services[@]} - 1)) ]]; then
            results="$results,"
        fi
        
        if [[ "$status" == "$HEALTH_FAIL" ]]; then
            all_ok=false
        fi
    done
    
    results="$results}"
    log_structured "INFO" "health_check" "External services health check completed" "$results"
    
    if [[ "$all_ok" == true ]]; then
        return 0
    else
        return 1
    fi
}

# Memory and performance checks (Kiểm tra memory và performance)
check_memory_usage() {
    local threshold_mb=$(get_config_value "alerts.memory_threshold_mb" "1000")
    
    local frontend_memory=$(get_process_memory "node.*next")
    local backend_memory=$(get_process_memory "uvicorn.*api")
    local worker_memory=$(get_process_memory "dramatiq.*run_agent")
    local redis_memory=$(get_process_memory "redis-server")
    
    local total_memory=$(echo "$frontend_memory + $backend_memory + $worker_memory + $redis_memory" | bc 2>/dev/null || echo "0")
    
    local results="{\"frontend_mb\":$frontend_memory,\"backend_mb\":$backend_memory,\"worker_mb\":$worker_memory,\"redis_mb\":$redis_memory,\"total_mb\":$total_memory,\"threshold_mb\":$threshold_mb}"
    
    if (( $(echo "$total_memory > $threshold_mb" | bc -l 2>/dev/null || echo "0") )); then
        log_structured "WARN" "memory_check" "High memory usage detected" "$results"
        return 1
    else
        log_structured "DEBUG" "memory_check" "Memory usage within limits" "$results"
        return 0
    fi
}
