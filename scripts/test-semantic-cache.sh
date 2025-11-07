#!/bin/bash
# Test Script for Semantic Cache (Story 2.1)
# This script helps test and monitor semantic cache performance

set -e

echo "🧪 Semantic Cache Test Script"
echo "=============================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Redis is running
echo -e "${BLUE}📊 Checking Redis connection...${NC}"
if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis is running${NC}"
else
    echo -e "${YELLOW}⚠️  Redis is not running. Please start Redis first.${NC}"
    echo "   Start with: docker-compose up -d redis (or redis-server)"
    exit 1
fi

# Check if backend is running
echo -e "${BLUE}📊 Checking backend server...${NC}"
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend server is running${NC}"
    BACKEND_RUNNING=true
else
    echo -e "${YELLOW}⚠️  Backend server is not running${NC}"
    echo "   Start with: cd backend && uv run uvicorn api:app --reload"
    BACKEND_RUNNING=false
fi

# Test semantic cache directly
echo ""
echo -e "${BLUE}🧪 Testing Semantic Cache Directly...${NC}"
cd backend
python3 << 'EOF'
import sys
import asyncio
sys.path.insert(0, '.')

async def test_semantic_cache():
    from core.optimizations.semantic_cache import get_semantic_cache
    from core.utils.config import OptimizationConfig, OptimizationMode
    
    # Set to OPTIMIZED mode
    OptimizationConfig.set_mode(OptimizationMode.OPTIMIZED)
    
    cache = get_semantic_cache()
    
    print(f"✅ Cache initialized:")
    print(f"   - Enabled: {cache.enabled}")
    print(f"   - Similarity threshold: {cache.similarity_threshold}")
    print(f"   - Quality threshold: {cache.quality_threshold}")
    print(f"   - Max cache size: {cache.max_cache_size}")
    
    # Test cache operations
    print(f"\n🧪 Testing cache operations...")
    
    # Cache a response
    query1 = "What is the weather today?"
    response1 = {"content": "The weather is sunny and warm."}
    await cache.cache_response(query1, response1)
    print(f"✅ Cached response for: '{query1}'")
    
    # Try to get cached response
    result = await cache.get_cached_response(query1)
    if result and result.get("cache_hit"):
        print(f"✅ Cache HIT: similarity={result.get('similarity_score', 0):.3f}")
    else:
        print(f"⚠️  Cache MISS (expected on first query)")
    
    # Test similar query
    query2 = "How's the weather?"
    result2 = await cache.get_cached_response(query2)
    if result2 and result2.get("cache_hit"):
        print(f"✅ Cache HIT for similar query: '{query2}'")
        print(f"   - Similarity: {result2.get('similarity_score', 0):.3f}")
        print(f"   - Cached query: {result2.get('cached_query', 'N/A')}")
    else:
        print(f"⚠️  Cache MISS for similar query (may need embedding model)")
    
    # Get metrics
    metrics = cache.get_metrics()
    print(f"\n📊 Cache Metrics:")
    print(f"   - Total requests: {metrics['total_requests']}")
    print(f"   - Cache hits: {metrics['cache_hits']}")
    print(f"   - Cache misses: {metrics['cache_misses']}")
    print(f"   - Hit rate: {metrics['hit_rate_percentage']:.2f}%")
    print(f"   - Cache size: {metrics['cache_size']}/{metrics['max_cache_size']}")
    
    print(f"\n✅ Semantic cache test completed!")

asyncio.run(test_semantic_cache())
EOF

echo ""
echo -e "${BLUE}📊 Monitoring Cache Metrics...${NC}"
echo "   (This will run for 30 seconds, monitoring cache metrics)"
echo ""

# Monitor cache metrics
python3 << 'EOF'
import sys
import time
import asyncio
sys.path.insert(0, 'backend')

async def monitor_metrics():
    from core.optimizations.semantic_cache import get_semantic_cache
    
    cache = get_semantic_cache()
    
    print("Time    | Requests | Hits | Misses | Hit Rate | Cache Size")
    print("--------|----------|------|--------|----------|-----------")
    
    for i in range(6):  # 6 iterations = 30 seconds
        metrics = cache.get_metrics()
        print(f"{i*5:3d}s   | {metrics['total_requests']:8d} | {metrics['cache_hits']:4d} | {metrics['cache_misses']:6d} | {metrics['hit_rate_percentage']:7.2f}% | {metrics['cache_size']:10d}/{metrics['max_cache_size']}")
        await asyncio.sleep(5)

asyncio.run(monitor_metrics())
EOF

echo ""
echo -e "${GREEN}✅ Test completed!${NC}"
echo ""
echo "Next steps:"
echo "1. Start backend server: cd backend && uv run uvicorn api:app --reload"
echo "2. Test with chat requests to see cache hit rate improvements"
echo "3. Monitor metrics via API endpoint (if available)"
echo "4. Check logs for cache hits/misses"

