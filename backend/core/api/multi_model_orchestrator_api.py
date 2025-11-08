"""
Multi-Model Orchestrator API Endpoints (Story 3.3).

API endpoints for executing multi-step workflows với sequential model chaining.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
from datetime import datetime

from core.optimizations.multi_model_orchestrator import (
    get_multi_model_orchestrator,
    MultiModelOrchestrator,
    WorkflowResult,
    WorkflowExecutionStatus,
    StepResult,
    StepExecutionStatus
)
from core.utils.logger import logger
from core.utils.auth_utils import verify_and_get_user_id_from_jwt
from core.api.models.multi_model_orchestrator_models import (
    ExecuteWorkflowRequest,
    ExecuteWorkflowResponse,
    StepResultResponse
)

router = APIRouter(prefix="/api/workflow", tags=["Workflow Orchestration"])


def _step_result_to_dict(step_result: StepResult) -> Dict[str, Any]:
    """Convert StepResult to dict for API response."""
    return {
        "step_id": step_result.step_id,
        "status": step_result.status.value,
        "model_id": step_result.model_id,
        "input": step_result.input,
        "output": step_result.output,
        "error": step_result.error,
        "retry_count": step_result.retry_count,
        "fallback_used": step_result.fallback_used,
        "execution_time_ms": step_result.execution_time_ms,
        "token_usage": step_result.token_usage,
        "timestamp": step_result.timestamp.isoformat()
    }


def _workflow_result_to_response(workflow_result: WorkflowResult) -> Dict[str, Any]:
    """Convert WorkflowResult to API response dict."""
    return {
        "workflow_id": workflow_result.workflow_id,
        "status": workflow_result.status.value,
        "initial_input": workflow_result.initial_input,
        "final_output": workflow_result.final_output,
        "step_results": [
            _step_result_to_dict(step_result)
            for step_result in workflow_result.step_results
        ],
        "intermediate_results": workflow_result.intermediate_results,
        "total_execution_time_ms": workflow_result.total_execution_time_ms,
        "total_cost": workflow_result.total_cost,
        "total_input_tokens": workflow_result.total_input_tokens,
        "total_output_tokens": workflow_result.total_output_tokens,
        "error": workflow_result.error
    }


@router.post("/execute", summary="Execute Workflow", operation_id="execute_workflow", response_model=Dict[str, Any])
async def execute_workflow(
    request: ExecuteWorkflowRequest,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Execute a multi-step workflow với sequential model chaining.
    
    Args:
        request: Workflow execution request với workflow definition và initial input
    
    Returns:
        Workflow execution result với step results và final output
    """
    try:
        orchestrator = get_multi_model_orchestrator()
        
        # Convert Pydantic workflow definition to dict
        workflow_dict = {
            "steps": [
                {
                    "id": step.id,
                    "model": step.model,
                    "input": step.input,
                    "prompt_template": step.prompt_template,
                    "output_key": step.output_key,
                    "error_handling": step.error_handling or {},
                    "use_model_router": step.use_model_router or False,  # Story 3.3 enhancement
                    "required_capabilities": step.required_capabilities or []  # Story 3.3 enhancement
                }
                for step in request.workflow.steps
            ]
        }
        
        # Execute workflow
        result = await orchestrator.execute_workflow(
            workflow=workflow_dict,
            initial_input=request.initial_input,
            user_id=user_id,
            workflow_id=request.workflow_id
        )
        
        return {
            "success": True,
            "data": _workflow_result_to_response(result),
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to execute workflow: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to execute workflow: {str(e)}")


@router.get("/metrics", summary="Get Workflow Metrics", operation_id="get_workflow_metrics")
async def get_workflow_metrics(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Get workflow execution metrics.
    
    Returns:
        Workflow metrics including total workflows, completion rate, average execution time, cost savings
    """
    try:
        orchestrator = get_multi_model_orchestrator()
        metrics = orchestrator.get_metrics()
        
        return {
            "success": True,
            "data": metrics,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get workflow metrics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve workflow metrics")


@router.post("/metrics/reset", summary="Reset Workflow Metrics", operation_id="reset_workflow_metrics")
async def reset_workflow_metrics(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Reset workflow execution metrics.
    
    Returns:
        Success confirmation
    """
    try:
        orchestrator = get_multi_model_orchestrator()
        orchestrator.reset_metrics()
        
        return {
            "success": True,
            "message": "Workflow metrics reset successfully",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to reset workflow metrics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to reset workflow metrics")


@router.get("/status", summary="Get Orchestrator Status", operation_id="get_orchestrator_status")
async def get_orchestrator_status(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Get orchestrator system status.
    
    Returns:
        Orchestrator status including enabled state và metrics
    """
    try:
        orchestrator = get_multi_model_orchestrator()
        metrics = orchestrator.get_metrics()
        active_workflows = orchestrator.get_active_workflows()
        
        return {
            "success": True,
            "data": {
                "enabled": orchestrator.enabled,
                "metrics": metrics,
                "active_workflows": active_workflows,
                "active_workflow_count": len(active_workflows)
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get orchestrator status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve orchestrator status")


@router.post("/cancel/{workflow_id}", summary="Cancel Workflow", operation_id="cancel_workflow")
async def cancel_workflow(
    workflow_id: str,
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Cancel a running workflow (Story 3.3 enhancement).
    
    Args:
        workflow_id: Workflow execution ID to cancel
    
    Returns:
        Cancellation result
    """
    try:
        orchestrator = get_multi_model_orchestrator()
        cancelled = await orchestrator.cancel_workflow(workflow_id)
        
        if cancelled:
            return {
                "success": True,
                "message": f"Workflow {workflow_id} cancelled successfully",
                "workflow_id": workflow_id,
                "timestamp": datetime.utcnow().isoformat()
            }
        else:
            raise HTTPException(
                status_code=404,
                detail=f"Workflow {workflow_id} not found or already completed"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to cancel workflow {workflow_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to cancel workflow: {str(e)}")


@router.get("/active", summary="Get Active Workflows", operation_id="get_active_workflows")
async def get_active_workflows(
    user_id: str = Depends(verify_and_get_user_id_from_jwt)
) -> Dict[str, Any]:
    """
    Get list of active workflow IDs (Story 3.3 enhancement).
    
    Returns:
        List of active workflow IDs
    """
    try:
        orchestrator = get_multi_model_orchestrator()
        active_workflows = orchestrator.get_active_workflows()
        
        return {
            "success": True,
            "data": {
                "active_workflows": active_workflows,
                "count": len(active_workflows)
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get active workflows: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve active workflows")

