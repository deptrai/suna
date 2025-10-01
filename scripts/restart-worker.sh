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

# Kill dramatiq workers
echo -e "   Killing dramatiq processes..."
pkill -f "dramatiq.*run_agent_background" 2>/dev/null || true
pkill -9 -f "dramatiq.*run_agent_background" 2>/dev/null || true

# Kill spawn_main processes (worker spawns)
echo -e "   Killing spawn_main processes..."
pkill -f "spawn_main" 2>/dev/null || true
pkill -9 -f "spawn_main" 2>/dev/null || true

# Additional cleanup for orphaned processes
echo -e "   Cleaning up orphaned processes..."
pkill -f "run_agent_background" 2>/dev/null || true
pkill -9 -f "run_agent_background" 2>/dev/null || true

# Wait for processes to die
sleep 2

# Verify all workers are stopped
worker_count=$(pgrep -f "dramatiq.*run_agent_background|spawn_main|run_agent_background" 2>/dev/null | wc -l)
if [[ $worker_count -eq 0 ]]; then
    echo -e "${GREEN}✅ All worker processes stopped${NC}"
else
    echo -e "${YELLOW}⚠️ Warning: $worker_count worker processes still running${NC}"
    echo -e "   Attempting force kill..."
    pkill -9 -f "dramatiq" 2>/dev/null || true
    sleep 1
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

