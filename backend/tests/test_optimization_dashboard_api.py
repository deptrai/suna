"""
Tests for Optimization Dashboard API (Epic 1 + Story 2.4 Integration).

Tests verify:
- Unified optimization dashboard endpoint
- Cache metrics dashboard endpoint
- Integration with quality monitor
- Cost savings estimates
"""

import pytest
from unittest.mock import Mock, patch, AsyncMock, MagicMock
from typing import Dict, Any

# Test imports
from core.api.optimization_dashboard_api import (
    get_optimization_dashboard,
    get_cache_dashboard,
    _calculate_cost_savings_estimates,
    _calculate_overall_health
)


class TestOptimizationDashboard:
    """Test unified optimization dashboard endpoint."""
    
    @pytest.mark.asyncio
    async def test_get_optimization_dashboard_structure(self):
        """Test that dashboard returns correct structure."""
        # Mock dependencies
        with patch('core.api.optimization_dashboard_api.get_cache_metrics_collector') as mock_cache_collector, \
             patch('core.api.optimization_dashboard_api.check_cache_health') as mock_cache_health, \
             patch('core.api.optimization_dashboard_api.get_quality_monitor') as mock_quality_monitor, \
             patch('core.api.optimization_dashboard_api.get_openai_prompt_cache_metrics_collector') as mock_openai_collector, \
             patch('core.api.optimization_dashboard_api.OptimizationConfig') as mock_optimization_config:
            
            # Setup mocks
            mock_cache_collector.return_value.get_summary.return_value = {
                "total_requests": 100,
                "cache_hits": 20,
                "cache_misses": 80,
                "hit_rate": 0.2,
                "hit_rate_percentage": 20.0
            }
            mock_cache_health.return_value = {"healthy": True, "configured": True}
            mock_quality_monitor.return_value.get_metrics_summary.return_value = {
                "current_metrics": {},
                "averages": {},
                "thresholds": {},
                "thresholds_met": {},
                "rollback_count": 0
            }
            mock_quality_monitor.return_value.check_quality_thresholds = AsyncMock(return_value=True)
            mock_openai_collector.return_value.get_summary.return_value = {
                "total_operations": 50,
                "cache_hit_rate_percentage": 30.0
            }
            mock_optimization_config.OPTIMIZATION_MODE.value = "optimized"
            mock_optimization_config.get_mode_switch_stats.return_value = {
                "current_mode": "optimized",
                "switch_count": 0
            }
            
            # Call endpoint
            result = await get_optimization_dashboard(user_id="test-user")
            
            # Verify structure
            assert result["success"] is True
            assert "data" in result
            assert "timestamp" in result["data"]
            assert "optimization_mode" in result["data"]
            assert "cache_metrics" in result["data"]
            assert "quality_metrics" in result["data"]
            assert "optimization_mode_stats" in result["data"]
            assert "cost_savings" in result["data"]
            assert "performance_summary" in result["data"]
    
    @pytest.mark.asyncio
    async def test_get_cache_dashboard_structure(self):
        """Test that cache dashboard returns correct structure."""
        # Mock dependencies
        with patch('core.api.optimization_dashboard_api.get_cache_metrics_collector') as mock_cache_collector, \
             patch('core.api.optimization_dashboard_api.check_cache_health') as mock_cache_health, \
             patch('core.api.optimization_dashboard_api.get_quality_monitor') as mock_quality_monitor, \
             patch('core.api.optimization_dashboard_api.get_openai_prompt_cache_metrics_collector') as mock_openai_collector:
            
            # Setup mocks
            mock_cache_collector.return_value.get_summary.return_value = {
                "total_requests": 100,
                "cache_hits": 20,
                "cache_misses": 80,
                "hit_rate": 0.2
            }
            mock_cache_health.return_value = {"healthy": True}
            mock_quality_monitor.return_value.get_metrics_summary.return_value = {
                "current_metrics": {}
            }
            mock_openai_collector.return_value.get_summary.return_value = {
                "total_operations": 50
            }
            
            # Call endpoint
            result = await get_cache_dashboard(user_id="test-user")
            
            # Verify structure
            assert result["success"] is True
            assert "data" in result
            assert "litellm_redis" in result["data"]
            assert "anthropic" in result["data"]
            assert "openai_prompt" in result["data"]
            assert "summary" in result["data"]


