#!/bin/bash

# Kill Ports Script for ChainLens Microservices
# This script kills processes running on specified ports

echo "🔧 Killing processes on ChainLens service ports..."

# Define ports
PORTS=(3001 3002 3003 3004 3006)
PORT_NAMES=("OnChain Analysis" "Sentiment Analysis" "Tokenomics Analysis" "Team Verification" "ChainLens Core")

# Function to kill process on a specific port
kill_port() {
    local port=$1
    local name=$2
    
    echo "Checking port $port ($name)..."
    
    # Find PID using lsof
    PID=$(lsof -ti:$port)
    
    if [ -z "$PID" ]; then
        echo "  ✓ Port $port is free"
    else
        echo "  ⚠️  Found process $PID on port $port"
        kill -9 $PID 2>/dev/null
        
        # Wait a moment and verify
        sleep 0.5
        if lsof -ti:$port > /dev/null 2>&1; then
            echo "  ❌ Failed to kill process on port $port"
            return 1
        else
            echo "  ✓ Successfully killed process on port $port"
        fi
    fi
    
    return 0
}

# Kill all ports
for i in "${!PORTS[@]}"; do
    kill_port "${PORTS[$i]}" "${PORT_NAMES[$i]}"
done

echo ""
echo "✅ Port cleanup completed!"
echo ""

