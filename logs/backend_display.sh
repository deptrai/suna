#!/bin/bash
LOGS_DIR="$(dirname "$0")"
LOG_FILE="$LOGS_DIR/backend.log"

if [[ ! -f "$LOG_FILE" ]]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Waiting for backend.log..."
    while [[ ! -f "$LOG_FILE" ]]; do sleep 1; done
fi

echo "🔧 Backend Service Logs"
echo "======================"
tail -f "$LOG_FILE" | while read line; do
    timestamp=$(date '+%H:%M:%S')
    # Color code different log levels
    if echo "$line" | grep -i error >/dev/null; then
        echo -e "[$timestamp] \033[0;31m$line\033[0m"
    elif echo "$line" | grep -i warn >/dev/null; then
        echo -e "[$timestamp] \033[1;33m$line\033[0m"
    elif echo "$line" | grep -i info >/dev/null; then
        echo -e "[$timestamp] \033[0;32m$line\033[0m"
    else
        echo "[$timestamp] $line"
    fi
done
