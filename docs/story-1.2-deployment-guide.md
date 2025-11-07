# Story 1.2 Deployment Guide: LiteLLM Redis Response Caching

**Story:** 1.2 - LiteLLM Redis Response Caching (Exact Matches)  
**Gate Decision:** ✅ PASS  
**Status:** Ready for Production Deployment  
**Date:** 2025-01-15

---

## 📋 Pre-Deployment Checklist

### ✅ Quality Gate Validation

- [x] **Traceability:** All 6 acceptance criteria fully tested (100% coverage)
- [x] **Test Quality:** 14/14 tests meet quality standards (11 unit + 3 integration)
- [x] **Gate Decision:** PASS (all P0 and P1 criteria met)
- [x] **Security:** No security issues detected
- [x] **Performance:** Cache TTL configured, metrics tracking enabled

### ✅ Configuration Verification

- [x] **Redis Instance:** Running and accessible (used for Dramatiq workers)
- [x] **LiteLLM Cache Configuration:** Enabled with exact match strategy
- [x] **Cache Key Namespacing:** Prefix `litellm:cache:` configured
- [x] **Cache TTL:** Default 1 hour (3600 seconds), configurable via env var
- [x] **Cache Metrics:** Tracking and logging enabled

### ✅ Environment Variables

Verify the following environment variables are set:

```bash
# Redis Configuration (should already be set)
REDIS_HOST=localhost  # or your Redis host
REDIS_PORT=6379
REDIS_PASSWORD=  # if required

# LiteLLM Cache Configuration
LITELLM_CACHE_ENABLED=true  # Enable caching
LITELLM_CACHE_TTL=3600  # 1 hour default (optional)
LITELLM_CACHE_KEY_PREFIX=litellm:cache:  # Namespace prefix (optional)
```

---

## 🚀 Deployment Steps

### Step 1: Pre-Deployment Validation

**1.1 Run Unit Tests Locally**

```bash
cd backend
uv run pytest tests/test_litellm_redis_caching.py -v -m "not integration"
```

**Expected:** All 11 unit tests pass

**1.2 Verify Redis Connectivity**

```bash
# Test Redis connection
redis-cli ping
# Expected: PONG

# Or via Python
python3 -c "from core.services import redis; import asyncio; asyncio.run(redis.initialize_async()); print('✅ Redis connected')"
```

**1.3 Verify Cache Configuration**

```bash
# Check cache health via API (if service is running)
curl http://localhost:8000/api/cache/health

# Expected response:
# {
#   "healthy": true,
#   "details": {
#     "redis_connected": true,
#     "cache_enabled": true,
#     "ttl": 3600
#   }
# }
```

### Step 2: Staging Deployment

**2.1 Deploy to Staging**

```bash
# Deploy to staging environment
# (Use your deployment process)

# Verify deployment
curl http://staging.example.com/api/cache/health
```

**2.2 Run Integration Tests in Staging**

```bash
# Run integration tests with Redis and LLM API access
cd backend
uv run pytest tests/test_litellm_redis_caching.py -v -m "integration" \
  --env REDIS_HOST=staging-redis.example.com \
  --env LITELLM_CACHE_ENABLED=true
```

**Expected:** All 3 integration tests pass

**2.3 Validate Cache Functionality**

```bash
# Make test LLM call (cache miss)
curl -X POST http://staging.example.com/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, test cache",
    "model": "gpt-4o-mini"
  }'

# Make identical LLM call (should be cache hit)
curl -X POST http://staging.example.com/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, test cache",
    "model": "gpt-4o-mini"
  }'

# Check cache metrics
curl http://staging.example.com/api/cache/metrics
```

**Expected:**
- First call: Cache MISS (response time ~1-2s)
- Second call: Cache HIT (response time ~0.1-0.5s, faster)
- Cache metrics show 1 hit, 1 miss

### Step 3: Production Deployment

**3.1 Deploy to Production**

```bash
# Deploy to production
# (Use your deployment process)

# Verify deployment
curl http://production.example.com/api/cache/health
```

**3.2 Monitor Initial Deploy**

Monitor for 24-48 hours:
- Cache hit/miss rates
- Response times
- Error rates
- Redis connection stability

**3.3 Validate Production Metrics**

```bash
# Check cache metrics after 1 hour
curl http://production.example.com/api/cache/metrics

# Expected:
# - Cache hit rate: 10-20% (for duplicate queries)
# - No errors in cache operations
# - Redis connection stable
```

---

## 🔍 Monitoring & Validation

### Cache Metrics Monitoring

**Key Metrics to Track:**

1. **Cache Hit Rate**
   - Target: 10-20% for duplicate queries
   - Alert threshold: <5% (indicates caching not working)
   - Monitor: `/api/cache/metrics/hit-rate`

2. **Cache Operations**
   - Cache HITs: Number of successful cache retrievals
   - Cache MISSes: Number of cache misses
   - Monitor: `/api/cache/metrics`

3. **Performance Impact**
   - Response time improvement: Cache hits should be 50-90% faster
   - Monitor: `/api/cache/metrics/performance`

4. **Cost Savings**
   - Target: $5-10/month reduction (for duplicate queries)
   - Calculate: (cache_read_tokens / total_input_tokens) * cost_per_token

### Monitoring Endpoints

