#!/bin/bash

# ChainLens Development Scripts - Monitoring Library
# Thư viện giám sát hệ thống

# Source dependencies
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/utils.sh"
source "$LIB_DIR/health_checks.sh"

# Log metric function for monitoring
log_metric() {
    local service="$1"
    local status="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    # Log to structured format if needed
    if [[ "$status" == "healthy" ]]; then
        log_structured "DEBUG" "metric" "Service $service is $status" "{\"service\":\"$service\",\"status\":\"$status\",\"timestamp\":\"$timestamp\"}"
    else
        log_structured "WARN" "metric" "Service $service is $status" "{\"service\":\"$service\",\"status\":\"$status\",\"timestamp\":\"$timestamp\"}"
    fi
}

# Monitoring state variables
MONITORING_PID=""
MONITORING_ACTIVE=false
LAST_HEALTH_CHECK=0
LAST_SERVICE_CHECK=0
LAST_MEMORY_CHECK=0

# Initialize monitoring system (Khởi tạo hệ thống giám sát)
init_monitoring() {
    # Ensure PROJECT_ROOT is set
    if [[ -z "$PROJECT_ROOT" ]]; then
        PROJECT_ROOT="$(cd "$LIB_DIR/../.." && pwd)"
    fi

    local monitoring_log="$PROJECT_ROOT/logs/monitoring.log"
    local metrics_log="$PROJECT_ROOT/logs/metrics.log"
    local services_log="$PROJECT_ROOT/logs/services.log"
    
    # Initialize log files with headers
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Monitoring system initialized" > "$monitoring_log"
    echo "timestamp,frontend_status,backend_status,worker_status,redis_status,supabase_status,frontend_memory,backend_memory,worker_memory,redis_memory,dramatiq_processes" > "$metrics_log"
    echo "timestamp,supabase,redis,openai,anthropic,tavily,firecrawl,daytona,langfuse,stripe,composio,pipedream" > "$services_log"
    
    log_structured "INFO" "monitoring" "Monitoring system initialized"
}

# Real-time metrics collection (Thu thập metrics thời gian thực)
collect_realtime_metrics() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Check application services health
    local frontend_status=$(check_frontend_health)
    local backend_status=$(check_backend_health)
    local worker_status=$(check_worker_health)
    local redis_status=$(check_redis_health)
    local supabase_status=$(check_supabase_health)
    
    # Get memory usage
    local frontend_memory=$(get_process_memory "node.*next")
    local backend_memory=$(get_process_memory "uvicorn.*api")
    local worker_memory=$(get_process_memory "dramatiq.*run_agent")
    local redis_memory=$(get_process_memory "redis-server")
    
    # Get process count
    local dramatiq_count=$(get_process_count "dramatiq|spawn_main")
    
    # Log to metrics file
    local metrics_entry="$timestamp,$frontend_status,$backend_status,$worker_status,$redis_status,$supabase_status,$frontend_memory,$backend_memory,$worker_memory,$redis_memory,$dramatiq_count"
    echo "$metrics_entry" >> "$PROJECT_ROOT/logs/metrics.log"
    
    # Check for alerts
    check_process_conflicts "$dramatiq_count"
    check_service_health_alerts "$frontend_status" "$backend_status" "$worker_status" "$redis_status" "$supabase_status"
    
    # Display real-time status
    display_realtime_status "$timestamp" "$frontend_status" "$backend_status" "$worker_status" "$redis_status" "$supabase_status" "$frontend_memory" "$backend_memory" "$worker_memory" "$dramatiq_count"
    
    # Log structured metrics
    local metrics_json="{\"frontend\":{\"status\":\"$frontend_status\",\"memory_mb\":$frontend_memory},\"backend\":{\"status\":\"$backend_status\",\"memory_mb\":$backend_memory},\"worker\":{\"status\":\"$worker_status\",\"memory_mb\":$worker_memory},\"redis\":{\"status\":\"$redis_status\",\"memory_mb\":$redis_memory},\"supabase\":{\"status\":\"$supabase_status\"},\"processes\":$dramatiq_count}"
    log_structured "DEBUG" "metrics" "Real-time metrics collected" "$metrics_json"
}

