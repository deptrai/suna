#!/bin/bash
# Start Server and Test Semantic Cache (Story 2.1)
# This script starts the backend server and runs cache tests

set -e

echo "🚀 Starting Server and Testing Semantic Cache"
echo "=============================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check Redis
echo -e "${BLUE}📊 Checking Redis...${NC}"
if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis is running${NC}"
else
    echo -e "${YELLOW}⚠️  Starting Redis...${NC}"
    # Try to start Redis (adjust command as needed)
    if command -v docker-compose > /dev/null; then
        docker-compose up -d redis
        sleep 2
    elif command -v redis-server > /dev/null; then
        redis-server --daemonize yes
        sleep 2
    else
        echo -e "${RED}❌ Redis not found. Please install and start Redis.${NC}"
        exit 1
    fi
fi

# Set environment variables
echo -e "${BLUE}📝 Setting environment variables...${NC}"
export OPTIMIZATION_MODE=optimized
export SEMANTIC_CACHE_ENABLED=True
export SEMANTIC_CACHE_SIMILARITY_THRESHOLD=0.95
export SEMANTIC_CACHE_QUALITY_THRESHOLD=0.95
echo -e "${GREEN}✅ Environment variables set${NC}"

# Check if server is already running
echo -e "${BLUE}📊 Checking backend server...${NC}"
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend server is already running${NC}"
    SERVER_RUNNING=true
else
    echo -e "${YELLOW}⚠️  Backend server is not running${NC}"
    SERVER_RUNNING=false
fi

# Start server in background if not running
if [ "$SERVER_RUNNING" = false ]; then
    echo -e "${BLUE}🚀 Starting backend server...${NC}"
    cd backend
    
    # Start server in background
    nohup uv run uvicorn api:app --reload --host 0.0.0.0 --port 8000 > ../logs/server.log 2>&1 &
    SERVER_PID=$!
    echo -e "${GREEN}✅ Server started (PID: $SERVER_PID)${NC}"
    
    # Wait for server to start
    echo -e "${BLUE}⏳ Waiting for server to start...${NC}"
    for i in {1..30}; do
        if curl -s http://localhost:8000/health > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Server is ready!${NC}"
            break
        fi
        if [ $i -eq 30 ]; then
            echo -e "${RED}❌ Server failed to start${NC}"
            exit 1
        fi
        sleep 1
    done
fi

# Run cache tests
echo ""
echo -e "${BLUE}🧪 Running semantic cache tests...${NC}"
echo ""

# Test 1: Direct cache test
echo -e "${YELLOW}Test 1: Direct Cache Test${NC}"
python3 scripts/test-semantic-cache-chat.py

echo ""
echo -e "${YELLOW}Test 2: Cache Status${NC}"
python3 scripts/monitor-semantic-cache.py --status

echo ""
echo -e "${GREEN}✅ Tests completed!${NC}"
echo ""
echo "Next steps:"
echo "1. Monitor cache metrics: python3 scripts/monitor-semantic-cache.py --duration 60"
echo "2. Send chat requests to test cache hits"
echo "3. Check logs: tail -f logs/server.log | grep -i 'semantic cache'"
echo ""
echo "To stop server: kill $SERVER_PID (if started by this script)"

