"""
Model Selection Rules API Endpoints (Story 3.2).

API endpoints for model routing, metrics, và routing rules.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, Optional
from datetime import datetime

from core.optimizations.model_router import (
    get_model_router,
    ModelRouter,
    RoutingResult
)
from core.api.models.task_classifier_models import ClassificationRequest
from core.utils.logger import logger
from core.utils.auth_utils import verify_and_get_user_id_from_jwt

router = APIRouter(prefix="/api/model-router", tags=["Model Routing"])


@router.post("/route", summary="Route Task to Model", operation_id="route_task", response_model=Dict[str, Any])
async def route_task(
    request: ClassificationRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Route task to optimal model based on complexity.
    
    Args:
        request: Classification request with task text
    
    Returns:
        Routing result with selected model và routing metadata
    """
    try:
        router_instance = get_model_router()
        result = await router_instance.route(request.task, user_id=user_id)
        
        return {
            "success": True,
            "data": {
                "model_id": result.model_id,
                "complexity": result.complexity.value,
                "confidence": result.confidence,
                "decision": result.decision.value,
                "fallback_used": result.fallback_used,
                "routing_metadata": result.routing_metadata,
                "timestamp": result.timestamp.isoformat()
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to route task: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to route task: {str(e)}")


@router.get("/metrics", summary="Get Routing Metrics", operation_id="get_routing_metrics")
async def get_routing_metrics() -> Dict[str, Any]:
    """
    Get model routing metrics.
    
    Returns:
        Routing metrics including total routings, distribution, fallback count, cost savings
    """
    try:
        router_instance = get_model_router()
        metrics = router_instance.get_metrics()
        
        return {
            "success": True,
            "data": metrics,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get routing metrics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get routing metrics")


@router.get("/rules", summary="Get Routing Rules", operation_id="get_routing_rules")
async def get_routing_rules() -> Dict[str, Any]:
    """
    Get routing rules và decision matrix.
    
    Returns:
        Routing rules và decision matrix
    """
    try:
        router_instance = get_model_router()
        rules = router_instance.get_routing_rules()
        decision_matrix = router_instance.get_routing_decision_matrix()
        
        return {
            "success": True,
            "data": {
                "routing_rules": {
                    level.value: model_ids
                    for level, model_ids in rules.items()
                },
                "decision_matrix": decision_matrix
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get routing rules: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get routing rules")


@router.get("/status", summary="Get Router Status", operation_id="get_router_status")
async def get_router_status() -> Dict[str, Any]:
    """
    Get model router status.
    
    Returns:
        Router status including enabled status, metrics summary
    """
    try:
        router_instance = get_model_router()
        metrics = router_instance.get_metrics()
        
        return {
            "success": True,
            "data": {
                "enabled": router_instance.enabled,
                "total_routings": metrics["total_routings"],
                "fallback_count": metrics["fallback_count"],
                "cost_savings_percentage": metrics["cost_savings_percentage"],
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get router status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get router status")


@router.post("/reset-metrics", summary="Reset Routing Metrics", operation_id="reset_routing_metrics")
async def reset_routing_metrics() -> Dict[str, Any]:
    """
    Reset routing metrics.
    
    Returns:
        Success confirmation
    """
    try:
        router_instance = get_model_router()
        router_instance.reset_metrics()
        
        return {
            "success": True,
            "message": "Routing metrics reset successfully",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to reset routing metrics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to reset routing metrics")