# External services monitoring (Giám sát dịch vụ bên ngoài)
collect_external_services_metrics() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Load environment variables
    if [[ -f "$PROJECT_ROOT/backend/.env" ]]; then
        source "$PROJECT_ROOT/backend/.env"
    fi
    
    log_structured "INFO" "monitoring" "Checking external services health"
    
    # Check infrastructure services
    local supabase_ext=$(check_supabase_health)
    local redis_ext=$(check_redis_health)

    # Check API keys (simple validation - just check if they exist)
    local openai_status=$(check_api_key_exists "OPENAI_API_KEY")
    local anthropic_status=$(check_api_key_exists "ANTHROPIC_API_KEY")
    local tavily_status=$(check_api_key_exists "TAVILY_API_KEY")
    local firecrawl_status=$(check_api_key_exists "FIRECRAWL_API_KEY")
    local daytona_status=$(check_api_key_exists "DAYTONA_API_KEY")
    local langfuse_status=$(check_api_key_exists "LANGFUSE_PUBLIC_KEY")
    local stripe_status=$(check_api_key_exists "STRIPE_SECRET_KEY")
    local composio_status=$(check_api_key_exists "COMPOSIO_API_KEY")
    local pipedream_status=$(check_api_key_exists "PIPEDREAM_CLIENT_ID")
    
    # Log to services file
    local services_entry="$timestamp,$supabase_ext,$redis_ext,$openai_status,$anthropic_status,$tavily_status,$firecrawl_status,$daytona_status,$langfuse_status,$stripe_status,$composio_status,$pipedream_status"
    echo "$services_entry" >> "$PROJECT_ROOT/logs/services.log"
    
    # Check for failed services
    check_external_services_alerts "$openai_status" "$anthropic_status" "$tavily_status" "$firecrawl_status" "$daytona_status" "$langfuse_status" "$stripe_status" "$composio_status" "$pipedream_status"
    
    # Log structured services data
    local services_json="{\"supabase\":\"$supabase_ext\",\"redis\":\"$redis_ext\",\"openai\":\"$openai_status\",\"anthropic\":\"$anthropic_status\",\"tavily\":\"$tavily_status\",\"firecrawl\":\"$firecrawl_status\",\"daytona\":\"$daytona_status\",\"langfuse\":\"$langfuse_status\",\"stripe\":\"$stripe_status\",\"composio\":\"$composio_status\",\"pipedream\":\"$pipedream_status\"}"
    log_structured "INFO" "external_services" "External services check completed" "$services_json"
}

# Memory monitoring (Giám sát memory)
collect_memory_metrics() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    if check_memory_usage; then
        log_structured "DEBUG" "memory" "Memory usage check passed"
    else
        log_structured "WARN" "memory" "High memory usage detected"
        echo -e "${YELLOW}⚠️ WARNING: High memory usage detected${NC}"
    fi
}

