# Anthropic Cache Monitoring Guide

## Overview

This guide explains how to monitor Anthropic explicit caching (Story 1.3) performance and cache hit rates in production.

## Monitoring Methods

### 1. Application Logs

Anthropic cache metrics are automatically logged for each API call:

```
📊 Anthropic Cache Metrics - model=anthropic/claude-haiku-4-5, 
   cache_creation_tokens=750, 
   cache_read_tokens=0, 
   total_cached_tokens=750, 
   cache_hit_rate=0.00%
```

**Log Location**: Application logs (stdout/stderr or log files)

**Key Metrics**:
- `cache_creation_tokens`: Number of tokens cached in this call
- `cache_read_tokens`: Number of tokens read from cache in this call
- `total_cached_tokens`: Sum of creation + read tokens
- `cache_hit_rate`: Percentage of input tokens read from cache

### 2. Quality Monitor API

The quality monitoring framework (Story 2.4) tracks Anthropic cache metrics:

```python
from core.optimizations.quality_monitor import get_quality_monitor

async def get_cache_metrics():
    quality_monitor = get_quality_monitor()
    metrics = await quality_monitor.get_metrics()
    
    # Get Anthropic cache hit rate
    cache_hit_rate = metrics.get('anthropic_cache_hit_rate', {})
    
    print(f"Average cache hit rate: {cache_hit_rate.get('average', 0)}%")
    print(f"Total samples: {cache_hit_rate.get('count', 0)}")
    print(f"Min: {cache_hit_rate.get('min', 0)}%")
    print(f"Max: {cache_hit_rate.get('max', 0)}%")
```

### 3. Cache Metrics API Endpoints

Check cache metrics via HTTP API:

#### Get Cache Metrics

```bash
curl http://localhost:8000/api/cache/metrics
```

**Response**:
```json
{
  "total_requests": 1000,
  "cache_hits": 250,
  "cache_misses": 750,
  "hit_rate": 25.0,
  "models": {
    "anthropic/claude-haiku-4-5": {
      "requests": 500,
      "hits": 150,
      "misses": 350,
      "hit_rate": 30.0
    }
  }
}
```

#### Get Cache Health

```bash
curl http://localhost:8000/api/cache/health
```

**Response**:
```json
{
  "healthy": true,
  "details": {
    "redis_connected": true,
    "cache_enabled": true,
    "ttl": 3600
  }
}
```

#### Get Cache Hit Rate

```bash
curl http://localhost:8000/api/cache/metrics/hit-rate
```

**Response**:
```json
{
  "overall_hit_rate": 25.0,
  "by_model": {
    "anthropic/claude-haiku-4-5": 30.0,
    "anthropic/claude-sonnet-4-5": 20.0
  },
  "time_window": "24h"
}
```

#### Get Cache Performance Metrics

```bash
curl http://localhost:8000/api/cache/metrics/performance
```

**Response**:
```json
{
  "average_response_time_ms": 1500,
  "cache_hit_response_time_ms": 1200,
  "cache_miss_response_time_ms": 1800,
  "latency_improvement": 33.3
}
```

## Dashboard Monitoring

### Key Metrics to Track

1. **Cache Hit Rate**
   - Target: 20-30% (typical for system prompts)
   - Alert threshold: <10% (indicates caching not working effectively)

2. **Cache Creation Tokens**
   - Monitor: Average tokens cached per call
   - Expected: 500-1500 tokens (system prompts)

3. **Cache Read Tokens**
   - Monitor: Average tokens read from cache per call
   - Expected: 500-1500 tokens (when cache hit occurs)

4. **Cost Savings**
   - Calculate: (cache_read_tokens / total_input_tokens) * 100%
   - Target: 20-30% cost reduction

5. **Latency Improvement**
   - Monitor: Response time difference (cache hit vs miss)
   - Expected: 10-20% faster for cached prompts

### Example Dashboard Queries

#### Grafana/Prometheus

```promql
# Cache hit rate over time
rate(anthropic_cache_read_tokens_total[5m]) / rate(anthropic_cache_input_tokens_total[5m]) * 100

# Average cache hit rate by model
avg(anthropic_cache_hit_rate) by (model)

# Cost savings estimation
sum(rate(anthropic_cache_read_tokens_total[1h])) * 0.000001 * 0.15  # $0.15 per 1M tokens
```

#### Custom Monitoring Script

