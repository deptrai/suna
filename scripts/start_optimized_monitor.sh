#!/bin/bash

# Quick launcher for Chain Lens Optimized Monitoring Dashboard
# Features: Backend/Frontend logs maximized (75% screen space)

set -e

# Colors
COLOR_CYAN='\033[0;36m'
COLOR_GREEN='\033[0;32m' 
COLOR_YELLOW='\033[1;33m'
COLOR_NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITOR_SCRIPT="$SCRIPT_DIR/monitoring/enhanced_dashboard_monitor.sh"

# Check if monitoring script exists
if [[ ! -f "$MONITOR_SCRIPT" ]]; then
    echo -e "${COLOR_RED}❌ Monitoring script not found at: $MONITOR_SCRIPT${COLOR_NC}"
    exit 1
fi

echo -e "${COLOR_CYAN}🚀 Starting Chain Lens Optimized Monitoring Dashboard...${COLOR_NC}"
echo -e "${COLOR_YELLOW}✨ Backend & Frontend logs will be maximized (75% screen space)${COLOR_NC}"
echo -e "${COLOR_GREEN}📊 Layout: Large Backend/Frontend panes + Small Redis/Worker panes${COLOR_NC}"
echo ""

# Launch the optimized dashboard
exec bash "$MONITOR_SCRIPT" "$@"