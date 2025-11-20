#!/bin/bash

# Start backend API
cd /Users/mac_1/Documents/GitHub/chainlens/backend
python -m uvicorn api:app --host 0.0.0.0 --port 8000 --reload > /tmp/backend_api.log 2>&1 &
BACKEND_PID=$!
echo "Backend API started with PID: $BACKEND_PID"

# Start Dramatiq worker
python -m dramatiq run_agent_background --processes 4 --threads 4 > /tmp/backend_worker.log 2>&1 &
WORKER_PID=$!
echo "Dramatiq worker started with PID: $WORKER_PID"

# Start frontend
cd /Users/mac_1/Documents/GitHub/chainlens/frontend
pnpm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend started with PID: $FRONTEND_PID"

echo "All services started!"
echo "Backend API PID: $BACKEND_PID"
echo "Worker PID: $WORKER_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Logs:"
echo "  Backend API: /tmp/backend_api.log"
echo "  Worker: /tmp/backend_worker.log"
echo "  Frontend: /tmp/frontend.log"
