"""
API endpoints for Semantic Cache Metrics (Story 2.1).

Provides REST endpoints for accessing semantic cache metrics, status, and performance statistics.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
from datetime import datetime

from core.optimizations.semantic_cache import get_semantic_cache
from core.utils.logger import logger
from core.utils.auth_utils import verify_and_get_user_id_from_jwt

router = APIRouter(prefix="/api/cache/semantic", tags=["Semantic Cache"])


@router.get("/metrics", summary="Get Semantic Cache Metrics", operation_id="get_semantic_cache_metrics")
async def get_semantic_cache_metrics(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Get comprehensive semantic cache metrics summary.
    
    Returns:
        Semantic cache metrics including hit rate, cache size, quality scores, and performance metrics
    """
    try:
        cache = get_semantic_cache()
        metrics = cache.get_metrics()
        
        return {
            "success": True,
            "data": metrics,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get semantic cache metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve semantic cache metrics")


@router.get("/status", summary="Get Semantic Cache Status", operation_id="get_semantic_cache_status")
async def get_semantic_cache_status(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Get semantic cache status (enabled/disabled, configuration, etc.).
    
    Returns:
        Cache status including enabled flag, thresholds, and configuration
    """
    try:
        cache = get_semantic_cache()
        
        return {
            "success": True,
            "data": {
                "enabled": cache.enabled,
                "similarity_threshold": cache.similarity_threshold,
                "quality_threshold": cache.quality_threshold,
                "cache_ttl": cache.cache_ttl,
                "max_cache_size": cache.max_cache_size,
                "auto_disable_enabled": cache.auto_disable_enabled,
                "auto_disable_threshold": cache.auto_disable_threshold,
                "consecutive_quality_breaches": cache.consecutive_quality_breaches,
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get semantic cache status: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve semantic cache status")


@router.post("/enable", summary="Enable Semantic Cache", operation_id="enable_semantic_cache")
async def enable_semantic_cache(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Enable semantic cache.
    
    Returns:
        Success status and updated cache status
    """
    try:
        cache = get_semantic_cache()
        cache.enable()
        
        return {
            "success": True,
            "message": "Semantic cache enabled",
            "data": {
                "enabled": cache.enabled
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to enable semantic cache: {e}")
        raise HTTPException(status_code=500, detail="Failed to enable semantic cache")


@router.post("/disable", summary="Disable Semantic Cache", operation_id="disable_semantic_cache")
async def disable_semantic_cache(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Disable semantic cache.
    
    Returns:
        Success status and updated cache status
    """
    try:
        cache = get_semantic_cache()
        cache.disable()
        
        return {
            "success": True,
            "message": "Semantic cache disabled",
            "data": {
                "enabled": cache.enabled
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to disable semantic cache: {e}")
        raise HTTPException(status_code=500, detail="Failed to disable semantic cache")


@router.post("/clear", summary="Clear Semantic Cache", operation_id="clear_semantic_cache")
async def clear_semantic_cache(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Clear all cached responses (for testing or maintenance).
    
    Returns:
        Success status and cache clear confirmation
    """
    try:
        cache = get_semantic_cache()
        await cache.clear_cache()
        
        return {
            "success": True,
            "message": "Semantic cache cleared",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to clear semantic cache: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear semantic cache")

