#!/bin/bash

# Simple startup script for Chain Lens
set -e

echo "🚀 Starting Chain Lens Development Environment (Simple Mode)"
echo "======================================================"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "📁 Project root: $PROJECT_ROOT"

# Check environment
if [[ ! -f "backend/.env" ]]; then
    echo "❌ Missing backend/.env file"
    exit 1
fi

echo "🔄 Loading environment variables..."
source backend/.env

# Cleanup old processes
echo "🧹 Cleaning up old processes..."
pkill -f "dramatiq\|uvicorn\|npm.*dev\|next.*dev" 2>/dev/null || true
sleep 2

# Check Redis
echo "🔍 Checking Redis..."
if ! redis-cli ping >/dev/null 2>&1; then
    echo "❌ Redis not running. Please start Redis first:"
    echo "   brew services start redis"
    exit 1
fi
echo "✅ Redis is running"

# Check Supabase
echo "🔍 Checking Supabase..."
if ! curl -s "$SUPABASE_URL" >/dev/null 2>&1; then
    echo "⚠️  Supabase not responding at $SUPABASE_URL"
    echo "   Make sure Supabase is running"
fi

# Create logs directory
mkdir -p logs

# Start backend
echo "🚀 Starting Backend..."
cd backend
nohup uv run uvicorn api:app --reload --host 127.0.0.1 --port 8000 > "../logs/backend.log" 2>&1 &
BACKEND_PID=$!
cd ..

# Wait for backend to start
echo "⏳ Waiting for backend to be ready..."
for i in {1..30}; do
    if curl -s http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
        echo "✅ Backend is ready"
        break
    fi
    if [[ $i -eq 30 ]]; then
        echo "❌ Backend failed to start"
        exit 1
    fi
    sleep 1
done

# Start worker
echo "🚀 Starting Worker..."
cd backend
nohup uv run dramatiq run_agent_background > "../logs/worker.log" 2>&1 &
WORKER_PID=$!
cd ..

# Build and start frontend
echo "🚀 Building and starting Frontend..."
cd frontend
echo "📦 Installing dependencies..."
pnpm install --silent

echo "🔨 Building frontend..."
pnpm run build

echo "🚀 Starting frontend..."
nohup pnpm run dev > "../logs/frontend.log" 2>&1 &
FRONTEND_PID=$!
cd ..

# Wait for frontend
echo "⏳ Waiting for frontend to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:3000 >/dev/null 2>&1; then
        echo "✅ Frontend is ready"
        break
    fi
    if [[ $i -eq 30 ]]; then
        echo "⚠️  Frontend may still be starting..."
        break
    fi
    sleep 1
done

echo ""
echo "🎉 STARTUP COMPLETED!"
echo "==================="
echo "🌐 Frontend:   http://localhost:3000"
echo "🔧 Backend:    http://127.0.0.1:8000"
echo "📚 API Docs:   http://127.0.0.1:8000/docs"
echo ""
echo "📋 Process IDs:"
echo "   Backend: $BACKEND_PID"
echo "   Worker:  $WORKER_PID" 
echo "   Frontend: $FRONTEND_PID"
echo ""
echo "📄 Logs:"
echo "   Backend:  $PROJECT_ROOT/logs/backend.log"
echo "   Worker:   $PROJECT_ROOT/logs/worker.log"
echo "   Frontend: $PROJECT_ROOT/logs/frontend.log"
echo ""
echo "🛑 To stop all services:"
echo "   pkill -f 'dramatiq|uvicorn|npm.*dev|next.*dev'"
