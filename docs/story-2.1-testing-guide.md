# Story 2.1: Testing & Monitoring Guide

**Date:** 2025-11-07  
**Purpose:** Guide for testing and monitoring semantic cache performance

## Quick Start

### 1. Start Services

```bash
# Start Redis (if not running)
docker-compose up -d redis
# OR
redis-server

# Start Backend Server
cd backend
uv run uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

### 2. Verify Setup

```bash
# Check Redis
redis-cli ping
# Should return: PONG

# Check Backend
curl http://localhost:8000/health
# Should return: {"status": "healthy"}
```

### 3. Enable Semantic Cache

Set environment variable:
```bash
export OPTIMIZATION_MODE=optimized
export SEMANTIC_CACHE_ENABLED=True
```

Or add to `.env` file:
```bash
OPTIMIZATION_MODE=optimized
SEMANTIC_CACHE_ENABLED=True
SEMANTIC_CACHE_SIMILARITY_THRESHOLD=0.95
SEMANTIC_CACHE_QUALITY_THRESHOLD=0.95
SEMANTIC_CACHE_TTL=3600
SEMANTIC_CACHE_MAX_CACHE_SIZE=10000
```

---

## Testing Methods

### Method 1: Direct Python Test

```bash
# Run test script
cd scripts
python3 test-semantic-cache-chat.py
```

**Expected Output:**
```
🧪 Semantic Cache Chat Test
Cache enabled: True
Optimization mode: optimized

📝 Test Queries:
  1. What is the weather today?
  2. How's the weather?
  ...

🔍 Testing cache lookup...
  ✅ HIT: 'What is the weather today?...'
     Similarity: 0.987 | Cached: 'What is the weather today?...'
  ✅ HIT: 'How's the weather?...'
     Similarity: 0.956 | Cached: 'What is the weather today?...'

📊 Test Results
Total requests: 10
Cache hits: 4
Cache misses: 6
Hit rate: 40.00%
```

### Method 2: Monitor Metrics

```bash
# Monitor in real-time (60 seconds)
python3 scripts/monitor-semantic-cache.py --duration 60

# Show current status
python3 scripts/monitor-semantic-cache.py --status
```

**Expected Output:**
```
📊 Semantic Cache Metrics Monitor
Update interval: 5s | Duration: 60s
Optimization mode: optimized
Cache enabled: True

Time    | Requests | Hits | Misses | Hit Rate | Cache Size | Quality
--------|----------|------|--------|----------|------------|--------
   0s   |       10 |    4 |      6 |   40.00% |        5/10000 |   0.950
   5s   |       15 |    7 |      8 |   46.67% |        8/10000 |   0.952
  10s   |       20 |   10 |     10 |   50.00% |       10/10000 |   0.953
```

### Method 3: Test with Chat Requests

#### Using curl

```bash
# Send similar queries to test cache
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is the weather today?",
    "thread_id": "test-thread-1"
  }'

# Send similar query (should hit cache)
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "How is the weather?",
    "thread_id": "test-thread-1"
  }'
```

#### Using Python Script

```python
import requests
import asyncio

# Similar queries to test semantic cache
queries = [
    "What is the weather today?",
    "How's the weather?",
    "Tell me about the weather",
    "What's the weather like?",
]

for query in queries:
    response = requests.post(
        "http://localhost:8000/api/chat",
        json={"message": query, "thread_id": "test-thread"}
    )
    print(f"Query: {query}")
    print(f"Response: {response.json()}")
    print()
```

---

## Monitoring Metrics

### 1. Check Cache Status

```bash
python3 scripts/monitor-semantic-cache.py --status
```

### 2. Monitor Real-Time Metrics

```bash
# Monitor for 5 minutes
python3 scripts/monitor-semantic-cache.py --duration 300 --interval 10
```

### 3. Check Metrics via API (if available)

```bash
# Get cache metrics
curl http://localhost:8000/api/quality/optimization-mode/stats

# Get semantic cache metrics (if endpoint exists)
curl http://localhost:8000/api/cache/semantic/metrics
```

### 4. Check Logs

```bash
# Watch logs for cache hits/misses
tail -f logs/app.log | grep -E "Semantic cache|cache HIT|cache MISS"
```

**Expected Log Output:**
```
✅ Semantic cache HIT: similarity=0.987, cache_key=abc123..., query='What is the weather today?...'
✅ Semantic cache HIT for query: 'How's the weather?...' (similarity=0.956)
```

---

## Performance Verification

### 1. Cache Hit Rate

**Target:** 20-40% hit rate for semantically similar queries

**Check:**
```bash
python3 scripts/monitor-semantic-cache.py --status
```

**Expected:**
- Hit rate: 20-40% (after warm-up)
- Cache hits increase over time
- Similar queries show high similarity scores (>0.95)

### 2. Latency Improvement

**Target:** 90% faster for cache hits

**Test:**
```bash
# Time first request (cache miss)
time curl -X POST http://localhost:8000/api/chat -d '{"message": "test"}'

