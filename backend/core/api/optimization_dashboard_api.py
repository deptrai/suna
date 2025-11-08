"""
Unified Optimization Dashboard API (Epic 1 + Story 2.4 Integration).

This module provides a unified dashboard API that combines all optimization metrics:
- Epic 1: OpenAI Prompt Caching, LiteLLM Redis Caching, Anthropic Explicit Caching
- Story 2.4: Quality Monitoring Framework

This enables a single dashboard endpoint for monitoring all optimizations.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, Optional
from datetime import datetime, timezone

from core.optimizations.quality_monitor import get_quality_monitor
from core.services.cache_metrics import get_cache_metrics_collector, check_cache_health
from core.services.openai_prompt_cache_metrics import get_openai_prompt_cache_metrics_collector
from core.utils.logger import logger
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.utils.config import OptimizationConfig

router = APIRouter(prefix="/api/optimization", tags=["Optimization Dashboard"])


@router.get("/dashboard", summary="Get Unified Optimization Dashboard", operation_id="get_optimization_dashboard")
async def get_optimization_dashboard(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Get unified optimization dashboard with all Epic 1 and Story 2.4 metrics.
    
    Returns:
        Comprehensive dashboard data including:
        - Cache metrics (OpenAI, LiteLLM, Anthropic)
        - Quality metrics
        - Optimization mode status
        - Performance metrics
        - Cost savings estimates
    """
    try:
        dashboard_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "optimization_mode": OptimizationConfig.OPTIMIZATION_MODE.value,
        }
        
        # 1. Cache Metrics (Story 1.2: LiteLLM Redis Caching)
        try:
            cache_collector = get_cache_metrics_collector()
            cache_metrics = cache_collector.get_summary()
            dashboard_data["cache_metrics"] = {
                "litellm_redis": {
                    "total_requests": cache_metrics.get("total_requests", 0),
                    "cache_hits": cache_metrics.get("cache_hits", 0),
                    "cache_misses": cache_metrics.get("cache_misses", 0),
                    "hit_rate": cache_metrics.get("hit_rate", 0.0),
                    "hit_rate_percentage": cache_metrics.get("hit_rate_percentage", 0.0),
                    "performance_improvement": cache_metrics.get("performance_improvement_percentage", 0.0),
                    "model_stats": cache_metrics.get("model_stats", {})
                }
            }
            
            # Cache health
            cache_health = await check_cache_health()
            dashboard_data["cache_metrics"]["litellm_redis"]["health"] = cache_health
        except Exception as e:
            logger.warning(f"Failed to get cache metrics: {e}")
            dashboard_data["cache_metrics"] = {
                "litellm_redis": {
                    "error": str(e),
                    "available": False
                }
            }
        
        # 2. Quality Metrics (Story 2.4: Quality Monitoring Framework)
        try:
            quality_monitor = get_quality_monitor()
            quality_summary = quality_monitor.get_metrics_summary()
            dashboard_data["quality_metrics"] = {
                "current_metrics": quality_summary.get("current_metrics", {}),
                "averages": quality_summary.get("averages", {}),
                "thresholds": quality_summary.get("thresholds", {}),
                "thresholds_met": quality_summary.get("thresholds_met", {}),
                "rollback_count": quality_summary.get("rollback_count", 0),
                "last_rollback_time": quality_summary.get("last_rollback_time")
            }
            
            # Check quality status
            thresholds_met = await quality_monitor.check_quality_thresholds()
            dashboard_data["quality_metrics"]["status"] = "healthy" if thresholds_met else "degraded"
            
            # Get cache-specific quality metrics
            if "anthropic_cache_hit_rate" in quality_summary.get("current_metrics", {}):
                dashboard_data["cache_metrics"]["anthropic"] = {
                    "cache_hit_rate": quality_summary["current_metrics"]["anthropic_cache_hit_rate"],
                    "available": True
                }
            else:
                dashboard_data["cache_metrics"]["anthropic"] = {
                    "available": False
                }
            
            # Get OpenAI prompt cache metrics (Story 1.1)
            try:
                openai_collector = get_openai_prompt_cache_metrics_collector()
                openai_metrics = openai_collector.get_summary()
                if openai_metrics.get("total_operations", 0) > 0:
                    dashboard_data["cache_metrics"]["openai_prompt"] = {
                        "cache_hit_rate": openai_metrics.get("cache_hit_rate_percentage", 0.0),
                        "total_operations": openai_metrics.get("total_operations", 0),
                        "total_cached_tokens": openai_metrics.get("total_cached_tokens", 0),
                        "available": True
                    }
                else:
                    dashboard_data["cache_metrics"]["openai_prompt"] = {
                        "available": False
                    }
            except Exception as e:
                logger.warning(f"Failed to get OpenAI prompt cache metrics: {e}")
                dashboard_data["cache_metrics"]["openai_prompt"] = {
                    "available": False
                }
        except Exception as e:
            logger.warning(f"Failed to get quality metrics: {e}")
            dashboard_data["quality_metrics"] = {
                "error": str(e),
                "available": False
            }
        
        # 3. Optimization Mode Statistics (Story 1.4: Dual-Mode Architecture)
        try:
            mode_stats = OptimizationConfig.get_mode_switch_stats()
            dashboard_data["optimization_mode_stats"] = mode_stats
        except Exception as e:
            logger.warning(f"Failed to get optimization mode stats: {e}")
            dashboard_data["optimization_mode_stats"] = {
                "error": str(e),
                "available": False
            }
        
        # 4. Cost Savings Estimates
        try:
            cost_savings = _calculate_cost_savings_estimates(dashboard_data)
            dashboard_data["cost_savings"] = cost_savings
        except Exception as e:
            logger.warning(f"Failed to calculate cost savings: {e}")
            dashboard_data["cost_savings"] = {
                "error": str(e),
                "available": False
            }
        
        # 5. Performance Summary
        dashboard_data["performance_summary"] = {
            "cache_hit_rate": dashboard_data.get("cache_metrics", {}).get("litellm_redis", {}).get("hit_rate_percentage", 0.0),
            "quality_status": dashboard_data.get("quality_metrics", {}).get("status", "unknown"),
            "optimization_mode": dashboard_data["optimization_mode"],
            "overall_health": _calculate_overall_health(dashboard_data)
        }
        
        return {
            "success": True,
            "data": dashboard_data
        }
    except Exception as e:
        logger.error(f"Failed to get optimization dashboard: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve optimization dashboard")


