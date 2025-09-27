#!/bin/bash

# Chain Lens Monitoring Utilities
# Helper commands for managing the monitoring dashboard

SESSION_NAME="chainlens-monitor"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/logs"

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

show_help() {
    echo -e "${CYAN}Chain Lens Monitoring Utilities${NC}"
    echo -e "${CYAN}===============================${NC}"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start        - Start the 4-panel monitoring dashboard"
    echo "  attach       - Attach to existing monitoring session"
    echo "  detach       - Detach from monitoring session (keeps running)"
    echo "  status       - Show monitoring session status"
    echo "  stop         - Stop monitoring dashboard"
    echo "  restart      - Restart monitoring dashboard"
    echo "  logs         - Show recent logs summary"
    echo "  clean        - Clean up log files and sessions"
    echo ""
    echo "Examples:"
    echo "  $0 start     # Start new monitoring dashboard"
    echo "  $0 attach    # Reconnect to running dashboard"
    echo "  $0 status    # Check if dashboard is running"
}

start_monitoring() {
    echo -e "${CYAN}🚀 Starting monitoring dashboard...${NC}"
    
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo -e "${YELLOW}⚠️ Monitoring session already exists. Use 'attach' to connect.${NC}"
        return 1
    fi
    
    "$SCRIPT_DIR/enhanced_dashboard_monitor.sh"
}

attach_monitoring() {
    echo -e "${CYAN}🔗 Attaching to monitoring session...${NC}"
    
    if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo -e "${RED}❌ No monitoring session found. Use 'start' first.${NC}"
        return 1
    fi
    
    exec tmux attach-session -t "$SESSION_NAME"
}

detach_monitoring() {
    echo -e "${CYAN}📤 Detaching from monitoring session...${NC}"
    tmux detach-client -s "$SESSION_NAME" 2>/dev/null
    echo -e "${GREEN}✅ Detached. Session continues running in background.${NC}"
}

show_status() {
    echo -e "${CYAN}📊 Monitoring Status${NC}"
    echo -e "${CYAN}===================${NC}"
    
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        echo -e "${GREEN}✅ Dashboard: Running${NC}"
        
        # Show session info
        echo ""
        echo "Session details:"
        tmux list-sessions | grep "$SESSION_NAME" | head -1
        
        echo ""
        echo "Active panes:"
        tmux list-panes -t "$SESSION_NAME" -F "#{pane_index}: #{pane_title}" 2>/dev/null | while read line; do
            echo "  $line"
        done
        
    else
        echo -e "${RED}❌ Dashboard: Not running${NC}"
    fi
    
    echo ""
    echo "Service status:"
    
    # Check Redis
    if redis-cli ping >/dev/null 2>&1; then
        echo -e "  ${GREEN}✅ Redis: Healthy${NC}"
    else
        echo -e "  ${RED}❌ Redis: Down${NC}"
    fi
    
    # Check Backend  
    if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8000/api/health" | grep -q "200"; then
        echo -e "  ${GREEN}✅ Backend: Healthy${NC}"
    else
        echo -e "  ${RED}❌ Backend: Down${NC}"
    fi
    
    # Check Frontend
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000" | grep -q "200\|404"; then
        echo -e "  ${GREEN}✅ Frontend: Healthy${NC}"
    else
        echo -e "  ${RED}❌ Frontend: Down${NC}"
    fi
    
    # Check Worker
    if ps aux | grep -E "dramatiq.*run_agent_background" | grep -v grep >/dev/null; then
        echo -e "  ${GREEN}✅ Worker: Healthy${NC}"
    else
        echo -e "  ${RED}❌ Worker: Down${NC}"
    fi
}

stop_monitoring() {
    echo -e "${CYAN}🛑 Stopping monitoring dashboard...${NC}"
    
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        tmux kill-session -t "$SESSION_NAME"
        echo -e "${GREEN}✅ Monitoring session stopped${NC}"
    else
        echo -e "${YELLOW}⚠️ No monitoring session was running${NC}"
    fi
    
    # Clean up background processes
    pkill -f "redis_monitor.sh" 2>/dev/null || true
    echo -e "${GREEN}✅ Background processes cleaned up${NC}"
}

restart_monitoring() {
    echo -e "${CYAN}🔄 Restarting monitoring dashboard...${NC}"
    stop_monitoring
    sleep 2
    start_monitoring
}

show_logs_summary() {
    echo -e "${CYAN}📄 Recent Logs Summary${NC}"
    echo -e "${CYAN}======================${NC}"
    
    for service in "backend" "frontend" "worker"; do
        log_file="$LOGS_DIR/${service}.log"
        if [[ -f "$log_file" ]]; then
            echo ""
            echo -e "${CYAN}$(echo ${service} | sed 's/.*/\u&/') (last 5 lines):${NC}"
            tail -n 5 "$log_file" | sed 's/^/  /'
        else
            echo -e "${RED}❌ $(echo ${service} | sed 's/.*/\u&/'): No log file found${NC}"
        fi
    done
    
    # Redis live log
    redis_log="$LOGS_DIR/redis_live.log"
    if [[ -f "$redis_log" ]]; then
        echo ""
        echo -e "${CYAN}Redis (last 3 lines):${NC}"
        tail -n 3 "$redis_log" | sed 's/^/  /'
    fi
}

clean_logs() {
    echo -e "${CYAN}🧹 Cleaning up logs and sessions...${NC}"
    
    # Stop monitoring first
    stop_monitoring
    
    # Archive current logs
    timestamp=$(date '+%Y%m%d_%H%M%S')
    archive_dir="$LOGS_DIR/archive/monitoring_$timestamp"
    mkdir -p "$archive_dir"
    
    for log_file in "$LOGS_DIR"/*.log "$LOGS_DIR"/redis_live.log; do
        if [[ -f "$log_file" ]]; then
            mv "$log_file" "$archive_dir/"
        fi
    done
    
    # Remove monitoring scripts
    rm -f "$LOGS_DIR"/redis_monitor.sh
    rm -f "$LOGS_DIR"/*_display.sh
    
    echo -e "${GREEN}✅ Logs archived to: $archive_dir${NC}"
    echo -e "${GREEN}✅ Cleanup completed${NC}"
}

# Main command handling
case "${1:-}" in
    "start")
        start_monitoring
        ;;
    "attach") 
        attach_monitoring
        ;;
    "detach")
        detach_monitoring
        ;;
    "status")
        show_status
        ;;
    "stop")
        stop_monitoring
        ;;
    "restart")
        restart_monitoring
        ;;
    "logs")
        show_logs_summary
        ;;
    "clean")
        clean_logs
        ;;
    *)
        show_help
        ;;
esac