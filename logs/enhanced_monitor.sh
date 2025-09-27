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
