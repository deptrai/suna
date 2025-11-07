# Semantic Response Caching Usage Guide (Story 2.1)

## Overview

Semantic response caching reduces API calls by 20-40% for semantically similar queries while maintaining 95-100% quality. It uses vector similarity search to find cached responses for queries that are semantically similar (but not necessarily identical).

## Quick Start

### 1. Enable Semantic Caching

Semantic caching is automatically enabled when:
- `OPTIMIZATION_MODE=optimized` (Story 1.4)
- `SEMANTIC_CACHE_ENABLED=True` (default)

```bash
# .env file
OPTIMIZATION_MODE=optimized
SEMANTIC_CACHE_ENABLED=True
SEMANTIC_CACHE_SIMILARITY_THRESHOLD=0.95
SEMANTIC_CACHE_QUALITY_THRESHOLD=0.95
```

### 2. Verify Installation

```python
from core.optimizations.semantic_cache import get_semantic_cache

cache = get_semantic_cache()
print(f"Semantic cache enabled: {cache.enabled}")
print(f"Similarity threshold: {cache.similarity_threshold}")
```

### 3. Monitor Metrics

```python
from core.optimizations.semantic_cache import get_semantic_cache

cache = get_semantic_cache()
metrics = cache.get_metrics()

print(f"Cache hit rate: {metrics['hit_rate_percentage']:.2f}%")
print(f"Total requests: {metrics['total_requests']}")
print(f"Cache hits: {metrics['cache_hits']}")
print(f"Cache misses: {metrics['cache_misses']}")
```

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SEMANTIC_CACHE_SIMILARITY_THRESHOLD` | 0.95 | Minimum similarity score for cache hit (0.0-1.0) |
| `SEMANTIC_CACHE_QUALITY_THRESHOLD` | 0.95 | Minimum quality score to maintain (0.0-1.0) |
| `SEMANTIC_CACHE_TTL` | 3600 | Cache TTL in seconds (1 hour) |
| `SEMANTIC_CACHE_ENABLED` | True | Enable/disable semantic caching |
| `SEMANTIC_CACHE_AUTO_DISABLE_ENABLED` | True | Enable/disable auto-disable on quality degradation |

### Similarity Threshold Tuning

**Higher Threshold (0.98-0.99):**
- ✅ Higher quality (fewer false positives)
- ❌ Lower cache hit rate (fewer matches)
- Use when quality is critical

**Lower Threshold (0.90-0.95):**
- ✅ Higher cache hit rate (more matches)
- ❌ Lower quality (more false positives)
- Use when cost savings are priority

**Recommended:** 0.95 (default) - Good balance between quality and cost savings

## Usage Examples

### Basic Usage

Semantic caching is automatically integrated into the LLM service. No additional code is required.

```python
# In OPTIMIZED mode, semantic caching is automatically used
from core.utils.config import OptimizationConfig, OptimizationMode

OptimizationConfig.set_mode(OptimizationMode.OPTIMIZED)

# LLM calls will automatically check semantic cache
# and cache responses
```

### Manual Cache Operations

```python
from core.optimizations.semantic_cache import get_semantic_cache

cache = get_semantic_cache()

# Get cached response
cached_result = await cache.get_cached_response(
    query="What is the weather today?",
    context={"model_name": "gpt-4o-mini"}
)

if cached_result and cached_result.get("cache_hit"):
    print(f"Cache hit! Similarity: {cached_result['similarity_score']:.3f}")
    response = cached_result["response"]
else:
    print("Cache miss - will call LLM")

# Cache response
await cache.cache_response(
    query="What is the weather today?",
    response={"content": "The weather is sunny."},
    context={"model_name": "gpt-4o-mini"}
)
```

### Quality Validation

```python
from core.optimizations.semantic_cache import get_semantic_cache

cache = get_semantic_cache()

cached_response = {"content": "The weather is sunny."}
actual_response = {"content": "The weather is sunny and warm."}

quality_score = await cache.validate_cache_quality(
    cached_response,
    actual_response
)

