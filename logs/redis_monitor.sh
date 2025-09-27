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
