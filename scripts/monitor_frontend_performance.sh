#!/bin/bash

# Frontend Performance Monitoring Script
# Monitors Next.js performance và detects issues early

FRONTEND_DIR="/Users/mac_1/Documents/GitHub/chainlens/apps/chainlens-automation/frontend"

echo "📊 CHAIN LENS FRONTEND PERFORMANCE MONITOR"
echo "=========================================="

# Function to get process stats
get_next_stats() {
    ps aux | grep -E "next-server|node.*3000" | grep -v grep | while read line; do
        cpu=$(echo $line | awk '{print $3}')
        mem=$(echo $line | awk '{print $4}')
        time=$(echo $line | awk '{print $10}')
        echo "CPU: ${cpu}% | Memory: ${mem}% | Runtime: ${time}"
    done
}

# Check if Next.js is running
check_status() {
    echo "🔍 Checking Next.js process..."
    
    NEXT_PROCESS=$(ps aux | grep -E "next-server|node.*3000" | grep -v grep)
    
    if [ -z "$NEXT_PROCESS" ]; then
        echo "❌ Next.js not running"
        echo "💡 Start with: cd $FRONTEND_DIR && ./temp_dev_optimized.sh"
        return 1
    fi
    
    echo "✅ Next.js is running:"
    get_next_stats
    
    # Check for high CPU usage
    CPU_USAGE=$(ps aux | grep -E "next-server" | grep -v grep | awk '{print $3}' | head -1)
    if [ ! -z "$CPU_USAGE" ]; then
        if (( $(echo "$CPU_USAGE > 150.0" | bc -l) )); then
            echo "⚠️  HIGH CPU USAGE DETECTED: ${CPU_USAGE}%"
            echo "🔧 Consider restarting with optimizations"
        elif (( $(echo "$CPU_USAGE > 50.0" | bc -l) )); then
            echo "⚡ Moderate CPU usage: ${CPU_USAGE}%"
        else
            echo "✅ Normal CPU usage: ${CPU_USAGE}%"
        fi
    fi
    
    return 0
}

# Monitor bundle size
check_bundle_size() {
    echo ""
    echo "📦 Bundle Analysis:"
    
    if [ -d "$FRONTEND_DIR/.next" ]; then
        BUNDLE_SIZE=$(du -sh "$FRONTEND_DIR/.next" 2>/dev/null | cut -f1)
        echo "  Build size: $BUNDLE_SIZE"
        
        # Check for large chunks
        if [ -d "$FRONTEND_DIR/.next/static/chunks" ]; then
            echo "  Largest chunks:"
            find "$FRONTEND_DIR/.next/static/chunks" -name "*.js" -exec ls -lh {} \; | sort -k5 -hr | head -3 | awk '{print "    " $5 " - " $9}'
        fi
    else
        echo "  No build found (.next directory missing)"
    fi
}

# Check for memory leaks
check_memory_usage() {
    echo ""
    echo "🧠 Memory Analysis:"
    
    # System memory
    TOTAL_MEM=$(sysctl -n hw.memsize | awk '{print $1/1024/1024/1024}')
    FREE_MEM=$(vm_stat | grep "Pages free" | awk '{print $3}' | sed 's/\.//' | awk '{print $1 * 4 / 1024}')
    
    echo "  System: ${FREE_MEM}MB free of ${TOTAL_MEM}GB total"
    
    # Next.js memory
    NEXT_MEM=$(ps aux | grep -E "next-server" | grep -v grep | awk '{print $6}' | head -1)
    if [ ! -z "$NEXT_MEM" ]; then
        NEXT_MEM_MB=$((NEXT_MEM / 1024))
        echo "  Next.js: ${NEXT_MEM_MB}MB"
        
        if [ $NEXT_MEM_MB -gt 2048 ]; then
            echo "⚠️  Next.js using high memory (>2GB)"
        fi
    fi
}

# Performance recommendations
show_recommendations() {
    echo ""
    echo "💡 Performance Recommendations:"
    echo "  1. Restart dev server every 2-3 hours to prevent memory leaks"
    echo "  2. Use bundle analyzer: ANALYZE=true pnpm build"
    echo "  3. Monitor for Server Action hash mismatches in logs"
    echo "  4. Check Activity Monitor for CPU spikes >150%"
    echo "  5. Clear .next cache if experiencing hot reload issues"
}

# Main execution
main() {
    check_status
    NEXT_RUNNING=$?
    
    if [ $NEXT_RUNNING -eq 0 ]; then
        check_bundle_size
        check_memory_usage
    fi
    
    show_recommendations
    
    echo ""
    echo "🔧 Quick fixes available:"
    echo "  ./fix_frontend_performance.sh  - Full reset and optimization"  
    echo "  ./monitor_frontend_performance.sh - This monitoring script"
}

# Check if bc is available for CPU calculations
if ! command -v bc &> /dev/null; then
    echo "Installing bc for CPU calculations..."
    brew install bc 2>/dev/null || echo "Please install bc: brew install bc"
fi

main