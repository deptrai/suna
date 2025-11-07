"""
Quality Monitoring API Endpoints (Story 2.4).

API endpoints for quality monitoring dashboard and metrics access.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Dict, Any, Optional
from datetime import datetime

from core.optimizations.quality_monitor import get_quality_monitor
from core.utils.logger import logger
from core.utils.auth_utils import verify_and_get_user_id_from_jwt

router = APIRouter(prefix="/api/quality", tags=["Quality Monitoring"])


@router.get("/metrics", summary="Get Quality Metrics Summary", operation_id="get_quality_metrics")
async def get_quality_metrics(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Get comprehensive quality metrics summary for dashboard.
    
    Returns:
        Quality metrics summary including current metrics, averages, thresholds, and statistics
    """
    try:
        quality_monitor = get_quality_monitor()
        summary = quality_monitor.get_metrics_summary()
        
        return {
            "success": True,
            "data": summary,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get quality metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve quality metrics")


@router.get("/metrics/{metric_name}", summary="Get Specific Metric History", operation_id="get_metric_history")
async def get_metric_history(
    metric_name: str,
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of metrics to return"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Get history for a specific quality metric.
    
    Args:
        metric_name: Name of the metric (response_similarity, tool_success_rate, etc.)
        limit: Maximum number of metrics to return
    
    Returns:
        Metric history with timestamps and values
    """
    try:
        quality_monitor = get_quality_monitor()
        
        if metric_name not in quality_monitor.metric_history:
            raise HTTPException(status_code=404, detail=f"Metric '{metric_name}' not found")
        
        history = list(quality_monitor.metric_history[metric_name])[-limit:]
        
        return {
            "success": True,
            "data": {
                "metric_name": metric_name,
                "history": [
                    {
                        "value": metric.value,
                        "timestamp": metric.timestamp.isoformat(),
                        "metadata": metric.metadata
                    }
                    for metric in history
                ],
                "count": len(history)
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get metric history for {metric_name}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve metric history")


@router.get("/status", summary="Get Quality Status", operation_id="get_quality_status")
async def get_quality_status(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Get current quality status (thresholds met or not).
    
    Returns:
        Quality status with threshold check results
    """
    try:
        quality_monitor = get_quality_monitor()
        
        # Check if thresholds are met
        thresholds_met = await quality_monitor.check_quality_thresholds()
        
        summary = quality_monitor.get_metrics_summary()
        
        return {
            "success": True,
            "data": {
                "status": "healthy" if thresholds_met else "degraded",
                "thresholds_met": thresholds_met,
                "current_metrics": summary.get("current_metrics", {}),
                "thresholds": summary.get("thresholds", {}),
                "rollback_count": summary.get("rollback_count", 0),
                "last_rollback_time": summary.get("last_rollback_time")
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get quality status: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve quality status")

