#!/bin/bash

# ChainLens Development Environment - Log Viewer
# Script xem logs real-time cho môi trường phát triển ChainLens

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOGS_DIR="$PROJECT_ROOT/logs"

# Display usage
show_usage() {
    echo -e "${CYAN}🔍 CHAINLENS LOG VIEWER${NC}"
    echo -e "${CYAN}==================${NC}"
    echo ""
    echo "Usage: $0 [option]"
    echo ""
    echo "Options:"
    echo "  all         - View all logs in real-time"
    echo "  frontend    - View frontend logs"
    echo "  backend     - View backend logs"
    echo "  worker      - View worker logs"
    echo "  monitoring  - View monitoring logs"
    echo "  metrics     - View metrics (CSV format)"
    echo "  services    - View external services logs"
    echo "  structured  - View structured logs (JSON format)"
    echo "  errors      - View error logs"
    echo "  list        - List all available log files"
    echo ""
    echo "Examples:"
    echo "  $0 all                    # View all logs"
    echo "  $0 frontend              # View frontend logs only"
    echo "  $0 structured            # View structured JSON logs"
    echo ""
}

# List available log files
list_logs() {
    echo -e "${CYAN}📄 Available Log Files:${NC}"
    echo -e "${CYAN}=======================${NC}"
    
    if [[ ! -d "$LOGS_DIR" ]]; then
        echo -e "${RED}❌ Logs directory not found: $LOGS_DIR${NC}"
        return 1
    fi
    
    cd "$LOGS_DIR"
    for log_file in *.log *.jsonl; do
        if [[ -f "$log_file" ]]; then
            local size=$(du -h "$log_file" | cut -f1)
            local modified=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$log_file")
            echo -e "  📄 ${GREEN}$log_file${NC} (${size}, modified: $modified)"
        fi
    done
    echo ""
}

# View specific log
view_log() {
    local log_type="$1"
    local log_file=""
    
    case "$log_type" in
        "frontend")
            log_file="$LOGS_DIR/frontend.log"
            echo -e "${CYAN}🌐 Frontend Logs (Next.js)${NC}"
            ;;
        "backend")
            log_file="$LOGS_DIR/backend.log"
            echo -e "${CYAN}🔧 Backend Logs (FastAPI)${NC}"
            ;;
        "worker")
            log_file="$LOGS_DIR/worker.log"
            echo -e "${CYAN}🔄 Worker Logs (Dramatiq)${NC}"
            ;;
        "monitoring")
            log_file="$LOGS_DIR/monitor_output.log"
            echo -e "${CYAN}📊 Monitoring Logs (Real-time)${NC}"
            ;;
        "metrics")
            log_file="$LOGS_DIR/metrics.log"
            echo -e "${CYAN}📈 Metrics Logs (CSV)${NC}"
            ;;
        "services")
            log_file="$LOGS_DIR/services.log"
            echo -e "${CYAN}🌐 External Services Logs (CSV)${NC}"
            ;;
        "structured")
            log_file="$LOGS_DIR/structured.jsonl"
            echo -e "${CYAN}📋 Structured Logs (JSON)${NC}"
            ;;
        "errors")
            log_file="$LOGS_DIR/errors.log"
            echo -e "${CYAN}❌ Error Logs${NC}"
            ;;
        *)
            echo -e "${RED}❌ Unknown log type: $log_type${NC}"
            show_usage
            return 1
            ;;
    esac
    
    echo -e "${CYAN}========================${NC}"
    echo ""
    
    if [[ ! -f "$log_file" ]]; then
        echo -e "${RED}❌ Log file not found: $log_file${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}📄 File: $log_file${NC}"
    echo -e "${YELLOW}📊 Size: $(du -h "$log_file" | cut -f1)${NC}"
    echo -e "${YELLOW}🕒 Modified: $(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$log_file")${NC}"
    echo ""
    echo -e "${GREEN}Press Ctrl+C to exit${NC}"
    echo ""
    
    # Use tail -f for real-time viewing
    tail -f "$log_file"
}

# View all logs in parallel
view_all_logs() {
    echo -e "${CYAN}🔍 ALL CHAINLENS LOGS - REAL-TIME VIEW${NC}"
    echo -e "${CYAN}==================================${NC}"
    echo ""
    echo -e "${GREEN}Press Ctrl+C to exit${NC}"
    echo ""
    
    if [[ ! -d "$LOGS_DIR" ]]; then
        echo -e "${RED}❌ Logs directory not found: $LOGS_DIR${NC}"
        return 1
    fi
    
    # Use multitail if available, otherwise use tail with labels
    if command -v multitail >/dev/null 2>&1; then
        cd "$LOGS_DIR"
        multitail -s 2 \
            -l "tail -f frontend.log" \
            -l "tail -f backend.log" \
            -l "tail -f worker.log" \
            -l "tail -f monitor_output.log"
    else
        # Fallback to simple tail with labels
        echo -e "${YELLOW}💡 Install 'multitail' for better multi-log viewing experience${NC}"
        echo ""
        
        cd "$LOGS_DIR"
        tail -f frontend.log backend.log worker.log monitor_output.log 2>/dev/null || {
            echo -e "${RED}❌ Some log files may not exist yet${NC}"
            echo "Available files:"
            ls -la *.log *.jsonl 2>/dev/null || echo "No log files found"
        }
    fi
}

# Main function
main() {
    local option="${1:-help}"
    
    case "$option" in
        "help"|"-h"|"--help")
            show_usage
            ;;
        "list")
            list_logs
            ;;
        "all")
            view_all_logs
            ;;
        "frontend"|"backend"|"worker"|"monitoring"|"metrics"|"services"|"structured"|"errors")
            view_log "$option"
            ;;
        *)
            echo -e "${RED}❌ Invalid option: $option${NC}"
            echo ""
            show_usage
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"
