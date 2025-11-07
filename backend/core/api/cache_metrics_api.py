"""
API endpoints for LiteLLM Cache Metrics (Story 1.2 - Minor Recommendations).

Provides REST endpoints for accessing cache metrics, health status, and performance statistics.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
from datetime import datetime

from core.services.cache_metrics import get_cache_metrics_collector, check_cache_health
from core.utils.logger import logger
from core.utils.auth_utils import verify_and_get_user_id_from_jwt

router = APIRouter(prefix="/api/cache", tags=["Cache Metrics"])


@router.get("/metrics", summary="Get Cache Metrics Summary", operation_id="get_cache_metrics")
async def get_cache_metrics(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Get comprehensive cache metrics summary.
    
    Returns:
        Cache metrics including hit rate, total requests, performance metrics, and per-model statistics
    """
    try:
        collector = get_cache_metrics_collector()
        summary = collector.get_summary()
        
        return {
            "success": True,
            "data": summary,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get cache metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve cache metrics")


@router.get("/health", summary="Get Cache Health Status", operation_id="get_cache_health")
async def get_cache_health_status(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Get cache health status.
    
    Returns:
        Health status including configured, operational, and healthy flags
    """
    try:
        health_status = await check_cache_health()
        
        return {
            "success": True,
            "data": health_status,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get cache health status: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve cache health status")


@router.get("/metrics/hit-rate", summary="Get Cache Hit Rate", operation_id="get_cache_hit_rate")
async def get_cache_hit_rate(
    model: str = None,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Get cache hit rate (overall or for specific model).
    
    Args:
        model: Optional model name to get hit rate for specific model
    
    Returns:
        Cache hit rate as percentage
    """
    try:
        collector = get_cache_metrics_collector()
        
        if model:
            hit_rate = collector.get_model_cache_hit_rate(model)
            hit_rate_percentage = hit_rate * 100.0
        else:
            hit_rate = collector.get_cache_hit_rate()
            hit_rate_percentage = collector.get_cache_hit_rate_percentage()
        
        return {
            "success": True,
            "data": {
                "hit_rate": hit_rate,
                "hit_rate_percentage": hit_rate_percentage,
                "model": model if model else "all",
                "total_requests": collector.total_requests,
                "cache_hits": collector.cache_hits,
                "cache_misses": collector.cache_misses
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get cache hit rate: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve cache hit rate")


@router.get("/metrics/performance", summary="Get Cache Performance Metrics", operation_id="get_cache_performance")
async def get_cache_performance(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Get cache performance metrics including response time improvements.
    
    Returns:
        Performance metrics including average response times and improvement percentage
    """
    try:
        collector = get_cache_metrics_collector()
        
        avg_response_time = collector.get_average_response_time()
        avg_cached_response_time = collector.get_average_response_time(cached_only=True)
        avg_uncached_response_time = (
            collector.uncached_response_time_ms / collector.cache_misses
            if collector.cache_misses > 0 else None
        )
        performance_improvement = collector.get_performance_improvement()
        
        return {
            "success": True,
            "data": {
                "average_response_time_ms": avg_response_time,
                "average_cached_response_time_ms": avg_cached_response_time,
                "average_uncached_response_time_ms": avg_uncached_response_time,
                "performance_improvement_percentage": performance_improvement,
                "total_requests": collector.total_requests,
                "cache_hits": collector.cache_hits,
                "cache_misses": collector.cache_misses
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get cache performance metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve cache performance metrics")

