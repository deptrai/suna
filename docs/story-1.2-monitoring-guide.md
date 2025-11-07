# Story 1.2 Monitoring Guide: LiteLLM Redis Cache Metrics

**Story:** 1.2 - LiteLLM Redis Response Caching (Exact Matches)  
**Purpose:** Monitor cache performance, validate logging, and track cost savings  
**Date:** 2025-01-15

---

## Overview

This guide explains how to monitor LiteLLM Redis response caching (Story 1.2) performance, cache hit rates, and cost savings in production.

---

## Monitoring Methods

### 1. Application Logs

LiteLLM cache metrics are automatically logged for each API call:

**Cache HIT:**
```
📊 LiteLLM Cache HIT - model=gpt-4o-mini, cache_key=litellm:cache:abc123
```

**Cache MISS:**
```
📊 LiteLLM Cache MISS - model=gpt-4o-mini
```

**Aggregated Metrics (every 100 requests):**
```
📊 Cache Metrics Summary - Total: 100, Hits: 15, Misses: 85, Hit Rate: 15.0%
```

**Log Location:** Application logs (stdout/stderr or log files)

**Key Metrics:**
- `cache_hit`: Boolean indicating cache hit/miss
- `cache_key`: Redis cache key used
- `model`: LLM model name
- `hit_rate`: Percentage of cache hits

---

### 2. Cache Metrics API

The cache metrics API provides comprehensive monitoring data:

#### Get Cache Metrics

```bash
curl http://localhost:8000/api/cache/metrics
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_requests": 1000,
    "cache_hits": 250,
    "cache_misses": 750,
    "cache_hit_rate": 0.25,
    "cache_hit_rate_percentage": 25.0,
    "average_response_time_ms": 1250.5,
    "average_cached_response_time_ms": 150.2,
    "average_uncached_response_time_ms": 1850.8,
    "performance_improvement_percentage": 91.9,
    "model_stats": {
      "gpt-4o-mini": {
        "total": 500,
        "hits": 150,
        "misses": 350,
        "hit_rate": 0.3
      }
    }
  },
  "timestamp": "2025-01-15T12:00:00Z"
}
```

#### Get Cache Health

```bash
curl http://localhost:8000/api/cache/health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "healthy": true,
    "configured": true,
    "operational": true,
    "details": {
      "cache_type": "redis",
      "redis_connected": true,
      "metrics_available": true,
      "cache_hit_rate": 25.0
    }
  },
  "timestamp": "2025-01-15T12:00:00Z"
}
```

#### Get Cache Hit Rate

```bash
# Overall hit rate
curl http://localhost:8000/api/cache/metrics/hit-rate

# Per-model hit rate
curl http://localhost:8000/api/cache/metrics/hit-rate?model=gpt-4o-mini
```

**Response:**
```json
{
  "success": true,
  "data": {
    "overall_hit_rate": 25.0,
    "by_model": {
      "gpt-4o-mini": 30.0,
      "anthropic/claude-haiku-4-5": 20.0
    },
    "time_window": "24h"
  }
}
```

#### Get Cache Performance Metrics

```bash
curl http://localhost:8000/api/cache/metrics/performance
```

**Response:**
```json
{
  "success": true,
  "data": {
    "average_response_time_ms": 1500,
    "cache_hit_response_time_ms": 1200,
    "cache_miss_response_time_ms": 1800,
    "latency_improvement": 33.3
  }
}
```

---

## Dashboard Monitoring

### Key Metrics to Track

1. **Cache Hit Rate**
   - Target: 10-20% (for duplicate queries)
   - Alert threshold: <5% (indicates caching not working effectively)
   - Monitor: `/api/cache/metrics/hit-rate`

2. **Cache Operations**
   - Cache HITs: Number of successful cache retrievals
   - Cache MISSes: Number of cache misses
   - Monitor: `/api/cache/metrics`

3. **Performance Impact**
   - Response time improvement: Cache hits should be 50-90% faster
   - Monitor: `/api/cache/metrics/performance`

4. **Cost Savings**
   - Calculate: Reduced API calls due to cache hits
   - Target: $5-10/month reduction (for duplicate queries)
   - Monitor: Cache hit rate × average tokens per request × cost per token

5. **Redis Health**
   - Connection status: Redis should be connected
   - Cache TTL: Should be 1 hour (3600 seconds)
   - Monitor: `/api/cache/health`

### Example Dashboard Queries

#### Grafana/Prometheus

```promql
# Cache hit rate over time
rate(litellm_cache_hits_total[5m]) / rate(litellm_cache_requests_total[5m]) * 100

# Average cache hit rate by model
avg(litellm_cache_hit_rate) by (model)

# Cost savings estimation
sum(rate(litellm_cache_hits_total[1h])) * average_tokens_per_request * cost_per_token
```

