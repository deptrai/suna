"""
LLM Metrics and Monitoring System.

This module provides comprehensive monitoring and metrics collection for LLM operations,
including usage tracking, performance monitoring, and error analysis.
"""

import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from collections import defaultdict, deque
import structlog

logger = structlog.get_logger(__name__)


@dataclass
class LLMCallMetrics:
    """Metrics for a single LLM call."""
    
    model_name: str
    provider: str
    strategy: str
    start_time: float
    end_time: Optional[float] = None
    success: bool = False
    error_type: Optional[str] = None
    error_message: Optional[str] = None
    token_usage: Dict[str, int] = field(default_factory=dict)
    response_time_ms: Optional[float] = None
    stream: bool = False
    
    def mark_success(self, token_usage: Optional[Dict[str, int]] = None):
        """Mark the call as successful and record metrics."""
        self.end_time = time.time()
        self.success = True
        self.response_time_ms = (self.end_time - self.start_time) * 1000
        if token_usage:
            self.token_usage = token_usage
        
        logger.info(
            "LLM call completed successfully",
            model=self.model_name,
            provider=self.provider,
            strategy=self.strategy,
            response_time_ms=self.response_time_ms,
            token_usage=self.token_usage
        )
    
    def mark_failure(self, error_type: str, error_message: str):
        """Mark the call as failed and record error details."""
        self.end_time = time.time()
        self.success = False
        self.error_type = error_type
        self.error_message = error_message
        self.response_time_ms = (self.end_time - self.start_time) * 1000
        
        logger.error(
            "LLM call failed",
            model=self.model_name,
            provider=self.provider,
            strategy=self.strategy,
            response_time_ms=self.response_time_ms,
            error_type=error_type,
            error_message=error_message
        )


class LLMMetricsCollector:
    """Centralized metrics collection for LLM operations."""
    
    def __init__(self, max_history: int = 1000):
        self.max_history = max_history
        self.call_history: deque = deque(maxlen=max_history)
        self.provider_stats: Dict[str, Dict] = defaultdict(lambda: {
            'total_calls': 0,
            'successful_calls': 0,
            'failed_calls': 0,
            'total_response_time': 0.0,
            'total_tokens': 0,
            'error_types': defaultdict(int)
        })
        self.model_stats: Dict[str, Dict] = defaultdict(lambda: {
            'total_calls': 0,
            'successful_calls': 0,
            'failed_calls': 0,
            'avg_response_time': 0.0,
            'total_tokens': 0
        })
    
    def start_call(self, model_name: str, provider: str, strategy: str, stream: bool = False) -> LLMCallMetrics:
        """Start tracking a new LLM call."""
        metrics = LLMCallMetrics(
            model_name=model_name,
            provider=provider,
            strategy=strategy,
            start_time=time.time(),
            stream=stream
        )
        
        logger.debug(
            "Started tracking LLM call",
            model=model_name,
            provider=provider,
            strategy=strategy,
            stream=stream
        )
        
        return metrics
    
    def record_call(self, metrics: LLMCallMetrics):
        """Record completed call metrics."""
        self.call_history.append(metrics)
        
        # Update provider stats
        provider_stat = self.provider_stats[metrics.provider]
        provider_stat['total_calls'] += 1
        
        if metrics.success:
            provider_stat['successful_calls'] += 1
            if metrics.response_time_ms:
                provider_stat['total_response_time'] += metrics.response_time_ms
            if metrics.token_usage:
                provider_stat['total_tokens'] += sum(metrics.token_usage.values())
        else:
            provider_stat['failed_calls'] += 1
            if metrics.error_type:
                provider_stat['error_types'][metrics.error_type] += 1
        
        # Update model stats
        model_stat = self.model_stats[metrics.model_name]
        model_stat['total_calls'] += 1
        
        if metrics.success:
            model_stat['successful_calls'] += 1
            if metrics.response_time_ms:
                # Update running average
                total_successful = model_stat['successful_calls']
                current_avg = model_stat['avg_response_time']
                model_stat['avg_response_time'] = (
                    (current_avg * (total_successful - 1) + metrics.response_time_ms) / total_successful
                )
            if metrics.token_usage:
                model_stat['total_tokens'] += sum(metrics.token_usage.values())
        else:
            model_stat['failed_calls'] += 1
    
    def get_provider_stats(self, provider: Optional[str] = None) -> Dict:
        """Get statistics for a specific provider or all providers."""
        if provider:
            stats = dict(self.provider_stats[provider])
            # Calculate success rate
            total = stats['total_calls']
            if total > 0:
                stats['success_rate'] = stats['successful_calls'] / total
                stats['avg_response_time'] = (
                    stats['total_response_time'] / stats['successful_calls']
                    if stats['successful_calls'] > 0 else 0
                )
            return stats
        else:
            return {p: self.get_provider_stats(p) for p in self.provider_stats.keys()}

    def get_model_stats(self, model: Optional[str] = None) -> Dict:
        """Get statistics for a specific model or all models."""
        if model:
            stats = dict(self.model_stats[model])
            # Calculate success rate
            total = stats['total_calls']
            if total > 0:
                stats['success_rate'] = stats['successful_calls'] / total
            return stats
        else:
            return {m: self.get_model_stats(m) for m in self.model_stats.keys()}
    
    def get_recent_failures(self, hours: int = 24) -> List[LLMCallMetrics]:
        """Get recent failed calls within the specified time window."""
        cutoff_time = time.time() - (hours * 3600)
        return [
            call for call in self.call_history 
            if not call.success and call.start_time >= cutoff_time
        ]
    
    def get_health_summary(self) -> Dict[str, Any]:
        """Get overall health summary of LLM operations."""
        total_calls = len(self.call_history)
        if total_calls == 0:
            return {"status": "no_data", "total_calls": 0}
        
        successful_calls = sum(1 for call in self.call_history if call.success)
        success_rate = successful_calls / total_calls
        
        recent_failures = self.get_recent_failures(1)  # Last hour
        
        return {
            "status": "healthy" if success_rate > 0.95 else "degraded" if success_rate > 0.8 else "unhealthy",
            "total_calls": total_calls,
            "success_rate": success_rate,
            "recent_failures_1h": len(recent_failures),
            "provider_count": len(self.provider_stats),
            "model_count": len(self.model_stats)
        }


# Global metrics collector instance
metrics_collector = LLMMetricsCollector()


def track_llm_call(model_name: str, provider: str, strategy: str, stream: bool = False) -> LLMCallMetrics:
    """Convenience function to start tracking an LLM call."""
    return metrics_collector.start_call(model_name, provider, strategy, stream)


def record_llm_call(metrics: LLMCallMetrics):
    """Convenience function to record completed LLM call."""
    metrics_collector.record_call(metrics)


def get_llm_health() -> Dict[str, Any]:
    """Convenience function to get LLM health summary."""
    return metrics_collector.get_health_summary()
