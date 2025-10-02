#!/bin/bash

# ChainLens Worker Restart Script
# Quick script to kill all worker processes and restart them

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo -e "${CYAN}🔄 CHAINLENS WORKER RESTART${NC}"
echo -e "${CYAN}===========================${NC}"
echo -e "📁 Project root: ${PROJECT_ROOT}"
echo ""

# Phase 1: Kill all worker processes
echo -e "${YELLOW}🛑 Stopping all worker processes...${NC}"

# Get PIDs of worker processes
WORKER_PIDS=$(pgrep -f "dramatiq run_agent_background" 2>/dev/null || true)

if [[ -z "$WORKER_PIDS" ]]; then
    echo -e "${GREEN}✅ No worker processes found${NC}"
else
    echo -e "   Found worker PIDs: $WORKER_PIDS"

    # Kill workers gracefully first (SIGTERM)
    echo -e "   Sending SIGTERM to workers..."
    for pid in $WORKER_PIDS; do
        kill $pid 2>/dev/null || true
    done

    # Wait for graceful shutdown
    sleep 3

    # Check if any workers are still running
    REMAINING_PIDS=$(pgrep -f "dramatiq run_agent_background" 2>/dev/null || true)

    if [[ -n "$REMAINING_PIDS" ]]; then
        echo -e "${YELLOW}⚠️ Some workers still running, force killing...${NC}"
        for pid in $REMAINING_PIDS; do
            kill -9 $pid 2>/dev/null || true
        done
        sleep 1
    fi

    echo -e "${GREEN}✅ All worker processes stopped${NC}"
fi

echo ""

# Phase 2: Start worker
echo -e "${CYAN}🚀 Starting worker...${NC}"

cd "$PROJECT_ROOT/backend"

# Start worker in background with nohup
nohup uv run dramatiq run_agent_background > "$PROJECT_ROOT/logs/worker.log" 2>&1 &
WORKER_PID=$!

echo -e "   Worker PID: ${WORKER_PID}"

# Wait a moment for worker to start
sleep 3

# Verify worker is running
if ps -p $WORKER_PID > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Worker started successfully${NC}"
    
    # Show recent worker logs
    echo ""
    echo -e "${CYAN}📋 Recent worker logs:${NC}"
    tail -20 "$PROJECT_ROOT/logs/worker.log" | grep -E "(Broker|ready|AsyncIO|Error)" || echo "   (No relevant logs yet)"
else
    echo -e "${RED}❌ Worker failed to start${NC}"
    echo -e "   Check logs: tail -f $PROJECT_ROOT/logs/worker.log"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 Worker restart completed!${NC}"
echo -e "   Monitor logs: ${CYAN}tail -f $PROJECT_ROOT/logs/worker.log${NC}"
echo ""

