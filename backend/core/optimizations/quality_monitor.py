"""
Quality Monitoring Framework for LLM Optimizations (Story 2.4).

This module provides comprehensive quality monitoring to assess the impact
of optimizations on response quality and ensure safe deployment.

Features:
- Comprehensive metric tracking (response_similarity, tool_success_rate, user_satisfaction, error_rate, response_completeness)
- Automated quality validation
- Alerting mechanisms
- Auto-rollback feature
- Quality dashboard integration
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, List, Optional, Any, Callable
from collections import deque
import json

from core.utils.logger import logger

# Import OptimizationMode from config (Story 1.4)
try:
    from core.utils.config import OptimizationMode
except ImportError:
    # Fallback if OptimizationConfig not yet implemented (should not happen after Story 1.4)
    class OptimizationMode(Enum):
        """Optimization mode enumeration (from Story 1.4 - Dual-mode architecture)."""
        ORIGINAL = "original"
        OPTIMIZED = "optimized"
        AUTO = "auto"


@dataclass
class QualityMetric:
    """Represents a single quality metric measurement."""
    metric_name: str
    value: float
    timestamp: datetime
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class QualityThresholds:
    """Quality thresholds for each metric."""
    response_similarity: float = 0.95  # 95% similarity required
    tool_success_rate: float = 0.90  # 90% success rate required
    user_satisfaction: float = 0.80  # 80% satisfaction required (if available)
    error_rate: float = 0.05  # 5% error rate maximum
    response_completeness: float = 0.90  # 90% completeness required
    
    def get_threshold(self, metric_name: str) -> float:
        """Get threshold for a specific metric."""
        return getattr(self, metric_name, 0.0)


class QualityMonitor:
    """
    Comprehensive quality monitoring for LLM optimizations.
    
    Tracks multiple quality dimensions and provides automated quality validation,
    alerting, and auto-rollback capabilities.
    """
    
    def __init__(
        self,
        thresholds: Optional[QualityThresholds] = None,
        alert_callbacks: Optional[List[Callable]] = None,
        rollback_callback: Optional[Callable] = None,
        max_history_size: int = 1000
    ):
        """
        Initialize QualityMonitor.
        
        Args:
            thresholds: Quality thresholds for each metric (defaults to QualityThresholds())
            alert_callbacks: List of callback functions to call when thresholds are breached
            rollback_callback: Callback function to trigger auto-rollback
            max_history_size: Maximum number of metrics to keep in history
        """
        self.thresholds = thresholds or QualityThresholds()
        self.alert_callbacks = alert_callbacks or []
        self.rollback_callback = rollback_callback
        self.max_history_size = max_history_size
        
        # Metric history (sliding window)
        self.metric_history: Dict[str, deque] = {
            "response_similarity": deque(maxlen=max_history_size),
            "tool_success_rate": deque(maxlen=max_history_size),
            "user_satisfaction": deque(maxlen=max_history_size),
            "error_rate": deque(maxlen=max_history_size),
            "response_completeness": deque(maxlen=max_history_size),
        }
        
        # Current metric values (latest)
        self.current_metrics: Dict[str, float] = {
            "response_similarity": 1.0,
            "tool_success_rate": 1.0,
            "user_satisfaction": 1.0,
            "error_rate": 0.0,
            "response_completeness": 1.0,
        }
        
        # Statistics
        self.total_measurements = 0
        self.breach_count = 0
        self.rollback_count = 0
        self.last_rollback_time: Optional[datetime] = None
        
        # Lock for thread-safe operations
        self._lock = asyncio.Lock()
        
        logger.info("QualityMonitor initialized với thresholds và callbacks")
    
    async def track_metric(
        self,
        metric_name: str,
        value: float,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Track a quality metric.
        
        Args:
            metric_name: Name of the metric (response_similarity, tool_success_rate, etc.)
            value: Metric value (0.0-1.0 for rates, 0.0-100.0 for percentages)
            metadata: Optional metadata (model_name, thread_id, etc.)
        """
        async with self._lock:
            if metric_name not in self.metric_history:
                logger.warning(f"Unknown metric name: {metric_name}, creating new metric")
                self.metric_history[metric_name] = deque(maxlen=self.max_history_size)
                self.current_metrics[metric_name] = value
            
            # Normalize value to 0.0-1.0 range for consistency
            normalized_value = value / 100.0 if value > 1.0 else value
            
            # Create metric record
            metric = QualityMetric(
                metric_name=metric_name,
                value=normalized_value,
                timestamp=datetime.now(timezone.utc),
                metadata=metadata or {}
            )
            
            # Add to history
            self.metric_history[metric_name].append(metric)
            self.current_metrics[metric_name] = normalized_value
            self.total_measurements += 1
            
            logger.debug(
                f"📊 Quality metric tracked: {metric_name}={normalized_value:.3f} "
                f"(threshold={self.thresholds.get_threshold(metric_name):.3f})"
            )
            
            # Check if threshold is breached
            threshold = self.thresholds.get_threshold(metric_name)
            if threshold > 0 and normalized_value < threshold:
                await self._handle_threshold_breach(metric_name, normalized_value, threshold)
    
    async def _handle_threshold_breach(
        self,
        metric_name: str,
        value: float,
        threshold: float
    ) -> None:
        """Handle threshold breach - trigger alerts and check for rollback."""
        self.breach_count += 1
        
        logger.warning(
            f"⚠️ Quality threshold breached: {metric_name}={value:.3f} < {threshold:.3f}"
        )
        
        # Trigger alerts
        await self._trigger_alerts(metric_name, value, threshold)
        
        # Check if critical thresholds are breached (auto-rollback)
        critical_metrics = ["response_similarity", "error_rate"]
        if metric_name in critical_metrics:
            await self._check_auto_rollback(metric_name, value, threshold)
    
    async def _trigger_alerts(
        self,
        metric_name: str,
        value: float,
        threshold: float
    ) -> None:
        """Trigger alert callbacks."""
        alert_data = {
            "metric_name": metric_name,
            "value": value,
            "threshold": threshold,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "current_metrics": self.current_metrics.copy(),
        }
        
        for callback in self.alert_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(alert_data)
                else:
                    callback(alert_data)
            except Exception as e:
                logger.error(f"Error in alert callback: {e}")
    
    async def _check_auto_rollback(
        self,
        metric_name: str,
        value: float,
        threshold: float
    ) -> None:
        """Check if auto-rollback should be triggered."""
        # Only rollback if critical metrics are severely breached
        # For response_similarity: rollback if < 0.80 (20% degradation)
        # For error_rate: rollback if > 0.15 (15% error rate)
        
        should_rollback = False
        rollback_reason = ""
        
        if metric_name == "response_similarity" and value < 0.80:
            should_rollback = True
            rollback_reason = f"Response similarity critically low: {value:.3f} < 0.80"
        elif metric_name == "error_rate" and value > 0.15:
            should_rollback = True
            rollback_reason = f"Error rate critically high: {value:.3f} > 0.15"
        
        if should_rollback and self.rollback_callback:
            logger.critical(f"🚨 AUTO-ROLLBACK TRIGGERED: {rollback_reason}")
            await self.trigger_rollback(rollback_reason)
    
    async def trigger_rollback(self, reason: str) -> None:
        """
        Trigger auto-rollback to ORIGINAL mode.
        
        Args:
            reason: Reason for rollback
        """
        async with self._lock:
            self.rollback_count += 1
            self.last_rollback_time = datetime.now(timezone.utc)
            
            logger.critical(
                f"🔄 AUTO-ROLLBACK: Reverting to ORIGINAL mode. Reason: {reason}. "
                f"Rollback count: {self.rollback_count}"
            )
            
            # Try to use OptimizationConfig if available (Story 1.4)
            try:
                from core.utils.config import OptimizationConfig, OptimizationMode
                OptimizationConfig.set_mode(OptimizationMode.ORIGINAL)
                logger.info("✅ Auto-rollback: Optimization mode set to ORIGINAL via OptimizationConfig")
            except Exception as e:
                logger.debug(f"OptimizationConfig not available: {e}")
            
            # Also call rollback callback if provided
            if self.rollback_callback:
                try:
                    if asyncio.iscoroutinefunction(self.rollback_callback):
                        await self.rollback_callback(reason)
                    else:
                        self.rollback_callback(reason)
                except Exception as e:
                    logger.error(f"Error in rollback callback: {e}")
    
    async def check_quality_thresholds(self) -> bool:
        """
        Check if all quality thresholds are met.
        
        Returns:
            True if all thresholds are met, False otherwise
        """
        async with self._lock:
            for metric_name, threshold in [
                ("response_similarity", self.thresholds.response_similarity),
                ("tool_success_rate", self.thresholds.tool_success_rate),
                ("user_satisfaction", self.thresholds.user_satisfaction),
                ("error_rate", self.thresholds.error_rate),
                ("response_completeness", self.thresholds.response_completeness),
            ]:
                current_value = self.current_metrics.get(metric_name, 0.0)
                
                # For error_rate, higher is worse (inverse check)
                if metric_name == "error_rate":
                    if current_value > threshold:
                        logger.warning(
                            f"Quality threshold not met: {metric_name}={current_value:.3f} > {threshold:.3f}"
                        )
                        return False
                else:
                    if current_value < threshold:
                        logger.warning(
                            f"Quality threshold not met: {metric_name}={current_value:.3f} < {threshold:.3f}"
                        )
                        return False
            
            return True
    
    def get_metrics_summary(self) -> Dict[str, Any]:
        """Get summary of current quality metrics."""
        async def _get_summary():
            async with self._lock:
                # Calculate averages from history
                averages = {}
                for metric_name, history in self.metric_history.items():
                    if history:
                        avg_value = sum(m.value for m in history) / len(history)
                        averages[metric_name] = avg_value
                    else:
                        averages[metric_name] = self.current_metrics.get(metric_name, 0.0)
                
                return {
                    "current_metrics": self.current_metrics.copy(),
                    "average_metrics": averages,
                    "total_measurements": self.total_measurements,
                    "breach_count": self.breach_count,
                    "rollback_count": self.rollback_count,
                    "last_rollback_time": self.last_rollback_time.isoformat() if self.last_rollback_time else None,
                    "thresholds": {
                        "response_similarity": self.thresholds.response_similarity,
                        "tool_success_rate": self.thresholds.tool_success_rate,
                        "user_satisfaction": self.thresholds.user_satisfaction,
                        "error_rate": self.thresholds.error_rate,
                        "response_completeness": self.thresholds.response_completeness,
                    }
                }
        
        # Run in event loop if needed
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # If loop is running, we need to use a different approach
                # For now, return synchronous version
                return self._get_summary_sync()
            else:
                return loop.run_until_complete(_get_summary())
        except RuntimeError:
            # No event loop, use sync version
            return self._get_summary_sync()
    
    def _get_summary_sync(self) -> Dict[str, Any]:
        """Synchronous version of get_metrics_summary."""
        averages = {}
        for metric_name, history in self.metric_history.items():
            if history:
                avg_value = sum(m.value for m in history) / len(history)
                averages[metric_name] = avg_value
            else:
                averages[metric_name] = self.current_metrics.get(metric_name, 0.0)
        
        return {
            "current_metrics": self.current_metrics.copy(),
            "average_metrics": averages,
            "total_measurements": self.total_measurements,
            "breach_count": self.breach_count,
            "rollback_count": self.rollback_count,
            "last_rollback_time": self.last_rollback_time.isoformat() if self.last_rollback_time else None,
            "thresholds": {
                "response_similarity": self.thresholds.response_similarity,
                "tool_success_rate": self.thresholds.tool_success_rate,
                "user_satisfaction": self.thresholds.user_satisfaction,
                "error_rate": self.thresholds.error_rate,
                "response_completeness": self.thresholds.response_completeness,
            }
        }


# Global quality monitor instance (singleton pattern)
_quality_monitor_instance: Optional[QualityMonitor] = None


def get_quality_monitor() -> QualityMonitor:
    """Get or create global QualityMonitor instance."""
    global _quality_monitor_instance
    
    if _quality_monitor_instance is None:
        _quality_monitor_instance = QualityMonitor()
        logger.info("Global QualityMonitor instance created")
    
    return _quality_monitor_instance


def set_quality_monitor(monitor: QualityMonitor) -> None:
    """Set global QualityMonitor instance (for testing)."""
    global _quality_monitor_instance
    _quality_monitor_instance = monitor

