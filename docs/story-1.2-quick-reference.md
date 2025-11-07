# Story 1.2 Quick Reference: Deployment & Monitoring

**Story:** 1.2 - LiteLLM Redis Response Caching (Exact Matches)  
**Gate Decision:** ✅ PASS  
**Status:** Ready for Production

---

## 🚀 Quick Deployment

### 1. Verify Configuration

```bash
# Check Redis
redis-cli ping

# Check cache health (if service running)
curl http://localhost:8000/api/cache/health
```

### 2. Deploy

```bash
# Your deployment process here
# Verify after deployment
curl http://production.example.com/api/cache/health
```

### 3. Validate

```bash
# Run validation script
./scripts/validate-cache-metrics.sh http://production.example.com
```

---

## 📊 Quick Monitoring

### Check Cache Metrics

```bash
# Overall metrics
curl http://localhost:8000/api/cache/metrics

# Hit rate
curl http://localhost:8000/api/cache/metrics/hit-rate

# Health
curl http://localhost:8000/api/cache/health
```

### Key Metrics

- **Cache Hit Rate:** Target 10-20%
- **Cache Health:** Should be `healthy: true`
- **Performance:** Cache hits 50-90% faster

---

## 🔍 Quick Troubleshooting

### Cache Not Working

```bash
# 1. Check Redis
redis-cli ping

# 2. Check config
echo $LITELLM_CACHE_ENABLED
echo $REDIS_HOST

# 3. Check logs
grep "LiteLLM Cache" /path/to/logs
```

### Low Hit Rate

- Verify queries are duplicate (exact matches)
- Check cache TTL (should be 1 hour)
- Monitor query patterns

---

## 📚 Full Documentation

- **Deployment Guide:** `docs/story-1.2-deployment-guide.md`
- **Monitoring Guide:** `docs/story-1.2-monitoring-guide.md`
- **Deployment Summary:** `docs/story-1.2-deployment-summary.md`
- **Traceability Matrix:** `docs/traceability-matrix-1.2.md`
- **Gate Decision:** `docs/gate-decision-story-1.2.yaml`

---

**Last Updated:** 2025-01-15