**Cache Health Check:**
```bash
curl http://localhost:8000/api/cache/health
```

**Cache Metrics:**
```bash
curl http://localhost:8000/api/cache/metrics
```

**Cache Hit Rate:**
```bash
curl http://localhost:8000/api/cache/metrics/hit-rate
```

**Performance Metrics:**
```bash
curl http://localhost:8000/api/cache/metrics/performance
```

### Application Logs

**Cache HIT Log:**
```
📊 LiteLLM Cache HIT - model=gpt-4o-mini, cache_key=litellm:cache:abc123
```

**Cache MISS Log:**
```
📊 LiteLLM Cache MISS - model=gpt-4o-mini
```

**Aggregated Metrics Log (every 100 requests):**
```
📊 Cache Metrics Summary - Total: 100, Hits: 15, Misses: 85, Hit Rate: 15.0%
```

### Validation Script

Create a validation script to check cache functionality:

```python
#!/usr/bin/env python3
"""
Validate LiteLLM Redis cache functionality in production.
"""
import asyncio
import aiohttp
import json

async def validate_cache_functionality():
    """Validate cache functionality with test calls."""
    async with aiohttp.ClientSession() as session:
        # First call (cache miss)
        async with session.post(
            'http://localhost:8000/api/v1/chat',
            json={'message': 'Test cache validation', 'model': 'gpt-4o-mini'}
        ) as resp:
            result1 = await resp.json()
            print(f"First call (cache miss): {result1.get('response_time_ms', 'N/A')}ms")
        
        # Second call (should be cache hit)
        async with session.post(
            'http://localhost:8000/api/v1/chat',
            json={'message': 'Test cache validation', 'model': 'gpt-4o-mini'}
        ) as resp:
            result2 = await resp.json()
            print(f"Second call (cache hit): {result2.get('response_time_ms', 'N/A')}ms")
        
        # Check metrics
        async with session.get('http://localhost:8000/api/cache/metrics') as resp:
            metrics = await resp.json()
            print(f"Cache metrics: {json.dumps(metrics, indent=2)}")

if __name__ == '__main__':
    asyncio.run(validate_cache_functionality())
```

---

## 📊 Success Criteria

### Immediate (24-48 hours)

- ✅ Cache health check returns healthy
- ✅ Cache metrics API returns valid data
- ✅ Cache hit rate >5% (initial)
- ✅ No cache-related errors in logs
- ✅ Redis connection stable

### Short-term (1 week)

- ✅ Cache hit rate reaches 10-20% target
- ✅ Response time improvement visible (cache hits faster)
- ✅ Cost savings measurable ($5-10/month)
- ✅ No quality degradation (exact matches = same responses)

### Long-term (1 month)

- ✅ Cache hit rate stable at 10-20%
- ✅ Cost savings consistent
- ✅ Cache metrics dashboard integrated (Story 2.4)
- ✅ A/B testing framework implemented (Story 2.4)

---

## 🚨 Troubleshooting

### Issue: Cache Not Working

**Symptoms:**
- Cache hit rate = 0%
- All requests show cache MISS
- No cache keys in Redis

**Diagnosis:**
```bash
# Check cache configuration
curl http://localhost:8000/api/cache/health

# Check Redis connection
redis-cli ping

# Check environment variables
echo $LITELLM_CACHE_ENABLED
echo $REDIS_HOST
```

**Solution:**
1. Verify `LITELLM_CACHE_ENABLED=true`
2. Verify Redis is accessible
3. Check application logs for cache setup errors
4. Verify cache configuration in `backend/core/services/llm.py`

### Issue: Cache Hit Rate Too Low

**Symptoms:**
- Cache hit rate <5%
- Most requests are cache MISS

**Diagnosis:**
- Check if queries are actually duplicate (exact matches)
- Verify cache TTL is appropriate (not too short)
- Check Redis key expiration

**Solution:**
1. Increase cache TTL if queries repeat frequently
2. Verify exact match caching is working (not semantic)
3. Monitor query patterns to identify duplicate queries

### Issue: Redis Connection Errors

**Symptoms:**
- Cache health check fails
- Redis connection errors in logs
- Cache operations fail

**Diagnosis:**
```bash
# Test Redis connection
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping

# Check Redis logs
redis-cli monitor
```

**Solution:**
1. Verify Redis is running and accessible
2. Check Redis connection configuration (host, port, password)
3. Verify network connectivity
4. Check Redis memory limits

---

## 📚 Related Documentation

- **Traceability Matrix:** `docs/traceability-matrix-1.2.md`
- **Gate Decision:** `docs/gate-decision-story-1.2.yaml`
- **Story File:** `docs/stories/1-2-litellm-redis-response-caching-exact-matches.md`
- **Monitoring Guide:** `docs/story-1.2-monitoring-guide.md` (created below)
- **Cache Metrics API:** `backend/core/api/cache_metrics_api.py`

---

## ✅ Post-Deployment Checklist

- [ ] Cache health check passes
- [ ] Cache metrics API returns valid data
- [ ] Cache hit rate >5% after 24 hours
- [ ] No cache-related errors in logs
- [ ] Redis connection stable
- [ ] Response times improved for cache hits
- [ ] Cost savings measurable
- [ ] Monitoring alerts configured

---

**Last Updated:** 2025-01-15  
**Maintainer:** TEA Agent (Test Architect)

