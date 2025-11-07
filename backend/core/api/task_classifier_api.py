"""
Task Complexity Classification API Endpoints (Story 3.1).

API endpoints for task complexity classification and metrics.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Dict, Any, Optional
from datetime import datetime

from core.optimizations.task_classifier import get_task_classifier, TaskClassifier
from core.utils.logger import logger
from core.utils.auth_utils import verify_and_get_user_id_from_jwt

router = APIRouter(prefix="/api/task-classifier", tags=["Task Classification"])


@router.post("/classify", summary="Classify Task Complexity", operation_id="classify_task")
async def classify_task(
    task: str = Query(..., description="Task text to classify"),
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Classify task complexity.
    
    Args:
        task: Task text to classify
    
    Returns:
        Classification result with complexity level and confidence
    """
    try:
        classifier = get_task_classifier()
        result = await classifier.classify(task)
        
        return {
            "success": True,
            "data": {
                "complexity": result.complexity.value,
                "confidence": result.confidence,
                "task": result.task,
                "metadata": result.metadata,
                "timestamp": result.timestamp.isoformat()
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to classify task: {e}")
        raise HTTPException(status_code=500, detail="Failed to classify task")


@router.get("/metrics", summary="Get Classification Metrics", operation_id="get_classification_metrics")
async def get_classification_metrics(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Get classification metrics summary.
    
    Returns:
        Classification metrics including total classifications, distribution, and average confidence
    """
    try:
        classifier = get_task_classifier()
        metrics = classifier.get_metrics()
        
        return {
            "success": True,
            "data": metrics,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get classification metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve classification metrics")


@router.get("/criteria", summary="Get Complexity Level Criteria", operation_id="get_complexity_criteria")
async def get_complexity_criteria(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Get complexity level criteria definitions.
    
    Returns:
        Complexity level criteria with descriptions, examples, and characteristics
    """
    try:
        criteria = TaskClassifier.get_complexity_level_criteria()
        
        return {
            "success": True,
            "data": criteria,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get complexity criteria: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve complexity criteria")


@router.get("/status", summary="Get Classification Status", operation_id="get_classification_status")
async def get_classification_status(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Get classification system status.
    
    Returns:
        Classification system status including enabled state and configuration
    """
    try:
        classifier = get_task_classifier()
        
        return {
            "success": True,
            "data": {
                "enabled": classifier.enabled,
                "classification_method": classifier.classification_method,
                "llm_model": classifier.llm_model,
                "metrics": classifier.get_metrics()
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get classification status: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve classification status")