# Time similar request (cache hit)
time curl -X POST http://localhost:8000/api/chat -d '{"message": "test similar"}'
```

**Expected:**
- Cache hit: ~10-20ms (from cache)
- Cache miss: ~100-500ms (LLM call)

### 3. Quality Verification

**Target:** 95-100% quality maintained

**Check Metrics:**
```bash
python3 scripts/monitor-semantic-cache.py --status
```

**Expected:**
- Average quality score: >0.95
- Quality breaches: 0 (or minimal)
- Auto-disables: 0

---

## Tuning max_cache_size

### Current Default
- Default: 10,000 items
- Configurable via environment variable (not yet, but can be added)

### When to Increase

**Increase if:**
- Cache size consistently > 80% of max
- Frequent evictions in logs
- High cache hit rate but cache is full

**Decrease if:**
- Memory constraints
- Rarely reaching 50% of max
- Want faster eviction cycles

### How to Tune

#### Option 1: Modify Code (Temporary)

Edit `backend/core/optimizations/semantic_cache.py`:
```python
# In get_semantic_cache() function
max_cache_size = getattr(config, 'SEMANTIC_CACHE_MAX_CACHE_SIZE', 20000)  # Increase to 20K
```

#### Option 2: Add Environment Variable (Recommended)

Add to `backend/core/utils/config.py`:
```python
# Semantic Cache Configuration (Story 2.1)
SEMANTIC_CACHE_MAX_CACHE_SIZE: Optional[int] = 10000  # Default 10,000 items
```

Then in `.env`:
```bash
SEMANTIC_CACHE_MAX_CACHE_SIZE=20000
```

### Monitoring Cache Size

```bash
# Check current cache size
python3 scripts/monitor-semantic-cache.py --status | grep "Cache size"

# Monitor cache size over time
python3 scripts/monitor-semantic-cache.py --duration 300
```

**Recommendations:**
- **< 1,000 items:** Default (10,000) is fine
- **1,000 - 5,000 items:** Default (10,000) is fine
- **5,000 - 10,000 items:** Consider increasing to 20,000
- **> 10,000 items:** Consider vector database (FAISS/ChromaDB)

---

## Troubleshooting

### Low Cache Hit Rate

**Symptoms:**
- Hit rate < 10%
- Most requests are cache misses

**Possible Causes:**
1. Queries are too diverse
2. Similarity threshold too high (0.95)
3. Cache not enabled
4. Not in OPTIMIZED mode

**Solutions:**
```bash
# 1. Check cache is enabled
python3 scripts/monitor-semantic-cache.py --status

# 2. Lower similarity threshold
export SEMANTIC_CACHE_SIMILARITY_THRESHOLD=0.90

# 3. Verify optimization mode
export OPTIMIZATION_MODE=optimized

# 4. Check logs for errors
tail -f logs/app.log | grep -i "semantic cache"
```

### High Cache Miss Rate

**Symptoms:**
- Cache misses > 80%
- Very few cache hits

**Possible Causes:**
1. Cache just started (cold cache)
2. Queries are unique
3. Cache key context too restrictive

**Solutions:**
1. Wait for cache warm-up (send similar queries)
2. Check if queries are truly similar
3. Verify cache key context (temperature/max_tokens excluded)

### Quality Degradation

**Symptoms:**
- Quality breaches > 0
- Auto-disable triggered
- Quality score < 0.95

**Solutions:**
```bash
# 1. Check quality metrics
python3 scripts/monitor-semantic-cache.py --status

# 2. Review quality breaches
# Check logs for quality breach warnings

# 3. Adjust quality threshold (if needed)
export SEMANTIC_CACHE_QUALITY_THRESHOLD=0.92

# 4. Re-enable cache if auto-disabled
# (Cache will auto-disable after 5 consecutive breaches)
```

### Performance Issues

**Symptoms:**
- Slow cache lookups
- High latency
- Redis connection issues

**Solutions:**
```bash
# 1. Check Redis connection
redis-cli ping

# 2. Check Redis performance
redis-cli --latency

# 3. Verify SCAN is being used (not keys)
# Check logs for "scan_iter" vs "keys"

# 4. Monitor cache size
# Large cache sizes may slow down search
python3 scripts/monitor-semantic-cache.py --status
```

---

## Best Practices

### 1. Monitor Regularly
- Check cache metrics daily
- Monitor hit rate trends
- Watch for quality degradation

### 2. Tune Based on Usage
- Adjust similarity threshold based on hit rate
- Tune max_cache_size based on memory and usage
- Monitor quality scores

### 3. Test with Real Queries
- Use actual user queries for testing
- Test with similar queries to verify caching
- Monitor performance in production

### 4. Document Findings
- Record cache hit rates
- Note quality scores
- Document any issues or optimizations

---

## Expected Results

### After Warm-Up (100+ requests)

- **Cache Hit Rate:** 20-40%
- **Average Similarity:** >0.95
- **Average Quality:** >0.95
- **Cache Size:** 50-200 items (varies by usage)
- **Quality Breaches:** 0-2%
- **Auto-Disables:** 0

### Performance Metrics

- **Cache Hit Latency:** 10-20ms
- **Cache Miss Latency:** 100-500ms (LLM call)
- **Embedding Generation:** 50-100ms (non-blocking)
- **Vector Search:** 50-200ms (depends on cache size)

---

## Next Steps

1. ✅ **Start server** - Backend running on port 8000
2. ✅ **Test with chat** - Send similar queries
3. ✅ **Monitor metrics** - Use monitor script
4. ✅ **Verify cache hits** - Check logs and metrics
5. ✅ **Tune if needed** - Adjust thresholds and cache size

---

**Last Updated:** 2025-11-07  
**Status:** Ready for Testing