```python
#!/usr/bin/env python3
"""
Monitor Anthropic cache performance.
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
        
        # Get cache hit rate
        async with session.get('http://localhost:8000/api/cache/metrics/hit-rate') as resp:
            hit_rate = await resp.json()
        
        # Get performance metrics
        async with session.get('http://localhost:8000/api/cache/metrics/performance') as resp:
            performance = await resp.json()
        
        # Display dashboard
        print("=" * 60)
        print("ANTHROPIC CACHE MONITORING DASHBOARD")
        print("=" * 60)
        print(f"Time: {datetime.now().isoformat()}")
        print()
        
        print("📊 Overall Metrics:")
        print(f"  Total Requests: {metrics['total_requests']}")
        print(f"  Cache Hits: {metrics['cache_hits']}")
        print(f"  Cache Misses: {metrics['cache_misses']}")
        print(f"  Hit Rate: {metrics['hit_rate']:.2f}%")
        print()
        
        print("📈 Performance:")
        print(f"  Average Response Time: {performance['average_response_time_ms']:.0f}ms")
        print(f"  Cache Hit Response Time: {performance['cache_hit_response_time_ms']:.0f}ms")
        print(f"  Cache Miss Response Time: {performance['cache_miss_response_time_ms']:.0f}ms")
        print(f"  Latency Improvement: {performance['latency_improvement']:.1f}%")
        print()
        
        print("🎯 By Model:")
        for model, stats in hit_rate.get('by_model', {}).items():
            print(f"  {model}: {stats:.2f}%")
        print()
        
        # Calculate cost savings
        if metrics['cache_hits'] > 0:
            # Estimate: $0.15 per 1M input tokens (Claude Haiku)
            avg_cache_read_tokens = 750  # Typical system prompt size
            total_cache_read_tokens = metrics['cache_hits'] * avg_cache_read_tokens
            cost_savings = (total_cache_read_tokens / 1_000_000) * 0.15
            print(f"💰 Estimated Cost Savings: ${cost_savings:.2f}")
            print(f"   (Based on {total_cache_read_tokens:,} cached tokens)")
        print()
        
        print("=" * 60)

if __name__ == "__main__":
    asyncio.run(monitor_cache_metrics())
```

## Alerting

### Recommended Alerts

1. **Low Cache Hit Rate**
   - Condition: Hit rate < 10% for 1 hour
   - Action: Investigate why caching is not effective
   - Possible causes: System prompts too small, messages not identical, cache TTL too short

2. **High Cache Miss Rate**
   - Condition: Miss rate > 90% for 1 hour
   - Action: Check cache configuration and Anthropic API status
   - Possible causes: Cache disabled, API issues, configuration problems

3. **Cache Health Issues**
   - Condition: Cache health check fails
   - Action: Check Redis connectivity and cache configuration
   - Possible causes: Redis down, configuration errors

### Alert Configuration

```yaml
# Prometheus Alert Rules
groups:
  - name: anthropic_cache
    rules:
      - alert: LowCacheHitRate
        expr: rate(anthropic_cache_hit_rate[1h]) < 0.10
        for: 1h
        annotations:
          summary: "Anthropic cache hit rate is low"
          description: "Cache hit rate is {{ $value }}% (target: 20-30%)"
      
      - alert: HighCacheMissRate
        expr: rate(anthropic_cache_miss_rate[1h]) > 0.90
        for: 1h
        annotations:
          summary: "Anthropic cache miss rate is high"
          description: "Cache miss rate is {{ $value }}% (target: 70-80%)"
      
      - alert: CacheHealthCheckFailed
        expr: anthropic_cache_health == 0
        for: 5m
        annotations:
          summary: "Anthropic cache health check failed"
          description: "Cache health check is failing - investigate immediately"
```

## Performance Optimization

### Improving Cache Hit Rate

1. **Optimize System Prompts**
   - Ensure system prompts are ≥1024 tokens (minimum cacheable size)
   - Keep system prompts static (avoid dynamic content)
   - Use consistent formatting

2. **Message Consistency**
   - Ensure identical messages produce cache hits
   - Avoid whitespace differences
   - Use consistent message formatting

3. **Cache TTL Configuration**
   - Default: 5 minutes (300 seconds)
   - Configurable: Up to 1 hour (3600 seconds)
   - Longer TTL = higher hit rate (but may use stale cache)

### Cost Optimization

1. **Monitor Cache Hit Rate**
   - Target: 20-30% for optimal cost savings
   - Adjust system prompts to maximize cacheable content

2. **Track Cost Savings**
   - Monitor: `cache_read_tokens / total_input_tokens`
   - Calculate: Cost savings = (cached tokens / 1M) * input_cost_per_million

3. **Optimize System Prompt Size**
   - Larger system prompts = more cacheable tokens
   - Balance: Larger prompts cost more, but cached tokens save money

## Troubleshooting

### Low Cache Hit Rate

**Symptoms**: Cache hit rate < 10%

**Possible causes**:
1. System prompts too small (<1024 tokens)
2. Messages not identical between calls
3. Cache TTL expired
4. Anthropic API caching not available

**Solutions**:
- Verify system prompt size ≥1024 tokens
- Ensure messages are identical
- Check cache TTL configuration
- Verify Anthropic API caching availability

### High Cache Miss Rate

**Symptoms**: Cache miss rate > 90%

**Possible causes**:
1. Cache disabled (`ANTHROPIC_CACHE_ENABLED=False`)
2. System prompts too dynamic
3. Cache TTL too short
4. API issues

**Solutions**:
- Check `ANTHROPIC_CACHE_ENABLED` configuration
- Optimize system prompts (make them static)
- Increase cache TTL if appropriate
- Check Anthropic API status

### Cache Health Issues

**Symptoms**: Cache health check fails

**Possible causes**:
1. Redis connectivity issues
2. Configuration errors
3. API issues

**Solutions**:
- Check Redis connectivity
- Verify configuration
- Check API status

## References

- [Story 1.3: Anthropic Explicit Caching](../docs/stories/1-3-anthropic-explicit-caching.md)
- [Quality Monitoring Framework](../docs/stories/2-4-quality-monitoring-framework.md)
- [Anthropic Caching Documentation](https://docs.anthropic.com/claude/docs/prompt-caching)
- [Integration Tests Guide](./anthropic-cache-integration-tests.md)