print(f"Quality score: {quality_score:.3f}")
# Quality score: 0.95+ for good matches
```

## Monitoring

### Metrics Dashboard

Access metrics via `get_metrics()`:

```python
metrics = cache.get_metrics()

# Key metrics
print(f"Hit rate: {metrics['hit_rate_percentage']:.2f}%")
print(f"False positive rate: {metrics['false_positive_rate_percentage']:.2f}%")
print(f"Average similarity: {metrics['average_similarity_score']:.3f}")
print(f"Average quality: {metrics['average_quality_score']:.3f}")
print(f"Quality breaches: {metrics['quality_breaches']}")
print(f"Auto-disables: {metrics['auto_disables']}")
```

### Quality Monitor Integration

Metrics are automatically tracked in the Quality Monitor (Story 2.4):

```python
from core.optimizations.quality_monitor import get_quality_monitor

quality_monitor = get_quality_monitor()

# Metrics are automatically tracked:
# - semantic_cache_hit_rate
# - semantic_cache_miss
# - semantic_cache_auto_disable
```

## Auto-Disable Mechanism

The semantic cache automatically disables itself if quality drops below the threshold:

**Trigger Conditions:**
- 5 consecutive quality breaches (default)
- Quality score < quality_threshold (default: 0.95)

**Behavior:**
- Semantic caching is disabled
- Falls back to exact match caching (Story 1.2)
- Logs critical events
- Tracks auto-disable in metrics

**Re-enable:**
```python
cache = get_semantic_cache()
cache.enable()  # Re-enable after fixing issues
```

## Troubleshooting

### Low Cache Hit Rate

**Possible Causes:**
1. Similarity threshold too high
2. Queries are too diverse
3. Cache TTL too short

**Solutions:**
- Lower similarity threshold (try 0.90)
- Increase cache TTL
- Check query patterns

### High False Positive Rate

**Possible Causes:**
1. Similarity threshold too low
2. Queries are too similar but contexts differ

**Solutions:**
- Increase similarity threshold (try 0.98)
- Review cache context inclusion
- Check quality validation results

### Quality Degradation

**Possible Causes:**
1. Similarity threshold too low
2. Cached responses are outdated
3. Context mismatch

**Solutions:**
- Increase similarity threshold
- Reduce cache TTL
- Review context inclusion in cache key
- Check auto-disable logs

### Performance Issues

**Possible Causes:**
1. Large number of cached embeddings
2. Linear search through all embeddings

**Solutions:**
- Consider using FAISS or ChromaDB for vector search
- Implement cache eviction (LRU)
- Reduce cache TTL

## Best Practices

1. **Start with Defaults**: Use default threshold (0.95) and tune based on metrics
2. **Monitor Quality**: Regularly check quality metrics and adjust thresholds
3. **Review Auto-Disables**: Investigate quality breaches and adjust configuration
4. **Cache Context**: Include relevant context (model_name, thread_id) in cache key
5. **Test Thresholds**: Test different threshold values in staging before production

## Performance Expectations

- **Cache Hit Rate:** 20-40% for semantically similar queries
- **Quality Maintained:** 95-100% (monitored)
- **Cost Reduction:** 20-40% API call reduction
- **Latency Improvement:** 90% faster for cache hits
- **Quality Impact:** <5% (minimal)

## Limitations

1. **Streaming Responses:** Currently only supports non-streaming responses
2. **Vector Search:** Uses linear search (consider FAISS/ChromaDB for scale)
3. **Cache Size:** No automatic eviction beyond TTL
4. **Embedding Model:** Fixed to `all-MiniLM-L6-v2` (can be upgraded)

## Future Enhancements

1. Streaming response caching
2. FAISS/ChromaDB integration for faster vector search
3. LRU cache eviction
4. Multi-model embedding support
5. Cache warming with common queries

## Support

For issues or questions:
1. Check metrics and logs
2. Review quality validation results
3. Adjust configuration based on metrics
4. Consult Story 2.1 documentation

---

**Last Updated:** 2025-11-07  
**Story:** 2.1 - Semantic Response Caching (Quality-Controlled)