@router.get("/dashboard/cache", summary="Get Cache Metrics Summary", operation_id="get_cache_dashboard")
async def get_cache_dashboard(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Get cache metrics summary for dashboard (Epic 1: Stories 1.1, 1.2, 1.3).
    
    Returns:
        Comprehensive cache metrics including:
        - OpenAI Prompt Caching metrics
        - LiteLLM Redis Caching metrics
        - Anthropic Explicit Caching metrics
    """
    try:
        cache_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        
        # 1. LiteLLM Redis Cache Metrics (Story 1.2)
        try:
            cache_collector = get_cache_metrics_collector()
            cache_metrics = cache_collector.get_summary()
            cache_health = await check_cache_health()
            
            cache_data["litellm_redis"] = {
                "metrics": cache_metrics,
                "health": cache_health,
                "available": True
            }
        except Exception as e:
            logger.warning(f"Failed to get LiteLLM cache metrics: {e}")
            cache_data["litellm_redis"] = {
                "error": str(e),
                "available": False
            }
        
        # 2. Anthropic Cache Metrics (Story 1.3)
        try:
            quality_monitor = get_quality_monitor()
            quality_summary = quality_monitor.get_metrics_summary()
            
            anthropic_metrics = {}
            if "anthropic_cache_hit_rate" in quality_summary.get("current_metrics", {}):
                anthropic_metrics["cache_hit_rate"] = quality_summary["current_metrics"]["anthropic_cache_hit_rate"]
            
            if "anthropic_cache_hit_rate" in quality_summary.get("averages", {}):
                anthropic_metrics["average_cache_hit_rate"] = quality_summary["averages"]["anthropic_cache_hit_rate"]
            
            cache_data["anthropic"] = {
                "metrics": anthropic_metrics,
                "available": len(anthropic_metrics) > 0
            }
        except Exception as e:
            logger.warning(f"Failed to get Anthropic cache metrics: {e}")
            cache_data["anthropic"] = {
                "error": str(e),
                "available": False
            }
        
        # 3. OpenAI Prompt Caching Metrics (Story 1.1)
        try:
            openai_collector = get_openai_prompt_cache_metrics_collector()
            openai_metrics = openai_collector.get_summary()
            cache_data["openai_prompt"] = {
                "metrics": openai_metrics,
                "available": openai_metrics.get("total_operations", 0) > 0
            }
        except Exception as e:
            logger.warning(f"Failed to get OpenAI prompt cache metrics: {e}")
            cache_data["openai_prompt"] = {
                "error": str(e),
                "available": False
            }
        
        # 4. Overall Cache Summary
        cache_data["summary"] = {
            "total_cache_types": sum([
                cache_data.get("litellm_redis", {}).get("available", False),
                cache_data.get("anthropic", {}).get("available", False),
                cache_data.get("openai_prompt", {}).get("available", False)
            ]),
            "overall_hit_rate": cache_data.get("litellm_redis", {}).get("metrics", {}).get("hit_rate_percentage", 0.0),
            "cache_health": cache_data.get("litellm_redis", {}).get("health", {}).get("healthy", False)
        }
        
        return {
            "success": True,
            "data": cache_data
        }
    except Exception as e:
        logger.error(f"Failed to get cache dashboard: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve cache dashboard")


def _calculate_cost_savings_estimates(dashboard_data: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate cost savings estimates from cache metrics."""
    savings = {
        "available": False,
        "estimates": {}
    }
    
    try:
        # LiteLLM Redis Cache Savings (Story 1.2)
        litellm_metrics = dashboard_data.get("cache_metrics", {}).get("litellm_redis", {})
        if litellm_metrics.get("available", False):
            hit_rate = litellm_metrics.get("hit_rate", 0.0)
            # Estimate: 10-20% API call reduction for duplicate queries
            # Average cost per request: ~$0.001 (example)
            # Monthly requests: 10,000 (example)
            # Savings = hit_rate * requests * cost_per_request * 0.5 (conservative)
            estimated_monthly_savings = hit_rate * 10000 * 0.001 * 0.5
            savings["estimates"]["litellm_redis"] = {
                "monthly_savings_usd": round(estimated_monthly_savings, 2),
                "hit_rate": hit_rate,
                "note": "Estimated savings based on cache hit rate"
            }
            savings["available"] = True
        
        # Anthropic Cache Savings (Story 1.3)
        anthropic_metrics = dashboard_data.get("cache_metrics", {}).get("anthropic", {})
        if anthropic_metrics.get("available", False):
            cache_hit_rate = anthropic_metrics.get("cache_hit_rate", 0.0)
            # Estimate: 20-30% cost reduction for Claude users
            # Similar calculation as LiteLLM
            estimated_monthly_savings = cache_hit_rate * 5000 * 0.002 * 0.5  # Higher cost for Claude
            savings["estimates"]["anthropic"] = {
                "monthly_savings_usd": round(estimated_monthly_savings, 2),
                "cache_hit_rate": cache_hit_rate,
                "note": "Estimated savings for Anthropic Claude users"
            }
            savings["available"] = True
        
        # OpenAI Prompt Cache Savings (Story 1.1)
        openai_metrics = dashboard_data.get("cache_metrics", {}).get("openai_prompt", {})
        if openai_metrics.get("available", False):
            cache_hit_rate = openai_metrics.get("cache_hit_rate", 0.0) / 100.0  # Convert percentage to decimal
            # Estimate: 30-50% cost reduction for cached tokens
            # OpenAI prompt caching reduces cost per token for cached portion
            estimated_monthly_savings = cache_hit_rate * 10000 * 0.001 * 0.4  # 40% savings on cached tokens
            savings["estimates"]["openai_prompt"] = {
                "monthly_savings_usd": round(estimated_monthly_savings, 2),
                "cache_hit_rate": cache_hit_rate * 100.0,  # Back to percentage
                "note": "Estimated savings from OpenAI prompt caching (30-50% reduction on cached tokens)"
            }
            savings["available"] = True
        
        # Total Estimated Savings
        if savings["available"]:
            total_savings = sum([
                savings["estimates"].get("litellm_redis", {}).get("monthly_savings_usd", 0.0),
                savings["estimates"].get("anthropic", {}).get("monthly_savings_usd", 0.0),
                savings["estimates"].get("openai_prompt", {}).get("monthly_savings_usd", 0.0)
            ])
            savings["total_estimated_monthly_savings_usd"] = round(total_savings, 2)
            savings["note"] = "Estimates are conservative and based on example usage patterns"
    except Exception as e:
        logger.warning(f"Failed to calculate cost savings: {e}")
        savings["error"] = str(e)
    
    return savings


def _calculate_overall_health(dashboard_data: Dict[str, Any]) -> str:
    """Calculate overall health status from all metrics."""
    health_statuses = []
    
    # Cache health
    cache_health = dashboard_data.get("cache_metrics", {}).get("litellm_redis", {}).get("health", {}).get("healthy", None)
    if cache_health is not None:
        health_statuses.append("healthy" if cache_health else "unhealthy")
    
    # Quality health
    quality_status = dashboard_data.get("quality_metrics", {}).get("status", "unknown")
    if quality_status != "unknown":
        health_statuses.append(quality_status)
    
    # Determine overall health
    if not health_statuses:
        return "unknown"
    elif "unhealthy" in health_statuses or "degraded" in health_statuses:
        return "degraded"
    elif all(status in ["healthy", "unknown"] for status in health_statuses):
        return "healthy"
    else:
        return "unknown"

