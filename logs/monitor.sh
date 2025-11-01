#!/bin/bash

# Auto-generated ENHANCED monitoring script with optional service handling
source "/Users/mac_1/Documents/GitHub/chainlens/scripts/lib/utils.sh"
source "/Users/mac_1/Documents/GitHub/chainlens/scripts/lib/health_checks.sh"
source "/Users/mac_1/Documents/GitHub/chainlens/scripts/lib/monitoring.sh"

# Initialize monitoring
init_monitoring

# Enhanced configuration for optional services
SUPABASE_ENABLED=false
SUPABASE_CHECK_INTERVAL=60  # Check Supabase less frequently
SUPABASE_LAST_CHECK=0

# Check if Supabase should be monitored
check_supabase_enabled() {
    # Only enable Supabase monitoring if it's actually running
    if [[ "$(check_supabase_health)" == "$HEALTH_OK" ]]; then
        SUPABASE_ENABLED=true
        echo -e "${GREEN}✅ Supabase detected - enabling monitoring${NC}"
    else
        SUPABASE_ENABLED=false
        echo -e "${YELLOW}⚠️ Supabase not available - disabling monitoring${NC}"
    fi
}

# Enhanced service health check with optional handling
enhanced_collect_external_services_metrics() {
    local current_time=$(date +%s)

    # Always check Redis (required)
    if [[ "$(check_redis_health)" == "$HEALTH_OK" ]]; then
        log_metric "redis" "healthy"
    else
        log_metric "redis" "unhealthy"
        log_structured "ERROR" "redis" "Redis health check failed"
    fi

    # Check Supabase only if enabled and interval passed
    if [[ "$SUPABASE_ENABLED" == "true" ]]; then
        if [[ $((current_time - SUPABASE_LAST_CHECK)) -ge $SUPABASE_CHECK_INTERVAL ]]; then
            if [[ "$(check_supabase_health)" == "$HEALTH_OK" ]]; then
                log_metric "supabase" "healthy"
            else
                log_metric "supabase" "unhealthy"
                log_structured "WARN" "supabase" "Supabase health check failed (optional service)"
                # Disable Supabase monitoring if it fails multiple times
                SUPABASE_ENABLED=false
                echo -e "${YELLOW}⚠️ Supabase failed - disabling monitoring${NC}"
            fi
            SUPABASE_LAST_CHECK=$current_time
        fi
    fi
}

# Cleanup function
cleanup() {
    echo -e "${CYAN}📊 Monitoring shutdown initiated${NC}"
    cleanup_monitoring
    exit 0
}

trap cleanup SIGINT SIGTERM

echo -e "${CYAN}📊 Starting Chain Lens ENHANCED Real-time Monitoring${NC}"
echo -e "Real-time interval: 1s"
echo -e "Service check interval: 10s"
echo -e "Enhanced features: Optional service handling, reduced noise"
echo ""

# Initial setup
check_supabase_enabled
enhanced_collect_external_services_metrics
collect_realtime_metrics

# Counters
realtime_counter=0
service_counter=0
memory_counter=0
image_counter=0
error_counter=0

# Main monitoring loop
while true; do
    sleep 1
    realtime_counter=$((realtime_counter + 1))
    service_counter=$((service_counter + 1))
    memory_counter=$((memory_counter + 1))
    image_counter=$((image_counter + 1))
    error_counter=$((error_counter + 1))

    # Real-time monitoring every second
    collect_realtime_metrics

    # Enhanced external services check every 10 seconds
    if [[ $service_counter -ge 10 ]]; then
        enhanced_collect_external_services_metrics
        service_counter=0
    fi

    # Memory check every 5 seconds
    if [[ $memory_counter -ge 5 ]]; then
        collect_memory_metrics
        memory_counter=0
    fi

    # Image generation check every 3 seconds
    if [[ $image_counter -ge 3 ]]; then
        check_image_generation
        image_counter=0
    fi

    # Enhanced error monitoring every 7 seconds
    if [[ $error_counter -ge 7 ]]; then
        echo "🔍 Running enhanced error monitoring..."
        check_backend_errors
        check_redis_connection_errors
        check_llm_api_errors
        error_counter=0
    fi
done
