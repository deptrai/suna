#!/bin/bash

# Chain Lens Optimized Dashboard Manager
# Quick utility để manage monitoring dashboard v3.0

set -e

# Colors
COLOR_CYAN='\033[0;36m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_RED='\033[0;31m'
COLOR_NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SESSION_NAME="chainlens-monitor"

# Display usage
show_usage() {
    echo -e "${COLOR_CYAN}Chain Lens Optimized Dashboard Manager v3.0${COLOR_NC}"
    echo -e "${COLOR_CYAN}=============================================${COLOR_NC}"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo -e "  ${COLOR_GREEN}start${COLOR_NC}     - Launch optimized dashboard (Backend/Frontend maximized)"
    echo -e "  ${COLOR_GREEN}attach${COLOR_NC}    - Attach to existing dashboard session"
    echo -e "  ${COLOR_GREEN}detach${COLOR_NC}    - Detach from dashboard (keeps running)"
    echo -e "  ${COLOR_GREEN}status${COLOR_NC}    - Check dashboard status"
    echo -e "  ${COLOR_GREEN}stop${COLOR_NC}      - Stop dashboard session"
    echo -e "  ${COLOR_GREEN}restart${COLOR_NC}   - Restart dashboard session"
    echo -e "  ${COLOR_GREEN}logs${COLOR_NC}      - Show recent dashboard logs"
    echo -e "  ${COLOR_GREEN}help${COLOR_NC}      - Show this help message"
    echo ""
    echo "Features:"
    echo -e "  📊 Backend/Frontend logs maximized (75% screen space)"
    echo -e "  🔄 Redis/Worker monitoring compact (25% screen space)"
    echo -e "  🎮 Interactive tmux controls (Ctrl+B + commands)"
    echo -e "  🎨 Color-coded log levels and real-time updates"
}

# Check if dashboard session exists
check_session_exists() {
    tmux has-session -t "$SESSION_NAME" 2>/dev/null
}

# Start optimized dashboard
start_dashboard() {
    echo -e "${COLOR_GREEN}🚀 Starting optimized monitoring dashboard...${COLOR_NC}"
    
    if check_session_exists; then
        echo -e "${COLOR_YELLOW}⚠️ Dashboard session already exists. Use 'attach' to connect or 'restart' to recreate.${COLOR_NC}"
        return 1
    fi
    
    exec "$SCRIPT_DIR/start_optimized_monitor.sh"
}

# Attach to existing dashboard
attach_dashboard() {
    echo -e "${COLOR_GREEN}🔗 Attaching to dashboard session...${COLOR_NC}"
    
    if ! check_session_exists; then
        echo -e "${COLOR_RED}❌ No dashboard session found. Use 'start' to create one.${COLOR_NC}"
        return 1
    fi
    
    exec tmux attach-session -t "$SESSION_NAME"
}

# Check dashboard status
check_status() {
    echo -e "${COLOR_CYAN}📊 Dashboard Status${COLOR_NC}"
    echo -e "${COLOR_CYAN}==================${COLOR_NC}"
    
    if check_session_exists; then
        echo -e "${COLOR_GREEN}✅ Dashboard session is running${COLOR_NC}"
        
        # Show session info
        echo ""
        echo "Session details:"
        tmux display-message -p -t "$SESSION_NAME" "  Session: #S"
        tmux display-message -p -t "$SESSION_NAME" "  Windows: #{session_windows}"
        tmux display-message -p -t "$SESSION_NAME" "  Created: #{session_created_string}"
        
        # Show pane info
        echo ""
        echo "Pane layout:"
        echo "  🔧 Backend Logs [PRIMARY] - Top Left (Large)"
        echo "  🌐 Frontend Logs [PRIMARY] - Top Right (Large)"  
        echo "  🔄 Redis Monitor - Bottom Left (Compact)"
        echo "  ⚙️ Worker Logs - Bottom Right (Compact)"
        
        # Check if services are running
        echo ""
        echo "Service status:"
        redis-cli ping >/dev/null 2>&1 && echo -e "  🔄 Redis: ${COLOR_GREEN}Running${COLOR_NC}" || echo -e "  🔄 Redis: ${COLOR_RED}Stopped${COLOR_NC}"
        curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8000/health" | grep -q "200" && echo -e "  🔧 Backend: ${COLOR_GREEN}Running${COLOR_NC}" || echo -e "  🔧 Backend: ${COLOR_RED}Stopped${COLOR_NC}"
        curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000" | grep -q "200\|404" && echo -e "  🌐 Frontend: ${COLOR_GREEN}Running${COLOR_NC}" || echo -e "  🌐 Frontend: ${COLOR_RED}Stopped${COLOR_NC}"
        ps aux | grep -E "dramatiq.*run_agent_background" | grep -v grep >/dev/null && echo -e "  ⚙️ Worker: ${COLOR_GREEN}Running${COLOR_NC}" || echo -e "  ⚙️ Worker: ${COLOR_RED}Stopped${COLOR_NC}"
        
    else
        echo -e "${COLOR_RED}❌ Dashboard session is not running${COLOR_NC}"
        echo ""
        echo "Use '$0 start' to launch the optimized dashboard"
    fi
}

# Stop dashboard
stop_dashboard() {
    echo -e "${COLOR_YELLOW}🛑 Stopping dashboard session...${COLOR_NC}"
    
    if ! check_session_exists; then
        echo -e "${COLOR_YELLOW}⚠️ Dashboard session is not running${COLOR_NC}"
        return 0
    fi
    
    tmux kill-session -t "$SESSION_NAME"
    echo -e "${COLOR_GREEN}✅ Dashboard session stopped${COLOR_NC}"
}

# Restart dashboard
restart_dashboard() {
    echo -e "${COLOR_YELLOW}🔄 Restarting dashboard session...${COLOR_NC}"
    
    if check_session_exists; then
        echo -e "   Stopping existing session..."
        tmux kill-session -t "$SESSION_NAME"
        sleep 1
    fi
    
    echo -e "   Starting new optimized session..."
    exec "$SCRIPT_DIR/start_optimized_monitor.sh"
}

# Show recent logs
show_logs() {
    echo -e "${COLOR_CYAN}📋 Recent Dashboard Logs${COLOR_NC}"
    echo -e "${COLOR_CYAN}========================${COLOR_NC}"
    
    local logs_dir="$(cd "$SCRIPT_DIR/.." && pwd)/logs"
    
    if [[ -d "$logs_dir" ]]; then
        echo "Backend logs (last 10 lines):"
        tail -n 10 "$logs_dir/backend.log" 2>/dev/null || echo "  No backend logs found"
        echo ""
        
        echo "Frontend logs (last 10 lines):"
        tail -n 10 "$logs_dir/frontend.log" 2>/dev/null || echo "  No frontend logs found"
        echo ""
        
        echo "Worker logs (last 10 lines):"
        tail -n 10 "$logs_dir/worker.log" 2>/dev/null || echo "  No worker logs found"
    else
        echo -e "${COLOR_YELLOW}⚠️ Logs directory not found at: $logs_dir${COLOR_NC}"
    fi
}

# Main command dispatcher
main() {
    local command="${1:-help}"
    
    case "$command" in
        "start")
            start_dashboard
            ;;
        "attach")
            attach_dashboard
            ;;
        "detach")
            echo -e "${COLOR_GREEN}💡 To detach from dashboard, use: Ctrl+B, then 'd'${COLOR_NC}"
            ;;
        "status")
            check_status
            ;;
        "stop")
            stop_dashboard
            ;;
        "restart")
            restart_dashboard
            ;;
        "logs")
            show_logs
            ;;
        "help"|"--help"|"-h")
            show_usage
            ;;
        *)
            echo -e "${COLOR_RED}❌ Unknown command: $command${COLOR_NC}"
            echo ""
            show_usage
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"