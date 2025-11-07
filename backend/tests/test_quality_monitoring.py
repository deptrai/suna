"""
Tests for Quality Monitoring Framework (Story 2.4).

Tests verify:
- QualityMonitor class functionality
- Metric tracking
- Threshold breach detection
- Auto-rollback mechanism
- Quality metrics calculation
"""

import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch
from datetime import datetime, timezone

from core.optimizations.quality_monitor import (
    QualityMonitor,
    QualityThresholds,
    QualityMetric,
    OptimizationMode,
    get_quality_monitor,
    set_quality_monitor
)
from core.optimizations.quality_metrics import (
    calculate_response_similarity,
    calculate_tool_success_rate,
    calculate_error_rate,
    calculate_response_completeness,
    extract_user_satisfaction
)


class TestQualityMonitor:
    """Test QualityMonitor class."""
    
    @pytest.mark.asyncio
    async def test_quality_monitor_initialization(self):
        """Test QualityMonitor initialization."""
        monitor = QualityMonitor()
        
        assert monitor.thresholds is not None
        assert isinstance(monitor.thresholds, QualityThresholds)
        assert len(monitor.metric_history) == 5  # 5 metrics
        assert monitor.total_measurements == 0
        assert monitor.breach_count == 0
        assert monitor.rollback_count == 0
    
    @pytest.mark.asyncio
    async def test_track_metric(self):
        """Test metric tracking."""
        monitor = QualityMonitor()
        
        await monitor.track_metric("response_similarity", 0.95)
        
        assert monitor.total_measurements == 1
        assert monitor.current_metrics["response_similarity"] == 0.95
        assert len(monitor.metric_history["response_similarity"]) == 1
    
    @pytest.mark.asyncio
    async def test_threshold_breach_detection(self):
        """Test threshold breach detection."""
        alert_callback = Mock()
        monitor = QualityMonitor(alert_callbacks=[alert_callback])
        
        # Track metric below threshold
        await monitor.track_metric("response_similarity", 0.80)  # Below 0.95 threshold
        
        # Should trigger alert
        assert monitor.breach_count > 0
        assert alert_callback.called
    
    @pytest.mark.asyncio
    async def test_auto_rollback_trigger(self):
        """Test auto-rollback trigger."""
        rollback_callback = AsyncMock()
        monitor = QualityMonitor(rollback_callback=rollback_callback)
        
        # Track critical metric that should trigger rollback
        await monitor.track_metric("response_similarity", 0.75)  # Critically low (< 0.80)
        
        # Should trigger rollback
        await asyncio.sleep(0.1)  # Allow async operations to complete
        assert monitor.rollback_count > 0
        assert rollback_callback.called
    
    @pytest.mark.asyncio
    async def test_check_quality_thresholds(self):
        """Test quality threshold checking."""
        monitor = QualityMonitor()
        
        # Set all metrics to good values
        await monitor.track_metric("response_similarity", 0.98)
        await monitor.track_metric("tool_success_rate", 0.95)
        await monitor.track_metric("user_satisfaction", 0.90)
        await monitor.track_metric("error_rate", 0.02)
        await monitor.track_metric("response_completeness", 0.95)
        
        # All thresholds should be met
        result = await monitor.check_quality_thresholds()
        assert result is True
    
    @pytest.mark.asyncio
    async def test_get_metrics_summary(self):
        """Test metrics summary generation."""
        monitor = QualityMonitor()
        
        await monitor.track_metric("response_similarity", 0.95)
        await monitor.track_metric("tool_success_rate", 0.90)
        
        summary = monitor.get_metrics_summary()
        
        assert "current_metrics" in summary
        assert "average_metrics" in summary
        assert "total_measurements" in summary
        assert summary["total_measurements"] == 2
        assert "thresholds" in summary


class TestQualityMetrics:
    """Test quality metrics calculation."""
    
    def test_calculate_response_similarity_text(self):
        """Test text-based response similarity calculation."""
        original = "This is a test response with some content."
        optimized = "This is a test response with some content."
        
        similarity = calculate_response_similarity(original, optimized, use_semantic=False)
        
        assert similarity > 0.9  # Should be very similar
    
    def test_calculate_response_similarity_different(self):
        """Test similarity calculation for different responses."""
        original = "This is a test response."
        optimized = "Completely different content here."
        
        similarity = calculate_response_similarity(original, optimized, use_semantic=False)
        
        assert similarity < 0.5  # Should be less similar
    
    def test_calculate_tool_success_rate(self):
        """Test tool success rate calculation."""
        tool_calls = [
            {"name": "tool1", "parameters": {}},
            {"name": "tool2", "parameters": {}}
        ]
        tool_results = [
            {"status": "success", "result": "ok"},
            {"status": "success", "result": "ok"}
        ]
        
        success_rate = calculate_tool_success_rate(tool_calls, tool_results)
        
        assert success_rate == 1.0  # 100% success
    
    def test_calculate_tool_success_rate_with_errors(self):
        """Test tool success rate with errors."""
        tool_calls = [
            {"name": "tool1", "parameters": {}},
            {"name": "tool2", "parameters": {}}
        ]
        tool_results = [
            {"status": "success", "result": "ok"},
            {"status": "error", "error": "Failed"}
        ]
        
        success_rate = calculate_tool_success_rate(tool_calls, tool_results)
        
        assert success_rate == 0.5  # 50% success
    
    def test_calculate_error_rate(self):
        """Test error rate calculation."""
        responses = [
            {"content": "Response 1"},
            {"content": "Response 2"},
            {"content": "Response 3"}
        ]
        errors = [None, None, Exception("Error")]
        
        error_rate = calculate_error_rate(responses, errors)
        
        assert error_rate == pytest.approx(1.0 / 3.0, abs=0.01)  # 33% error rate
    
    def test_calculate_response_completeness(self):
        """Test response completeness calculation."""
        response = "This is a complete response with all required information."
        
        completeness = calculate_response_completeness(response)
        
        assert completeness > 0.8  # Should be mostly complete
    
    def test_extract_user_satisfaction_from_rating(self):
        """Test user satisfaction extraction from rating."""
        satisfaction = extract_user_satisfaction(rating=4.0)  # 4/5 rating
        
        assert satisfaction == pytest.approx(0.8, abs=0.01)  # 4/5 = 0.8
    
    def test_extract_user_satisfaction_from_feedback(self):
        """Test user satisfaction extraction from feedback."""
        feedback = {"text": "Great response, very helpful!"}
        
        satisfaction = extract_user_satisfaction(feedback=feedback)
        
        assert satisfaction > 0.7  # Positive feedback should be high