# Enhanced Backend error monitoring with detailed error logging
check_backend_errors() {
    # Use absolute path or fallback to current directory
    local project_root="${PROJECT_ROOT:-$(pwd)}"
    local backend_log="$project_root/logs/backend.log"

    if [[ ! -f "$backend_log" ]]; then
        log_structured "WARN" "backend_errors" "Backend log file not found" "{\"log_path\":\"$backend_log\",\"project_root\":\"$project_root\"}"
        return 1
    fi

    # Check for general errors in the last 50 lines
    local recent_logs=$(tail -50 "$backend_log")

    # Count different types of errors - Fixed classification logic
    local general_errors=$(echo "$recent_logs" | grep -i "error\|exception\|failed\|traceback\|not found" | grep -v "GET /api/health" | grep -v "200 OK" | wc -l)
    local critical_errors=$(echo "$recent_logs" | grep -i "critical\|fatal" | grep -v "200 OK" | wc -l)
    local http_errors=$(echo "$recent_logs" | grep -E "HTTP/1\.[01]\" [45][0-9][0-9]" | wc -l)
    local warnings=$(echo "$recent_logs" | grep -i "warning\|warn" | grep -v "200 OK" | grep -v "GET /api/health" | wc -l)

    # Log error summary if any errors found - Fixed classification
    if [[ $general_errors -gt 0 || $critical_errors -gt 0 || $http_errors -gt 0 || $warnings -gt 0 ]]; then
        log_structured "INFO" "backend_errors" "Backend error summary" "{\"general_errors\":$general_errors,\"critical_errors\":$critical_errors,\"http_errors\":$http_errors,\"warnings\":$warnings}"

        if [[ $critical_errors -gt 0 ]]; then
            echo -e "${RED}🚨 CRITICAL: $critical_errors critical backend errors detected${NC}"
            echo -e "${RED}📋 CRITICAL ERROR DETAILS:${NC}"
            echo "$recent_logs" | grep -i "critical\|fatal" | grep -v "200 OK" | tail -3 | while read -r line; do
                echo -e "${RED}   ❌ $line${NC}"
            done
        elif [[ $http_errors -gt 0 ]]; then
            echo -e "${RED}🚨 ERROR: $http_errors HTTP errors detected${NC}"
            echo -e "${RED}📋 HTTP ERROR DETAILS:${NC}"
            echo "$recent_logs" | grep -E "HTTP/1\.[01]\" [45][0-9][0-9]" | tail -3 | while read -r line; do
                echo -e "${RED}   ❌ $line${NC}"
            done
        elif [[ $general_errors -gt 0 ]]; then
            echo -e "${YELLOW}⚠️ WARNING: $general_errors backend errors detected${NC}"
            echo -e "${YELLOW}📋 ERROR DETAILS:${NC}"
            echo "$recent_logs" | grep -i "error\|exception\|failed\|traceback\|not found\|404\|500\|502\|503" | grep -v "GET /api/health" | tail -3 | while read -r line; do
                echo -e "${YELLOW}   ⚠️ $line${NC}"
            done
        fi

        # Also show warnings if any
        if [[ $warnings -gt 0 && $critical_errors -eq 0 && $general_errors -eq 0 ]]; then
            echo -e "${YELLOW}⚠️ WARNING: $warnings backend warnings detected${NC}"
            echo -e "${YELLOW}📋 WARNING DETAILS:${NC}"
            echo "$recent_logs" | grep -i "warning\|warn\|404" | tail -2 | while read -r line; do
                echo -e "${YELLOW}   ⚠️ $line${NC}"
            done
        fi

        echo "" # Add spacing after error details
    fi
}

# Redis connection error monitoring (Giám sát lỗi kết nối Redis)
check_redis_connection_errors() {
    # Use absolute path or fallback to current directory
    local project_root="${PROJECT_ROOT:-$(pwd)}"
    local backend_log="$project_root/logs/backend.log"

    if [[ ! -f "$backend_log" ]]; then
        return 1
    fi

    # Check for Redis connection issues in the last 30 lines
    local recent_logs=$(tail -30 "$backend_log")

    # Count Redis-specific errors
    local redis_connection_errors=$(echo "$recent_logs" | grep -i "redis.*connection.*error\|connection.*closed.*by.*server\|redis.*timeout" | wc -l)
    local redis_auth_errors=$(echo "$recent_logs" | grep -i "redis.*auth.*failed\|redis.*authentication" | wc -l)
    local redis_general_errors=$(echo "$recent_logs" | grep -i "redis.*error\|redis.*exception" | wc -l)

    if [[ $redis_connection_errors -gt 0 ]]; then
        log_structured "ERROR" "redis_errors" "Redis connection errors detected" "{\"connection_errors\":$redis_connection_errors}"
        echo -e "${RED}🚨 ERROR: Redis connection errors detected ($redis_connection_errors errors)${NC}"
    fi

    if [[ $redis_auth_errors -gt 0 ]]; then
        log_structured "ERROR" "redis_errors" "Redis authentication errors detected" "{\"auth_errors\":$redis_auth_errors}"
        echo -e "${RED}🚨 ERROR: Redis authentication errors detected ($redis_auth_errors errors)${NC}"
    fi

    if [[ $redis_general_errors -gt 0 ]]; then
        log_structured "WARN" "redis_errors" "Redis general errors detected" "{\"general_errors\":$redis_general_errors}"
        echo -e "${YELLOW}⚠️ WARNING: Redis general errors detected ($redis_general_errors errors)${NC}"
    fi
}