#### Custom Monitoring Script

```python
#!/usr/bin/env python3
"""
Monitor LiteLLM Redis cache performance.
"""
import asyncio
import aiohttp
import json
from datetime import datetime, timedelta

async def monitor_cache_metrics():
    """Monitor cache metrics and display dashboard."""
    async with aiohttp.ClientSession() as session:
        # Get cache metrics
        async with session.get('http://localhost:8000/api/cache/metrics') as resp:
            metrics = await resp.json()
            data = metrics.get('data', {})
            
            print("=" * 60)
            print("LiteLLM Redis Cache Metrics Dashboard")
            print("=" * 60)
            print(f"Total Requests: {data.get('total_requests', 0)}")
            print(f"Cache Hits: {data.get('cache_hits', 0)}")
            print(f"Cache Misses: {data.get('cache_misses', 0)}")
            print(f"Hit Rate: {data.get('cache_hit_rate_percentage', 0):.2f}%")
            print(f"Performance Improvement: {data.get('performance_improvement_percentage', 0):.2f}%")
            print("=" * 60)
            
            # Per-model statistics
            model_stats = data.get('model_stats', {})
            if model_stats:
                print("\nPer-Model Statistics:")
                for model, stats in model_stats.items():
                    print(f"  {model}:")
                    print(f"    Total: {stats.get('total', 0)}")
                    print(f"    Hits: {stats.get('hits', 0)}")
                    print(f"    Misses: {stats.get('misses', 0)}")
                    print(f"    Hit Rate: {stats.get('hit_rate', 0) * 100:.2f}%")

if __name__ == '__main__':
    asyncio.run(monitor_cache_metrics())
```

---

## Validation Checklist

### Daily Validation

- [ ] Cache health check passes
- [ ] Cache hit rate >5% (target: 10-20%)
- [ ] No cache-related errors in logs
- [ ] Redis connection stable
- [ ] Cache metrics API returns valid data

### Weekly Validation

- [ ] Cache hit rate stable at 10-20%
- [ ] Cost savings measurable ($5-10/month)
- [ ] Performance improvement visible (cache hits faster)
- [ ] No quality degradation (exact matches = same responses)

### Monthly Validation

- [ ] Cache hit rate trends stable
- [ ] Cost savings consistent
- [ ] Cache TTL appropriate (not too short/long)
- [ ] Redis memory usage acceptable

---

## Alerting Thresholds

### Critical Alerts

- **Redis Connection Down**: Cache health check fails
- **Cache Hit Rate <1%**: Caching not working effectively
- **Cache Errors >10/hour**: Cache operations failing

### Warning Alerts

- **Cache Hit Rate <5%**: Below target (investigate)
- **Redis Memory Usage >80%**: Consider increasing memory or TTL adjustment
- **Cache TTL Expired Too Quickly**: Consider increasing TTL

---

## Troubleshooting

### Cache Hit Rate Too Low

**Symptoms:**
- Cache hit rate <5%
- Most requests are cache MISS

**Diagnosis:**
```bash
# Check cache metrics
curl http://localhost:8000/api/cache/metrics

# Check Redis keys
redis-cli KEYS "litellm:cache:*"

# Check cache TTL
redis-cli TTL "litellm:cache:example_key"
```

**Solution:**
1. Verify queries are actually duplicate (exact matches)
2. Increase cache TTL if queries repeat frequently
3. Monitor query patterns to identify duplicate queries

### Cache Not Working

**Symptoms:**
- Cache hit rate = 0%
- All requests show cache MISS

**Diagnosis:**
```bash
# Check cache health
curl http://localhost:8000/api/cache/health

# Check Redis connection
redis-cli ping

# Check environment variables
echo $LITELLM_CACHE_ENABLED
```

**Solution:**
1. Verify `LITELLM_CACHE_ENABLED=true`
2. Verify Redis is accessible
3. Check application logs for cache setup errors

---

## Related Documentation

- **Deployment Guide:** `docs/story-1.2-deployment-guide.md`
- **Traceability Matrix:** `docs/traceability-matrix-1.2.md`
- **Gate Decision:** `docs/gate-decision-story-1.2.yaml`
- **Story File:** `docs/stories/1-2-litellm-redis-response-caching-exact-matches.md`
- **Anthropic Cache Monitoring:** `docs/anthropic-cache-monitoring.md` (similar pattern)

---

**Last Updated:** 2025-01-15  
**Maintainer:** TEA Agent (Test Architect)

