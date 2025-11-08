"""
Pydantic models for Multi-Model Orchestrator API (Story 3.3).
"""

from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional


class WorkflowStepDefinition(BaseModel):
    """Workflow step definition."""
    id: str = Field(..., description="Unique step ID")
    model: str = Field(..., description="Model ID for this step (used if use_model_router is False)")
    input: str = Field(..., description="Input specification (e.g., 'user_query' or '{step_id.output_key}')")
    prompt_template: str = Field(..., description="Prompt template với placeholders")
    output_key: str = Field(..., description="Output key for storing step result")
    error_handling: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Error handling configuration (retry, fallback_model, timeout_seconds)"
    )
    use_model_router: Optional[bool] = Field(
        default=False,
        description="Use ModelRouter for dynamic model selection (Story 3.3 enhancement)"
    )
    required_capabilities: Optional[List[str]] = Field(
        default=None,
        description="Required capabilities for model selection (e.g., ['FUNCTION_CALLING'])"
    )


class WorkflowDefinition(BaseModel):
    """Workflow definition."""
    steps: List[WorkflowStepDefinition] = Field(..., description="List of workflow steps")


class ExecuteWorkflowRequest(BaseModel):
    """Request to execute a workflow."""
    workflow: WorkflowDefinition = Field(..., description="Workflow definition")
    initial_input: str = Field(..., description="Initial input for the workflow")
    workflow_id: Optional[str] = Field(default=None, description="Optional workflow execution ID")


class StepResultResponse(BaseModel):
    """Step execution result."""
    step_id: str = Field(..., description="Step ID")
    status: str = Field(..., description="Step execution status")
    model_id: str = Field(..., description="Model ID used for this step")
    input: str = Field(..., description="Resolved step input")
    output: Optional[str] = Field(default=None, description="Step output")
    error: Optional[str] = Field(default=None, description="Error message if failed")
    retry_count: int = Field(default=0, description="Number of retries")
    fallback_used: bool = Field(default=False, description="Whether fallback model was used")
    execution_time_ms: Optional[float] = Field(default=None, description="Step execution time in milliseconds")
    token_usage: Optional[Dict[str, int]] = Field(default=None, description="Token usage for this step")
    timestamp: str = Field(..., description="Step execution timestamp (ISO format)")


class ExecuteWorkflowResponse(BaseModel):
    """Workflow execution response."""
    workflow_id: str = Field(..., description="Workflow execution ID")
    status: str = Field(..., description="Workflow execution status")
    initial_input: str = Field(..., description="Initial workflow input")
    final_output: Optional[str] = Field(default=None, description="Final workflow output")
    step_results: List[StepResultResponse] = Field(default_factory=list, description="Step execution results")
    intermediate_results: Dict[str, Any] = Field(default_factory=dict, description="Intermediate results from steps")
    total_execution_time_ms: Optional[float] = Field(default=None, description="Total execution time in milliseconds")
    total_cost: float = Field(default=0.0, description="Total estimated cost")
    total_input_tokens: int = Field(default=0, description="Total input tokens")
    total_output_tokens: int = Field(default=0, description="Total output tokens")
    error: Optional[str] = Field(default=None, description="Error message if workflow failed")