class TestCostSavingsCalculation:
    """Test cost savings calculation."""
    
    def test_calculate_cost_savings_estimates(self):
        """Test cost savings estimation."""
        dashboard_data = {
            "cache_metrics": {
                "litellm_redis": {
                    "available": True,
                    "hit_rate": 0.2  # 20% hit rate
                },
                "anthropic": {
                    "available": True,
                    "cache_hit_rate": 25.0  # 25% hit rate
                },
                "openai_prompt": {
                    "available": True,
                    "cache_hit_rate": 30.0  # 30% hit rate
                }
            }
        }
        
        savings = _calculate_cost_savings_estimates(dashboard_data)
        
        assert savings["available"] is True
        assert "estimates" in savings
        assert "litellm_redis" in savings["estimates"]
        assert "anthropic" in savings["estimates"]
        assert "openai_prompt" in savings["estimates"]
        assert "total_estimated_monthly_savings_usd" in savings
    
    def test_calculate_cost_savings_no_metrics(self):
        """Test cost savings with no metrics available."""
        dashboard_data = {
            "cache_metrics": {
                "litellm_redis": {"available": False},
                "anthropic": {"available": False},
                "openai_prompt": {"available": False}
            }
        }
        
        savings = _calculate_cost_savings_estimates(dashboard_data)
        
        assert savings["available"] is False
        assert "estimates" in savings
        assert len(savings["estimates"]) == 0


class TestOverallHealthCalculation:
    """Test overall health calculation."""
    
    def test_calculate_overall_health_healthy(self):
        """Test overall health calculation when all systems are healthy."""
        dashboard_data = {
            "cache_metrics": {
                "litellm_redis": {
                    "health": {"healthy": True}
                }
            },
            "quality_metrics": {
                "status": "healthy"
            }
        }
        
        health = _calculate_overall_health(dashboard_data)
        assert health == "healthy"
    
    def test_calculate_overall_health_degraded(self):
        """Test overall health calculation when quality is degraded."""
        dashboard_data = {
            "cache_metrics": {
                "litellm_redis": {
                    "health": {"healthy": True}
                }
            },
            "quality_metrics": {
                "status": "degraded"
            }
        }
        
        health = _calculate_overall_health(dashboard_data)
        assert health == "degraded"
    
    def test_calculate_overall_health_unknown(self):
        """Test overall health calculation when metrics are unavailable."""
        dashboard_data = {}
        
        health = _calculate_overall_health(dashboard_data)
        assert health == "unknown"


class TestOpenAIPromptCacheMetrics:
    """Test OpenAI prompt cache metrics collection."""
    
    @pytest.mark.asyncio
    async def test_openai_prompt_cache_metrics_collector(self):
        """Test OpenAI prompt cache metrics collector."""
        from core.services.openai_prompt_cache_metrics import (
            get_openai_prompt_cache_metrics_collector,
            OpenAIPromptCacheMetricsCollector
        )
        
        collector = get_openai_prompt_cache_metrics_collector()
        assert collector is not None
        assert isinstance(collector, OpenAIPromptCacheMetricsCollector)
        
        # Record some operations
        await collector.record_operation(
            cached_tokens=100,
            total_tokens=1000,
            model="test-model"
        )
        
        await collector.record_operation(
            cached_tokens=0,
            total_tokens=500,
            model="test-model"
        )
        
        # Get summary
        summary = collector.get_summary()
        assert summary["total_operations"] == 2
        assert summary["cache_hit_operations"] == 1
        assert summary["cache_hit_rate"] == 0.5
        assert summary["total_cached_tokens"] == 100
        assert summary["total_tokens"] == 1500
    
    def test_openai_prompt_cache_metrics_hit_rate(self):
        """Test cache hit rate calculation."""
        from core.services.openai_prompt_cache_metrics import OpenAIPromptCacheMetricsCollector
        
        collector = OpenAIPromptCacheMetricsCollector()
        
        # No operations yet
        assert collector.get_cache_hit_rate() == 0.0
        assert collector.get_cache_hit_rate_percentage() == 0.0
        
        # Record operations
        import asyncio
        asyncio.run(collector.record_operation(100, 1000, "model1"))
        asyncio.run(collector.record_operation(0, 500, "model1"))
        asyncio.run(collector.record_operation(200, 800, "model2"))
        
        # Check hit rate
        assert collector.get_cache_hit_rate() == pytest.approx(2/3, abs=0.01)  # 2 out of 3 operations had cache hits
        assert collector.get_cache_hit_rate_percentage() == pytest.approx(66.67, abs=0.1)

