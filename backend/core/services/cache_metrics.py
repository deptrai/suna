"""
LiteLLM Redis Cache Metrics Collector (Story 1.2 - Minor Recommendations).

Tracks cache hit/miss rates, performance metrics, and provides health checks.
"""

import time
from dataclasses import dataclass, field
from typing import Dict, Optional, Any
from datetime import datetime, timezone
from collections import deque
import asyncio
from core.utils.logger import logger

# Thread-safe lock for metrics updates
_metrics_lock = asyncio.Lock()


@dataclass
class CacheMetrics:
    """Cache metrics for a single cache operation."""
    cache_hit: bool
    model_name: str
    cache_key: Optional[str] = None
    response_time_ms: Optional[float] = None
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Dict[str, Any] = field(default_factory=dict)


class LiteLLMCacheMetricsCollector:
    """
    Collects and aggregates LiteLLM Redis cache metrics.
    
    Tracks:
    - Cache hits and misses
    - Cache hit rate
    - Total cache operations
    - Performance metrics
    """
    
    def __init__(self, max_history: int = 1000):
        self.max_history = max_history
        self.metrics_history: deque = deque(maxlen=max_history)
        
        # Aggregated counters
        self.total_requests = 0
        self.cache_hits = 0
        self.cache_misses = 0
        
        # Per-model statistics
        self.model_stats: Dict[str, Dict[str, int]] = {}
        
        # Performance metrics
        self.total_response_time_ms = 0.0
        self.cached_response_time_ms = 0.0
        self.uncached_response_time_ms = 0.0
        
        logger.info("LiteLLM Cache Metrics Collector initialized")
    
    async def record_cache_operation(
        self,
        cache_hit: bool,
        model_name: str,
        cache_key: Optional[str] = None,
        response_time_ms: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Record a cache operation (hit or miss)."""
        async with _metrics_lock:
            # Create metrics record
            metric = CacheMetrics(
                cache_hit=cache_hit,
                model_name=model_name,
                cache_key=cache_key,
                response_time_ms=response_time_ms,
                metadata=metadata or {}
            )
            
            # Add to history
            self.metrics_history.append(metric)
            
            # Update aggregated counters
            self.total_requests += 1
            if cache_hit:
                self.cache_hits += 1
                if response_time_ms:
                    self.cached_response_time_ms += response_time_ms
            else:
                self.cache_misses += 1
                if response_time_ms:
                    self.uncached_response_time_ms += response_time_ms
            
            if response_time_ms:
                self.total_response_time_ms += response_time_ms
            
            # Update per-model statistics
            if model_name not in self.model_stats:
                self.model_stats[model_name] = {
                    'total': 0,
                    'hits': 0,
                    'misses': 0
                }
            
            self.model_stats[model_name]['total'] += 1
            if cache_hit:
                self.model_stats[model_name]['hits'] += 1
            else:
                self.model_stats[model_name]['misses'] += 1
    
    def get_cache_hit_rate(self) -> float:
        """Calculate overall cache hit rate (0.0-1.0)."""
        if self.total_requests == 0:
            return 0.0
        return self.cache_hits / self.total_requests
    
    def get_cache_hit_rate_percentage(self) -> float:
        """Calculate overall cache hit rate as percentage."""
        return self.get_cache_hit_rate() * 100.0
    
    def get_model_cache_hit_rate(self, model_name: str) -> float:
        """Calculate cache hit rate for a specific model."""
        if model_name not in self.model_stats:
            return 0.0
        stats = self.model_stats[model_name]
        total = stats['total']
        if total == 0:
            return 0.0
        return stats['hits'] / total
    
    def get_average_response_time(self, cached_only: bool = False) -> Optional[float]:
        """Get average response time in milliseconds."""
        if cached_only:
            if self.cache_hits == 0:
                return None
            return self.cached_response_time_ms / self.cache_hits
        else:
            if self.total_requests == 0:
                return None
            return self.total_response_time_ms / self.total_requests
    
    def get_performance_improvement(self) -> Optional[float]:
        """Calculate performance improvement from caching (percentage)."""
        avg_cached = self.get_average_response_time(cached_only=True)
        avg_uncached = None
        if self.cache_misses > 0:
            avg_uncached = self.uncached_response_time_ms / self.cache_misses
        
        if avg_cached is None or avg_uncached is None or avg_uncached == 0:
            return None
        
        improvement = ((avg_uncached - avg_cached) / avg_uncached) * 100.0
        return improvement
    
    def get_summary(self) -> Dict[str, Any]:
        """Get comprehensive cache metrics summary."""
        return {
            'total_requests': self.total_requests,
            'cache_hits': self.cache_hits,
            'cache_misses': self.cache_misses,
            'cache_hit_rate': self.get_cache_hit_rate(),
            'cache_hit_rate_percentage': self.get_cache_hit_rate_percentage(),
            'average_response_time_ms': self.get_average_response_time(),
            'average_cached_response_time_ms': self.get_average_response_time(cached_only=True),
            'average_uncached_response_time_ms': (
                self.uncached_response_time_ms / self.cache_misses 
                if self.cache_misses > 0 else None
            ),
            'performance_improvement_percentage': self.get_performance_improvement(),
            'model_stats': {
                model: {
                    'total': stats['total'],
                    'hits': stats['hits'],
                    'misses': stats['misses'],
                    'hit_rate': stats['hits'] / stats['total'] if stats['total'] > 0 else 0.0
                }
                for model, stats in self.model_stats.items()
            },
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
    
    async def reset(self) -> None:
        """Reset all metrics (for testing or periodic resets)."""
        async with _metrics_lock:
            self.metrics_history.clear()
            self.total_requests = 0
            self.cache_hits = 0
            self.cache_misses = 0
            self.model_stats.clear()
            self.total_response_time_ms = 0.0
            self.cached_response_time_ms = 0.0
            self.uncached_response_time_ms = 0.0
            logger.info("Cache metrics reset")


# Global cache metrics collector instance
_cache_metrics_collector: Optional[LiteLLMCacheMetricsCollector] = None


def get_cache_metrics_collector() -> LiteLLMCacheMetricsCollector:
    """Get or create the global cache metrics collector."""
    global _cache_metrics_collector
    if _cache_metrics_collector is None:
        _cache_metrics_collector = LiteLLMCacheMetricsCollector()
    return _cache_metrics_collector


async def check_cache_health() -> Dict[str, Any]:
    """
    Check LiteLLM cache health (Minor Recommendation - Cache Health Checks).
    
    Verifies:
    - Cache is configured
    - Cache connectivity
    - Cache is operational
    
    Returns:
        Health status dictionary with 'healthy', 'configured', 'operational', and 'details'
    """
    health_status = {
        'healthy': False,
        'configured': False,
        'operational': False,
        'details': {}
    }
    
    try:
        # Check if cache is configured
        import litellm
        cache_configured = hasattr(litellm, 'cache') and litellm.cache is not None
        health_status['configured'] = cache_configured
        
        if not cache_configured:
            health_status['details']['error'] = 'Cache not configured'
            return health_status
        
        # Check cache type
        if hasattr(litellm.cache, 'type'):
            health_status['details']['cache_type'] = litellm.cache.type
        elif hasattr(litellm.cache, '__class__'):
            health_status['details']['cache_type'] = litellm.cache.__class__.__name__
        
        # Try to verify Redis connectivity (if Redis cache)
        try:
            from core.services import redis
            redis_client = await redis.get_client()
            if redis_client:
                ping_result = await redis_client.ping()
                health_status['operational'] = ping_result
                health_status['details']['redis_connected'] = ping_result
        except Exception as e:
            health_status['details']['redis_error'] = str(e)
            health_status['operational'] = False
        
        # Check cache metrics collector
        collector = get_cache_metrics_collector()
        if collector.total_requests > 0:
            health_status['details']['metrics_available'] = True
            health_status['details']['cache_hit_rate'] = collector.get_cache_hit_rate_percentage()
        else:
            health_status['details']['metrics_available'] = False
            health_status['details']['note'] = 'No cache operations recorded yet'
        
        # Overall health: configured and operational
        health_status['healthy'] = health_status['configured'] and health_status['operational']
        
    except Exception as e:
        logger.error(f"Error checking cache health: {e}")
        health_status['details']['error'] = str(e)
        health_status['healthy'] = False
    
    return health_status

