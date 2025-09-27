#!/bin/bash

# Quick launcher for Enhanced Monitoring Dashboard
# This script starts the 4-panel tmux monitoring dashboard

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Starting Chain Lens Enhanced Monitoring Dashboard..."
echo ""
echo "📊 Features:"
echo "   • 4-panel real-time log monitoring"
echo "   • Redis, Backend, Frontend, Worker logs"
echo "   • Color-coded log levels"
echo "   • Interactive tmux controls"
echo ""
echo "⚠️  Note: This will create a new tmux session 'chainlens-monitor'"
echo "          Press Ctrl+B then 'd' to detach and keep running"
echo ""

read -p "🎯 Ready to start? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    exec "$SCRIPT_DIR/enhanced_dashboard_monitor.sh"
else
    echo "❌ Cancelled."
    exit 0
fi