# LLM API error monitoring (Giám sát lỗi LLM API)
check_llm_api_errors() {
    # Use absolute path or fallback to current directory
    local project_root="${PROJECT_ROOT:-$(pwd)}"
    local backend_log="$project_root/logs/backend.log"

    if [[ ! -f "$backend_log" ]]; then
        return 1
    fi

    # Check for LLM API issues in the last 40 lines
    local recent_logs=$(tail -40 "$backend_log")

    # Count LLM-specific errors
    local llm_api_errors=$(echo "$recent_logs" | grep -i "llm.*error\|api.*error.*openai\|api.*error.*anthropic" | wc -l)
    local model_errors=$(echo "$recent_logs" | grep -i "model.*not.*found\|unsupported.*model\|invalid.*model" | wc -l)
    local rate_limit_errors=$(echo "$recent_logs" | grep -i "rate.*limit\|quota.*exceeded\|too.*many.*requests" | wc -l)
    local auth_errors=$(echo "$recent_logs" | grep -i "api.*key.*invalid\|authentication.*failed\|unauthorized" | wc -l)

    if [[ $llm_api_errors -gt 0 ]]; then
        log_structured "ERROR" "llm_errors" "LLM API errors detected" "{\"api_errors\":$llm_api_errors}"
        echo -e "${RED}🚨 ERROR: LLM API errors detected ($llm_api_errors errors)${NC}"
    fi

    if [[ $model_errors -gt 0 ]]; then
        log_structured "ERROR" "llm_errors" "LLM model errors detected" "{\"model_errors\":$model_errors}"
        echo -e "${RED}🚨 ERROR: LLM model errors detected ($model_errors errors)${NC}"
    fi

    if [[ $rate_limit_errors -gt 0 ]]; then
        log_structured "WARN" "llm_errors" "LLM rate limit errors detected" "{\"rate_limit_errors\":$rate_limit_errors}"
        echo -e "${YELLOW}⚠️ WARNING: LLM rate limit errors detected ($rate_limit_errors errors)${NC}"
    fi

    if [[ $auth_errors -gt 0 ]]; then
        log_structured "ERROR" "llm_errors" "LLM authentication errors detected" "{\"auth_errors\":$auth_errors}"
        echo -e "${RED}🚨 ERROR: LLM authentication errors detected ($auth_errors errors)${NC}"
    fi
}

# Image generation monitoring (Giám sát image generation) - Enhanced
check_image_generation() {
    # Use absolute path or fallback to current directory
    local project_root="${PROJECT_ROOT:-$(pwd)}"
    local backend_log="$project_root/logs/backend.log"

    if [[ ! -f "$backend_log" ]]; then
        log_structured "WARN" "image_generation" "Backend log file not found for image generation monitoring" "{\"log_path\":\"$backend_log\",\"project_root\":\"$project_root\"}"
        return 1
    fi

    # Check for image generation patterns in the last 30 lines (increased from 20)
    local recent_logs=$(tail -30 "$backend_log")

    # Enhanced pattern matching for image generation
    local image_requests=$(echo "$recent_logs" | grep -i "image generation\|imagen\|dall-e\|generate.*image\|handling.*image\|Image generation request" | wc -l)
    local image_errors=$(echo "$recent_logs" | grep -i "image.*error\|image.*failed\|image generation failed" | wc -l)
    local image_success=$(echo "$recent_logs" | grep -i "image generation successful\|image.*successful" | wc -l)

    if [[ $image_requests -gt 0 ]]; then
        log_structured "INFO" "image_generation" "Image generation activity detected" "{\"requests\":$image_requests,\"errors\":$image_errors,\"success\":$image_success}"
        echo "[INFO] image_generation: Activity detected (requests: $image_requests, errors: $image_errors, success: $image_success)"
    fi

    if [[ $image_errors -gt 0 ]]; then
        log_structured "WARN" "image_generation" "Image generation errors detected" "{\"error_count\":$image_errors}"
        echo -e "${YELLOW}⚠️ WARNING: Image generation errors detected ($image_errors errors)${NC}"
    fi

    # Check for specific error patterns
    local model_errors=$(echo "$recent_logs" | grep -i "unsupported.*model\|model.*not.*supported\|invalid.*model" | wc -l)
    if [[ $model_errors -gt 0 ]]; then
        log_structured "ERROR" "image_generation" "Unsupported model errors detected" "{\"model_error_count\":$model_errors}"
        echo -e "${RED}🚨 ERROR: Unsupported image model errors detected ($model_errors errors)${NC}"
    fi

    # Check for model mapping issues
    local mapping_errors=$(echo "$recent_logs" | grep -i "model.*mapping.*error\|failed.*to.*map.*model" | wc -l)
    if [[ $mapping_errors -gt 0 ]]; then
        log_structured "ERROR" "image_generation" "Model mapping errors detected" "{\"mapping_error_count\":$mapping_errors}"
        echo -e "${RED}🚨 ERROR: Image model mapping errors detected ($mapping_errors errors)${NC}"
    fi
}

