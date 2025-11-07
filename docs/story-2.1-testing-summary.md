# Story 2.1: Testing & Monitoring Summary

**Date:** 2025-11-07  
**Status:** Ready for Testing

## Quick Start Guide

### 1. Start Server

```bash
# Option 1: Use provided script
./scripts/start-server-test-cache.sh

# Option 2: Manual start
cd backend
export OPTIMIZATION_MODE=optimized
export SEMANTIC_CACHE_ENABLED=True
uv run uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

### 2. Test Semantic Cache

```bash
# Test direct cache operations
python3 scripts/test-semantic-cache-chat.py

# Monitor metrics in real-time
python3 scripts/monitor-semantic-cache.py --duration 60

# Check cache status
python3 scripts/monitor-semantic-cache.py --status
```

### 3. Monitor via API

```bash
# Get semantic cache metrics (requires authentication)
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/cache/semantic/metrics

# Get cache status
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/cache/semantic/status

# Enable/disable cache
curl -X POST -H "Authorization: Bearer <token>" http://localhost:8000/api/cache/semantic/enable
curl -X POST -H "Authorization: Bearer <token>" http://localhost:8000/api/cache/semantic/disable

# Clear cache
curl -X POST -H "Authorization: Bearer <token>" http://localhost:8000/api/cache/semantic/clear
```

---

## Testing Checklist

### ✅ Pre-Testing Setup
- [ ] Redis is running
- [ ] Backend server is running
- [ ] Environment variables set (OPTIMIZATION_MODE=optimized)
- [ ] Semantic cache enabled (SEMANTIC_CACHE_ENABLED=True)

### ✅ Basic Functionality
- [ ] Cache initialization works
- [ ] Cache storage works
- [ ] Cache retrieval works
- [ ] Similarity search works

### ✅ Performance Testing
- [ ] Cache hit rate > 20% (after warm-up)
- [ ] Cache hits are faster than misses
- [ ] SCAN is used (not keys())
- [ ] Thread pool is working (non-blocking)

### ✅ Quality Verification
- [ ] Quality scores > 0.95
- [ ] Quality breaches < 5%
- [ ] Auto-disable works if quality degrades

### ✅ Cache Management
- [ ] LRU eviction works
- [ ] Cache size stays within limits
- [ ] Cache clear works
- [ ] Enable/disable works

### ✅ Monitoring
- [ ] Metrics API works
- [ ] Status API works
- [ ] Monitor script works
- [ ] Logs show cache hits/misses

---

## Expected Results

### After 100+ Requests

- **Cache Hit Rate:** 20-40%
- **Average Similarity:** >0.95
- **Average Quality:** >0.95
- **Cache Size:** 50-200 items
- **Quality Breaches:** 0-2%
- **Performance:** Cache hits 10-20ms, misses 100-500ms

### Performance Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Cache Hit Rate | 20-40% | TBD |
| Average Similarity | >0.95 | TBD |
| Average Quality | >0.95 | TBD |
| Cache Hit Latency | <20ms | TBD |
| Cache Miss Latency | 100-500ms | TBD |

---

## Troubleshooting

### Low Cache Hit Rate
- Check similarity threshold (default: 0.95)
- Verify queries are semantically similar
- Check cache is enabled
- Verify optimization mode is "optimized"

### High Latency
- Check Redis connection
- Verify SCAN is used (check logs)
- Monitor cache size (may need LRU eviction)
- Check thread pool is working

### Quality Issues
- Check quality threshold (default: 0.95)
- Review quality breach logs
- Verify auto-disable is working
- Check quality scores in metrics

---

## Next Steps

1. ✅ **Start server** - Backend running
2. ✅ **Test with chat** - Send similar queries
3. ✅ **Monitor metrics** - Use monitor script
4. ✅ **Verify cache hits** - Check logs and metrics
5. ✅ **Tune if needed** - Adjust thresholds and cache size

---

**Last Updated:** 2025-11-07  
**Status:** Ready for Testing

