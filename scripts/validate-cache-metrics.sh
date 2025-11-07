#!/bin/bash
#
# Validate LiteLLM Redis cache metrics in production
# Usage: ./scripts/validate-cache-metrics.sh [base_url]
#

set -e

BASE_URL="${1:-http://localhost:8000}"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 LiteLLM Redis Cache Metrics Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Base URL: $BASE_URL"
echo ""

# Check cache health
echo "1. Checking cache health..."
HEALTH_RESPONSE=$(curl -s "$BASE_URL/api/cache/health" || echo "{}")
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | grep -o '"healthy":[^,]*' | cut -d: -f2 | tr -d ' "' || echo "false")

if [ "$HEALTH_STATUS" = "true" ]; then
    echo -e "${GREEN}✅ Cache health check passed${NC}"
else
    echo -e "${RED}❌ Cache health check failed${NC}"
    echo "Response: $HEALTH_RESPONSE"
    exit 1
fi

# Get cache metrics
echo ""
echo "2. Fetching cache metrics..."
METRICS_RESPONSE=$(curl -s "$BASE_URL/api/cache/metrics" || echo "{}")

# Extract metrics
TOTAL_REQUESTS=$(echo "$METRICS_RESPONSE" | grep -o '"total_requests":[^,]*' | cut -d: -f2 | tr -d ' ' || echo "0")
CACHE_HITS=$(echo "$METRICS_RESPONSE" | grep -o '"cache_hits":[^,]*' | cut -d: -f2 | tr -d ' ' || echo "0")
CACHE_MISSES=$(echo "$METRICS_RESPONSE" | grep -o '"cache_misses":[^,]*' | cut -d: -f2 | tr -d ' ' || echo "0")
HIT_RATE=$(echo "$METRICS_RESPONSE" | grep -o '"cache_hit_rate_percentage":[^,}]*' | cut -d: -f2 | tr -d ' ' || echo "0")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Cache Metrics"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Total Requests: $TOTAL_REQUESTS"
echo "Cache Hits: $CACHE_HITS"
echo "Cache Misses: $CACHE_MISSES"
echo "Hit Rate: ${HIT_RATE}%"
echo ""

# Validate metrics
if [ "$TOTAL_REQUESTS" -gt 0 ]; then
    echo -e "${GREEN}✅ Cache metrics available${NC}"
    
    # Check hit rate
    if (( $(echo "$HIT_RATE > 5" | bc -l 2>/dev/null || echo "0") )); then
        echo -e "${GREEN}✅ Cache hit rate above 5% threshold${NC}"
    elif (( $(echo "$HIT_RATE > 0" | bc -l 2>/dev/null || echo "0") )); then
        echo -e "${YELLOW}⚠️  Cache hit rate below 5% threshold (current: ${HIT_RATE}%)${NC}"
        echo "   This may be normal for new deployments. Monitor over 24-48 hours."
    else
        echo -e "${YELLOW}⚠️  Cache hit rate is 0%${NC}"
        echo "   Verify cache is enabled and queries are duplicate (exact matches)."
    fi
else
    echo -e "${YELLOW}⚠️  No cache requests yet${NC}"
    echo "   Metrics will be available after first LLM API calls."
fi

# Get performance metrics
echo ""
echo "3. Fetching performance metrics..."
PERF_RESPONSE=$(curl -s "$BASE_URL/api/cache/metrics/performance" || echo "{}")

AVG_RESPONSE_TIME=$(echo "$PERF_RESPONSE" | grep -o '"average_response_time_ms":[^,]*' | cut -d: -f2 | tr -d ' ' || echo "0")
CACHED_RESPONSE_TIME=$(echo "$PERF_RESPONSE" | grep -o '"cache_hit_response_time_ms":[^,]*' | cut -d: -f2 | tr -d ' ' || echo "0")
UNCACHED_RESPONSE_TIME=$(echo "$PERF_RESPONSE" | grep -o '"cache_miss_response_time_ms":[^,]*' | cut -d: -f2 | tr -d ' ' || echo "0")
LATENCY_IMPROVEMENT=$(echo "$PERF_RESPONSE" | grep -o '"latency_improvement":[^,}]*' | cut -d: -f2 | tr -d ' ' || echo "0")

if [ "$AVG_RESPONSE_TIME" != "0" ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "⚡ Performance Metrics"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Average Response Time: ${AVG_RESPONSE_TIME}ms"
    echo "Cached Response Time: ${CACHED_RESPONSE_TIME}ms"
    echo "Uncached Response Time: ${UNCACHED_RESPONSE_TIME}ms"
    echo "Latency Improvement: ${LATENCY_IMPROVEMENT}%"
    echo ""
    
    if (( $(echo "$LATENCY_IMPROVEMENT > 10" | bc -l 2>/dev/null || echo "0") )); then
        echo -e "${GREEN}✅ Latency improvement >10% (cache is working effectively)${NC}"
    elif (( $(echo "$LATENCY_IMPROVEMENT > 0" | bc -l 2>/dev/null || echo "0") )); then
        echo -e "${YELLOW}⚠️  Latency improvement <10% (monitor cache hit rate)${NC}"
    else
        echo -e "${YELLOW}⚠️  No latency improvement (verify cache is working)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Performance metrics not available yet${NC}"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Validation Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$HEALTH_STATUS" = "true" ] && [ "$TOTAL_REQUESTS" -gt 0 ]; then
    echo -e "${GREEN}✅ Cache is healthy and operational${NC}"
    echo ""
    echo "Next steps:"
    echo "  - Monitor cache hit rate over 24-48 hours"
    echo "  - Target hit rate: 10-20% for duplicate queries"
    echo "  - Verify cost savings: $5-10/month reduction"
    exit 0
elif [ "$HEALTH_STATUS" = "true" ]; then
    echo -e "${YELLOW}⚠️  Cache is healthy but no requests yet${NC}"
    echo ""
    echo "Next steps:"
    echo "  - Make test LLM API calls to generate cache metrics"
    echo "  - Re-run validation after first requests"
    exit 0
else
    echo -e "${RED}❌ Cache health check failed${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  - Verify Redis is running and accessible"
    echo "  - Check LITELLM_CACHE_ENABLED environment variable"
    echo "  - Review application logs for cache setup errors"
    exit 1
fi