# Alert checking functions (Hàm kiểm tra cảnh báo)
check_process_conflicts() {
    local process_count="$1"
    local threshold=$(get_config_value "alerts.process_conflict_threshold" "15")
    
    if [[ "$process_count" -gt "$threshold" ]]; then
        local alert_msg="Process conflict detected: $process_count Dramatiq processes (threshold: $threshold)"
        log_structured "ERROR" "alert" "$alert_msg" "{\"process_count\":$process_count,\"threshold\":$threshold}"
        echo -e "${RED}🚨 ALERT: $alert_msg${NC}"
        echo "$(date '+%Y-%m-%d %H:%M:%S') - 🚨 ALERT: $alert_msg" >> "$PROJECT_ROOT/logs/monitoring.log"
    fi
}

check_service_health_alerts() {
    local frontend_status="$1"
    local backend_status="$2"
    local worker_status="$3"
    local redis_status="$4"
    local supabase_status="$5"
    
    local unhealthy_services=""
    
    [[ "$frontend_status" != "$HEALTH_OK" ]] && unhealthy_services="$unhealthy_services Frontend"
    [[ "$backend_status" != "$HEALTH_OK" ]] && unhealthy_services="$unhealthy_services Backend"
    [[ "$worker_status" != "$HEALTH_OK" ]] && unhealthy_services="$unhealthy_services Worker"
    [[ "$redis_status" != "$HEALTH_OK" ]] && unhealthy_services="$unhealthy_services Redis"
    [[ "$supabase_status" != "$HEALTH_OK" ]] && unhealthy_services="$unhealthy_services Supabase"
    
    if [[ -n "$unhealthy_services" ]]; then
        local alert_msg="Unhealthy services detected:$unhealthy_services"
        log_structured "WARN" "alert" "$alert_msg"
        echo -e "${YELLOW}⚠️ WARNING: $alert_msg${NC}"
        echo "$(date '+%Y-%m-%d %H:%M:%S') - ⚠️ WARNING: $alert_msg" >> "$PROJECT_ROOT/logs/monitoring.log"
    fi
}

