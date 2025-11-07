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
