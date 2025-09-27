#!/bin/bash

# Enhanced Chain Lens Multi-Pane Monitoring Dashboard
# Features: 4-panel tmux layout with real-time logs for all services

set -e

# Source shared libraries
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/utils.sh" 2>/dev/null || echo "Warning: utils.sh not found"

# Initialize project paths
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOGS_DIR="$PROJECT_ROOT/logs"
SESSION_NAME="chainlens-monitor"

# Colors and formatting (using local variables)
COLOR_RED='\033[0;31m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_BLUE='\033[0;34m'
COLOR_PURPLE='\033[0;35m'
COLOR_CYAN='\033[0;36m'
COLOR_WHITE='\033[1;37m'
COLOR_NC='\033[0m' # No Color

# Ensure logs directory exists
mkdir -p "$LOGS_DIR"

# Function to check if services are running
check_services_status() {
    echo -e "${COLOR_CYAN}🔍 Checking services status...${COLOR_NC}"
    
    # Check Redis
    if redis-cli ping >/dev/null 2>&1; then
        echo -e "   ${COLOR_GREEN}✅ Redis: Running${COLOR_NC}"
        REDIS_STATUS="running"
    else
        echo -e "   ${COLOR_RED}❌ Redis: Not running${COLOR_NC}"
        REDIS_STATUS="stopped"
    fi
    
    # Check Backend
    if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8000/api/health" | grep -q "200"; then
        echo -e "   ${COLOR_GREEN}✅ Backend: Running${COLOR_NC}"
        BACKEND_STATUS="running"
    else
        echo -e "   ${COLOR_RED}❌ Backend: Not running${COLOR_NC}"
        BACKEND_STATUS="stopped"
    fi
    
    # Check Frontend
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000" | grep -q "200\|404"; then
        echo -e "   ${COLOR_GREEN}✅ Frontend: Running${COLOR_NC}"
        FRONTEND_STATUS="running"
    else
        echo -e "   ${COLOR_RED}❌ Frontend: Not running${COLOR_NC}"
        FRONTEND_STATUS="stopped"
    fi
    
    # Check Worker
    if ps aux | grep -E "dramatiq.*run_agent_background" | grep -v grep >/dev/null; then
        echo -e "   ${COLOR_GREEN}✅ Worker: Running${COLOR_NC}"
        WORKER_STATUS="running"
    else
        echo -e "   ${COLOR_RED}❌ Worker: Not running${COLOR_NC}"
        WORKER_STATUS="stopped"
    fi
}

# Function to create Redis monitoring log
setup_redis_monitoring() {
    echo -e "${COLOR_BLUE}🔧 Setting up Redis monitoring...${COLOR_NC}"
    
    # Create Redis monitor script
    cat > "$LOGS_DIR/redis_monitor.sh" << 'EOF'
#!/bin/bash
LOGS_DIR="$(dirname "$0")"
REDIS_LOG="$LOGS_DIR/redis_live.log"

echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Redis monitoring started" > "$REDIS_LOG"

while true; do
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Redis info
    if redis-cli ping >/dev/null 2>&1; then
        # Get Redis info
        memory=$(redis-cli info memory | grep "used_memory_human" | cut -d: -f2 | tr -d '\r\n')
        clients=$(redis-cli info clients | grep "connected_clients" | cut -d: -f2 | tr -d '\r\n')
        keyspace=$(redis-cli info keyspace | grep "db0" | cut -d: -f2 | tr -d '\r\n' || echo "empty")
        
        echo "[$timestamp] Redis Status: HEALTHY | Memory: $memory | Clients: $clients | Keys: $keyspace" >> "$REDIS_LOG"
        
        # Monitor slow queries if any
        slowlog=$(redis-cli slowlog get 1 2>/dev/null | head -n 1 | tr -d '\r\n' || echo "none")
        if [[ "$slowlog" != "none" && "$slowlog" != "" ]]; then
            echo "[$timestamp] Redis SlowLog: $slowlog" >> "$REDIS_LOG"
        fi
    else
        echo "[$timestamp] Redis Status: DISCONNECTED" >> "$REDIS_LOG"
    fi
    
    sleep 5
done
EOF
    
    chmod +x "$LOGS_DIR/redis_monitor.sh"
}

# Function to create enhanced log display scripts
create_log_display_scripts() {
    echo -e "${COLOR_BLUE}🔧 Creating enhanced log display scripts...${COLOR_NC}"
    
    # Backend log display with filtering
    cat > "$LOGS_DIR/backend_display.sh" << 'EOF'
#!/bin/bash
LOGS_DIR="$(dirname "$0")"
LOG_FILE="$LOGS_DIR/backend.log"

if [[ ! -f "$LOG_FILE" ]]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Waiting for backend.log..."
    while [[ ! -f "$LOG_FILE" ]]; do sleep 1; done
fi

echo "🔧 Backend Service Logs"
echo "======================"
tail -f "$LOG_FILE" | while read line; do
    timestamp=$(date '+%H:%M:%S')
    # Color code different log levels
    if echo "$line" | grep -i error >/dev/null; then
        echo -e "[$timestamp] \033[0;31m$line\033[0m"
    elif echo "$line" | grep -i warn >/dev/null; then
        echo -e "[$timestamp] \033[1;33m$line\033[0m"
    elif echo "$line" | grep -i info >/dev/null; then
        echo -e "[$timestamp] \033[0;32m$line\033[0m"
    else
        echo "[$timestamp] $line"
    fi
done
EOF

    # Frontend log display
    cat > "$LOGS_DIR/frontend_display.sh" << 'EOF'
#!/bin/bash
LOGS_DIR="$(dirname "$0")"
LOG_FILE="$LOGS_DIR/frontend.log"

if [[ ! -f "$LOG_FILE" ]]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Waiting for frontend.log..."
    while [[ ! -f "$LOG_FILE" ]]; do sleep 1; done
fi

echo "🌐 Frontend Service Logs"
echo "======================="
tail -f "$LOG_FILE" | while read line; do
    timestamp=$(date '+%H:%M:%S')
    # Color code different log levels  
    if echo "$line" | grep -i error >/dev/null; then
        echo -e "[$timestamp] \033[0;31m$line\033[0m"
    elif echo "$line" | grep -i warn >/dev/null; then
        echo -e "[$timestamp] \033[1;33m$line\033[0m"
    elif echo "$line" | grep -i ready >/dev/null; then
        echo -e "[$timestamp] \033[0;32m$line\033[0m"
    else
        echo "[$timestamp] $line"
    fi
done
EOF

    # Worker log display  
    cat > "$LOGS_DIR/worker_display.sh" << 'EOF'
#!/bin/bash
LOGS_DIR="$(dirname "$0")"
LOG_FILE="$LOGS_DIR/worker.log"

if [[ ! -f "$LOG_FILE" ]]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Waiting for worker.log..."
    while [[ ! -f "$LOG_FILE" ]]; do sleep 1; done
fi

echo "⚙️ Worker Service Logs"
echo "====================="
tail -f "$LOG_FILE" | while read line; do
    timestamp=$(date '+%H:%M:%S')
    # Color code different log levels
    if echo "$line" | grep -i error >/dev/null; then
        echo -e "[$timestamp] \033[0;31m$line\033[0m"
    elif echo "$line" | grep -i warn >/dev/null; then
        echo -e "[$timestamp] \033[1;33m$line\033[0m"
    elif echo "$line" | grep -i "dramatiq" >/dev/null; then
        echo -e "[$timestamp] \033[0;36m$line\033[0m"
    else
        echo "[$timestamp] $line"
    fi
done
EOF

    # Redis log display
    cat > "$LOGS_DIR/redis_display.sh" << 'EOF'
#!/bin/bash
LOGS_DIR="$(dirname "$0")"
LOG_FILE="$LOGS_DIR/redis_live.log"

echo "🔄 Redis Service Logs"
echo "===================="

if [[ ! -f "$LOG_FILE" ]]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Starting Redis monitoring..."
    "$LOGS_DIR/redis_monitor.sh" &
    sleep 2
fi

tail -f "$LOG_FILE" 2>/dev/null | while read line; do
    if echo "$line" | grep -i "DISCONNECTED" >/dev/null; then
        echo -e "\033[0;31m$line\033[0m"
    elif echo "$line" | grep -i "HEALTHY" >/dev/null; then
        echo -e "\033[0;32m$line\033[0m"
    else
        echo "$line"
    fi
done
EOF

    # Make all scripts executable
    chmod +x "$LOGS_DIR"/*.sh
}

# Function to create tmux session with 2-row layout
create_tmux_dashboard() {
    echo -e "${COLOR_PURPLE}🚀 Creating 2-row tmux dashboard session...${COLOR_NC}"
    
    # Kill existing session if it exists
    tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
    
    # Create new session
    tmux new-session -d -s "$SESSION_NAME"
    
    # New 2-row layout:
    # Top row (25%): Redis | Worker (2 columns)
    # Bottom row (75%): Backend | Frontend (2 columns)
    
    # Step 1: Split horizontally - top 25% and bottom 75%
    tmux split-window -v -t "$SESSION_NAME:0" -p 75
    
    # Step 2: Split the top pane (25%) vertically into Redis | Worker
    tmux split-window -h -t "$SESSION_NAME:0.0" -p 50
    
    # Step 3: Split the bottom pane (75%) vertically into Backend | Frontend
    tmux split-window -h -t "$SESSION_NAME:0.2" -p 50
    
    # Final layout with 4 panes in 2 rows:
    # 0: top-left (Redis) - small
    # 1: top-right (Worker) - small  
    # 2: bottom-left (Backend) - LARGE
    # 3: bottom-right (Frontend) - LARGE
    
    # Start Redis monitoring in pane 0 (top-left - small)
    tmux send-keys -t "$SESSION_NAME:0.0" "bash '$LOGS_DIR/redis_display.sh'" C-m
    
    # Start Worker monitoring in pane 1 (top-right - small)
    tmux send-keys -t "$SESSION_NAME:0.1" "bash '$LOGS_DIR/worker_display.sh'" C-m
    
    # Start Backend monitoring in pane 2 (bottom-left - LARGE) 
    tmux send-keys -t "$SESSION_NAME:0.2" "bash '$LOGS_DIR/backend_display.sh'" C-m
    
    # Start Frontend monitoring in pane 3 (bottom-right - LARGE)
    tmux send-keys -t "$SESSION_NAME:0.3" "bash '$LOGS_DIR/frontend_display.sh'" C-m
    
    # Set pane titles for 2-row layout
    tmux select-pane -t "$SESSION_NAME:0.0" -T "🔄 Redis Monitor"
    tmux select-pane -t "$SESSION_NAME:0.1" -T "⚙️ Worker Logs"
    tmux select-pane -t "$SESSION_NAME:0.2" -T "🔧 Backend Logs [PRIMARY]"
    tmux select-pane -t "$SESSION_NAME:0.3" -T "🌐 Frontend Logs [PRIMARY]"
    
    # Configure tmux session with 2-row styling
    tmux set-option -t "$SESSION_NAME" status-position top
    tmux set-option -t "$SESSION_NAME" status-left-length 50
    tmux set-option -t "$SESSION_NAME" status-right-length 120
    tmux set-option -t "$SESSION_NAME" status-left "#[fg=green]Chain Lens Monitor #[fg=yellow]| #[fg=blue]2-Row Layout #[fg=yellow]| "
    tmux set-option -t "$SESSION_NAME" status-right "#[fg=cyan]%Y-%m-%d %H:%M:%S #[fg=yellow]| #[fg=green]Redis/Worker | Backend/Frontend"
    
    # Enable pane titles with priority styling
    tmux set-option -t "$SESSION_NAME" pane-border-status top
    tmux set-option -t "$SESSION_NAME" pane-border-format "#[fg=cyan]#{pane_title}"
}

# Function to display usage instructions
show_instructions() {
    echo -e "${COLOR_WHITE}╔═══════════════════════════════════════════════════════════════╗${COLOR_NC}"
    echo -e "${COLOR_WHITE}║           CHAIN LENS 2-ROW MONITORING DASHBOARD              ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}╠═══════════════════════════════════════════════════════════════╣${COLOR_NC}"
    echo -e "${COLOR_WHITE}║                                                               ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║  📊 Layout: 2 rows - Redis/Worker (top), Backend/Frontend  ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║                                                               ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║  ┌─────────────────┬─────────────────┐ ← Row 1 (25%)        ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║  │ 🔄 Redis Monitor │ ⚙️ Worker Logs   │                       ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║  ├─────────────────┼─────────────────┤ ← Row 2 (75%)        ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║  │ 🔧 Backend Logs   │ 🌐 Frontend Logs │                       ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║  │   [PRIMARY]      │   [PRIMARY]     │                       ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║  │                 │                 │                       ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║  │                 │                 │                       ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║  └─────────────────┴─────────────────┘                       ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║                                                               ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║  💡 Controls:                                                 ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║     • Ctrl+B + Arrow Keys: Switch between panes              ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║     • Ctrl+B + z: Zoom/unzoom current pane                   ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║     • Ctrl+B + [: Scroll mode (q to exit)                    ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║     • Ctrl+B + d: Detach (keeps running in background)       ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║     • tmux attach -t chainlens-monitor: Reattach             ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║                                                               ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║  🚪 Exit: Ctrl+C in this terminal (services keep running)    ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}║                                                               ║${COLOR_NC}"
    echo -e "${COLOR_WHITE}╚═══════════════════════════════════════════════════════════════╝${COLOR_NC}"
    echo ""
}

# Main execution function
main() {
    clear
    echo -e "${COLOR_CYAN}🚀 CHAIN LENS 2-ROW MONITORING DASHBOARD v3.2${COLOR_NC}"
    echo -e "${COLOR_CYAN}=============================================${COLOR_NC}"
    echo -e "${COLOR_BLUE}✨ Row 1: Redis/Worker | Row 2: Backend/Frontend${COLOR_NC}"
    echo ""
    
    # Check services status
    check_services_status
    echo ""
    
    # Setup monitoring components
    setup_redis_monitoring
    create_log_display_scripts
    
    # Create tmux dashboard
    create_tmux_dashboard
    
    # Show instructions
    show_instructions
    
    echo -e "${COLOR_GREEN}🎉 2-Row Dashboard is ready! Redis/Worker (top) | Backend/Frontend (bottom)!${COLOR_NC}"
    echo -e "${COLOR_YELLOW}💡 Press Ctrl+B, then 'd' to detach and return to terminal${COLOR_NC}"
    echo ""
    
    sleep 2
    
    # Attach to tmux session
    exec tmux attach-session -t "$SESSION_NAME"
}

# Cleanup function for graceful shutdown
cleanup() {
    echo -e "\n${COLOR_YELLOW}🧹 Cleaning up dashboard...${COLOR_NC}"
    
    # Kill background Redis monitor
    pkill -f "redis_monitor.sh" 2>/dev/null || true
    
    # Kill tmux session
    tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
    
    echo -e "${COLOR_GREEN}✅ Dashboard cleaned up. Services continue running.${COLOR_NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Execute main function
main "$@"