check_external_services_alerts() {
    local openai="$1" anthropic="$2" tavily="$3" firecrawl="$4" daytona="$5"
    local langfuse="$6" stripe="$7" composio="$8" pipedream="$9"
    
    local failed_services=""
    
    [[ "$openai" == "$HEALTH_FAIL" ]] && failed_services="$failed_services OpenAI"
    [[ "$anthropic" == "$HEALTH_FAIL" ]] && failed_services="$failed_services Anthropic"
    [[ "$tavily" == "$HEALTH_FAIL" ]] && failed_services="$failed_services Tavily"
    [[ "$firecrawl" == "$HEALTH_FAIL" ]] && failed_services="$failed_services Firecrawl"
    [[ "$daytona" == "$HEALTH_FAIL" ]] && failed_services="$failed_services Daytona"
    [[ "$langfuse" == "$HEALTH_FAIL" ]] && failed_services="$failed_services Langfuse"
    [[ "$stripe" == "$HEALTH_FAIL" ]] && failed_services="$failed_services Stripe"
    [[ "$composio" == "$HEALTH_FAIL" ]] && failed_services="$failed_services Composio"
    [[ "$pipedream" == "$HEALTH_FAIL" ]] && failed_services="$failed_services Pipedream"
    
    if [[ -n "$failed_services" ]]; then
        local alert_msg="External services failed:$failed_services"
        log_structured "ERROR" "external_alert" "$alert_msg"
        echo -e "${RED}🚨 EXTERNAL SERVICES FAILED:$failed_services${NC}"
        echo "$(date '+%Y-%m-%d %H:%M:%S') - 🚨 EXTERNAL SERVICES FAILED:$failed_services" >> "$PROJECT_ROOT/logs/monitoring.log"
    else
        local success_msg="All external services OK"
        log_structured "DEBUG" "external_services" "$success_msg"
        echo -e "${GREEN}✅ $success_msg${NC}"
        echo "$(date '+%Y-%m-%d %H:%M:%S') - ✅ $success_msg" >> "$PROJECT_ROOT/logs/monitoring.log"
    fi
}

# Helper functions (Hàm hỗ trợ)
check_api_key_exists() {
    local key_name="$1"
    local key_value="${!key_name}"

    if [[ -n "$key_value" && "$key_value" != "test-key" && "$key_value" != "" ]]; then
        echo "ok"
    else
        echo "missing"
    fi
}

# Display functions (Hàm hiển thị)
display_realtime_status() {
    local timestamp="$1" frontend="$2" backend="$3" worker="$4" redis="$5" supabase="$6"
    local frontend_mem="$7" backend_mem="$8" worker_mem="$9" process_count="${10}"
    
    # Use printf with \r for real-time update
    printf "\r${CYAN}📊 %s${NC} F:%s B:%s W:%s R:%s S:%s | Mem: F:%.0fMB B:%.0fMB W:%.0fMB | Proc:%d" \
        "$(date '+%H:%M:%S')" "$frontend" "$backend" "$worker" "$redis" "$supabase" \
        "$frontend_mem" "$backend_mem" "$worker_mem" "$process_count"
}

display_monitoring_summary() {
    echo ""
    echo -e "${CYAN}📊 MONITORING SUMMARY${NC}"
    echo -e "${CYAN}===================${NC}"
    
    if [[ -f "$PROJECT_ROOT/logs/metrics.log" ]]; then
        local total_entries=$(wc -l < "$PROJECT_ROOT/logs/metrics.log")
        echo -e "📈 Total metrics entries: $((total_entries - 1))"
    fi
    
    if [[ -f "$PROJECT_ROOT/logs/services.log" ]]; then
        local total_services=$(wc -l < "$PROJECT_ROOT/logs/services.log")
        echo -e "🔍 Total service checks: $((total_services - 1))"
    fi
    
    if [[ -f "$PROJECT_ROOT/logs/errors.log" ]]; then
        local error_count=$(wc -l < "$PROJECT_ROOT/logs/errors.log")
        if [[ "$error_count" -gt 1 ]]; then
            echo -e "${RED}🚨 Errors detected: $((error_count - 1))${NC}"
        else
            echo -e "${GREEN}✅ No errors detected${NC}"
        fi
    fi
}

# Cleanup monitoring (Dọn dẹp monitoring)
cleanup_monitoring() {
    if [[ -n "$MONITORING_PID" ]] && kill -0 "$MONITORING_PID" 2>/dev/null; then
        log_structured "INFO" "monitoring" "Stopping monitoring process (PID: $MONITORING_PID)"
        kill "$MONITORING_PID" 2>/dev/null || true
        wait "$MONITORING_PID" 2>/dev/null || true
    fi
    
    MONITORING_ACTIVE=false
    log_structured "INFO" "monitoring" "Monitoring system stopped"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Monitoring system stopped" >> "$PROJECT_ROOT/logs/monitoring.log"
}
