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
