"""
OpenAI Prompt Cache Metrics Collector (Story 1.1 - Dashboard Integration).

Tracks OpenAI prompt caching metrics for dashboard display.
This complements the logging in thread_manager.py by aggregating metrics.
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from collections import deque, defaultdict

from core.utils.logger import logger


@dataclass
class PromptCacheOperation:
    """Represents a single OpenAI prompt cache operation."""
    cached_tokens: int
    total_tokens: int
    model: str
    timestamp: datetime
    cache_hit_rate: float = 0.0


class OpenAIPromptCacheMetricsCollector:
    """
    Metrics collector for OpenAI prompt caching (Story 1.1).
    
    Tracks cache hit rates, cached tokens, and performance metrics.
    """
    
    def __init__(self, max_history_size: int = 1000):
        """
        Initialize OpenAI Prompt Cache Metrics Collector.
        
        Args:
            max_history_size: Maximum number of operations to keep in history
        """
        self.max_history_size = max_history_size
        self._lock = asyncio.Lock()
        
        # Operation history
        self.operations: deque = deque(maxlen=max_history_size)
        
        # Aggregate metrics
        self.total_operations: int = 0
        self.total_cached_tokens: int = 0
        self.total_tokens: int = 0
        self.cache_hit_operations: int = 0
        
        # Per-model metrics
        self.model_metrics: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            "total_operations": 0,
            "total_cached_tokens": 0,
            "total_tokens": 0,
            "cache_hit_operations": 0
        })
    
    async def record_operation(
        self,
        cached_tokens: int,
        total_tokens: int,
        model: str,
        timestamp: Optional[datetime] = None
    ) -> None:
        """
        Record a cache operation.
        
        Args:
            cached_tokens: Number of cached tokens
            total_tokens: Total number of tokens
            model: Model name
            timestamp: Operation timestamp (defaults to now)
        """
        if timestamp is None:
            timestamp = datetime.now(timezone.utc)
        
        cache_hit_rate = (cached_tokens / total_tokens * 100.0) if total_tokens > 0 else 0.0
        
        operation = PromptCacheOperation(
            cached_tokens=cached_tokens,
            total_tokens=total_tokens,
            model=model,
            timestamp=timestamp,
            cache_hit_rate=cache_hit_rate
        )
        
        async with self._lock:
            self.operations.append(operation)
            self.total_operations += 1
            self.total_cached_tokens += cached_tokens
            self.total_tokens += total_tokens
            
            if cached_tokens > 0:
                self.cache_hit_operations += 1
            
            # Update per-model metrics
            model_metrics = self.model_metrics[model]
            model_metrics["total_operations"] += 1
            model_metrics["total_cached_tokens"] += cached_tokens
            model_metrics["total_tokens"] += total_tokens
            if cached_tokens > 0:
                model_metrics["cache_hit_operations"] += 1
    
    def get_cache_hit_rate(self) -> float:
        """Get overall cache hit rate (0.0-1.0)."""
        if self.total_operations == 0:
            return 0.0
        return self.cache_hit_operations / self.total_operations
    
    def get_cache_hit_rate_percentage(self) -> float:
        """Get overall cache hit rate as percentage."""
        return self.get_cache_hit_rate() * 100.0
    
    def get_average_cached_tokens_percentage(self) -> float:
        """Get average percentage of tokens that were cached."""
        if self.total_tokens == 0:
            return 0.0
        return (self.total_cached_tokens / self.total_tokens) * 100.0
    
    def get_model_cache_hit_rate(self, model: str) -> float:
        """Get cache hit rate for a specific model (0.0-1.0)."""
        if model not in self.model_metrics:
            return 0.0
        model_metrics = self.model_metrics[model]
        if model_metrics["total_operations"] == 0:
            return 0.0
        return model_metrics["cache_hit_operations"] / model_metrics["total_operations"]
    
    def get_summary(self) -> Dict[str, Any]:
        """Get comprehensive metrics summary."""
        return {
            "total_operations": self.total_operations,
            "cache_hit_operations": self.cache_hit_operations,
            "cache_miss_operations": self.total_operations - self.cache_hit_operations,
            "cache_hit_rate": self.get_cache_hit_rate(),
            "cache_hit_rate_percentage": self.get_cache_hit_rate_percentage(),
            "total_cached_tokens": self.total_cached_tokens,
            "total_tokens": self.total_tokens,
            "average_cached_tokens_percentage": self.get_average_cached_tokens_percentage(),
            "model_stats": {
                model: {
                    "total_operations": metrics["total_operations"],
                    "cache_hit_operations": metrics["cache_hit_operations"],
                    "cache_hit_rate": metrics["cache_hit_operations"] / metrics["total_operations"] if metrics["total_operations"] > 0 else 0.0,
                    "total_cached_tokens": metrics["total_cached_tokens"],
                    "total_tokens": metrics["total_tokens"],
                    "average_cached_tokens_percentage": (metrics["total_cached_tokens"] / metrics["total_tokens"] * 100.0) if metrics["total_tokens"] > 0 else 0.0
                }
                for model, metrics in self.model_metrics.items()
            }
        }
    
    def reset(self) -> None:
        """Reset all metrics."""
        async def _reset():
            async with self._lock:
                self.operations.clear()
                self.total_operations = 0
                self.total_cached_tokens = 0
                self.total_tokens = 0
                self.cache_hit_operations = 0
                self.model_metrics.clear()
        
        # Run in event loop if available
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # Create task if loop is running
                asyncio.create_task(_reset())
            else:
                loop.run_until_complete(_reset())
        except RuntimeError:
            # No event loop, create new one
            asyncio.run(_reset())


# Singleton instance
_openai_prompt_cache_metrics_collector: Optional[OpenAIPromptCacheMetricsCollector] = None


def get_openai_prompt_cache_metrics_collector() -> OpenAIPromptCacheMetricsCollector:
    """Get singleton instance of OpenAI Prompt Cache Metrics Collector."""
    global _openai_prompt_cache_metrics_collector
    if _openai_prompt_cache_metrics_collector is None:
        _openai_prompt_cache_metrics_collector = OpenAIPromptCacheMetricsCollector()
    return _openai_prompt_cache_metrics_collector

