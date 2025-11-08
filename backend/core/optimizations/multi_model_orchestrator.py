"""
Sequential Model Execution (Story 3.3).

This module implements sequential model execution for multi-step workflows, enabling
complex workflows where different models handle different steps và maximizing cost efficiency.

Features:
- Sequential chaining: Execute models in sequence (step 1 → step 2 → step 3)
- Workflow definition: Step-by-step model execution với Python dict format
- Intermediate results: Pass output from step N to input of step N+1
- Error handling: Handle failures at each step với retry/fallback
- Cost tracking: Measure cost savings vs single-model approach (target: 40-50%)
- Integration với ModelRouter (Story 3.2) for model selection
- Logging và monitoring integration

Example Workflow:
```python
workflow = {
    "steps": [
        {
            "id": "step_1",
            "model": "openai-compatible/gpt-4o-mini",
            "input": "user_query",
            "prompt_template": "Analyze: {input}",
            "output_key": "analysis_result",
            "error_handling": {"retry": 2, "fallback_model": "openai-compatible/qwen3-30b"}
        },
        {
            "id": "step_2",
            "model": "openai-compatible/gpt-4o",
            "input": "{step_1.output_key}",
            "prompt_template": "Create plan based on: {input}",
            "output_key": "plan_result"
        }
    ]
}
```
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, Any, Optional, List, Union, Tuple
import asyncio

from core.utils.logger import logger
from core.utils.config import OptimizationConfig, OptimizationMode, config
from core.optimizations.model_router import ModelRouter, get_model_router, RoutingResult
from core.optimizations.task_classifier import ComplexityLevel
from core.services.llm import make_llm_api_call
import re


class WorkflowExecutionStatus(str, Enum):
    """Workflow execution status enumeration."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"  # Some steps completed, some failed


class StepExecutionStatus(str, Enum):
    """Step execution status enumeration."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"
    FALLBACK = "fallback"


@dataclass
class StepResult:
    """Represents the result of a workflow step execution."""
    step_id: str
    status: StepExecutionStatus
    model_id: str
    input: str
    output: Optional[str] = None
    error: Optional[str] = None
    retry_count: int = 0
    fallback_used: bool = False
    execution_time_ms: Optional[float] = None
    token_usage: Optional[Dict[str, int]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class WorkflowResult:
    """Represents the result of a workflow execution."""
    workflow_id: str
    status: WorkflowExecutionStatus
    initial_input: str
    final_output: Optional[str] = None
    step_results: List[StepResult] = field(default_factory=list)
    intermediate_results: Dict[str, Any] = field(default_factory=dict)
    total_execution_time_ms: Optional[float] = None
    total_cost: float = 0.0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class WorkflowMetrics:
    """Metrics for tracking workflow execution performance."""
    total_workflows: int = 0
    completed_workflows: int = 0
    failed_workflows: int = 0
    workflows_by_status: Dict[WorkflowExecutionStatus, int] = field(default_factory=lambda: {
        WorkflowExecutionStatus.PENDING: 0,
        WorkflowExecutionStatus.RUNNING: 0,
        WorkflowExecutionStatus.COMPLETED: 0,
        WorkflowExecutionStatus.FAILED: 0,
        WorkflowExecutionStatus.PARTIAL: 0,
    })
    average_execution_time_ms: float = 0.0
    average_cost: float = 0.0
    total_cost_savings: float = 0.0
    cost_savings_percentage: float = 0.0


# Workflow definition format (Python dict)
# Primary format for programmatic workflows
WorkflowDefinition = Dict[str, Any]
# Optional: JSON/YAML for configuration-based workflows (can be loaded và converted to dict)

# Step structure:
# {
#     "id": str,  # Unique step identifier
#     "model": str,  # Model ID (e.g., "openai-compatible/gpt-4o-mini")
#     "input": str,  # Input source: "user_query" or "{step_id.output_key}"
#     "prompt_template": str,  # Prompt template với placeholders
#     "output_key": str,  # Key to store output in intermediate_results
#     "error_handling": Optional[Dict[str, Any]],  # Error handling config
#     #   {"retry": int, "fallback_model": str}
# }


class MultiModelOrchestrator:
    """
    Multi-model orchestrator for sequential workflow execution.
    
    Enables multi-step workflows where different models handle different steps,
    maximizing cost efficiency while maintaining acceptable quality (80-85%).
    
    Features:
    - Sequential chaining: Execute models in sequence
    - Workflow definition: Step-by-step model execution
    - Intermediate results: Pass results between steps
    - Error handling: Handle failures với retry/fallback
    - Cost tracking: Measure cost savings vs single-model approach
    - Integration với ModelRouter for dynamic model selection (optional)
    - Workflow cancellation support
    - Input size limits for security
    - Robust prompt templating
    
    Example:
    ```python
    orchestrator = MultiModelOrchestrator(model_router=model_router)
    workflow = {
        "steps": [
            {
                "id": "step_1",
                "model": "openai-compatible/gpt-4o-mini",
                "input": "user_query",
                "prompt_template": "Analyze: {input}",
                "output_key": "analysis_result"
            },
            {
                "id": "step_2",
                "model": "openai-compatible/gpt-4o",
                "input": "{step_1.analysis_result}",
                "prompt_template": "Create plan: {input}",
                "output_key": "plan_result"
            }
        ]
    }
    result = await orchestrator.execute_workflow(workflow, initial_input="User question")
    ```
    """
    
    def __init__(
        self,
        model_router: Optional[ModelRouter] = None,
        enabled: bool = True
    ):
        """
        Initialize MultiModelOrchestrator.
        
        Args:
            model_router: ModelRouter instance (uses global singleton if None)
            enabled: Whether orchestration is enabled
        """
        self.model_router = model_router or get_model_router()
        self.enabled = enabled
        self.metrics = WorkflowMetrics()
        # Workflow cancellation support (Story 3.3 enhancement)
        self._active_workflows: Dict[str, asyncio.Task] = {}  # workflow_id -> task
        self._cancelled_workflows: set = set()  # Set of cancelled workflow IDs
        logger.info(
            f"MultiModelOrchestrator initialized (enabled={enabled}, "
            f"model_router={'provided' if model_router else 'singleton'})"
        )
    
    def _extract_response_data(
        self,
        response: Union[Dict[str, Any], Any]
    ) -> Tuple[str, Optional[Dict[str, int]]]:
        """
        Extract content và token usage from LLM response.
        
        Args:
            response: LLM response (ModelResponse object or dict)
        
        Returns:
            Tuple of (content: str, token_usage: Optional[Dict[str, int]])
        """
        content = ""
        token_usage = None
        
        try:
            # Handle ModelResponse object (from litellm)
            if hasattr(response, "choices"):
                # Try to use model_dump or dict method if available (Pydantic)
                if hasattr(response, "model_dump"):
                    response_dict = response.model_dump()
                    # Extract from dict
                    if "choices" in response_dict and isinstance(response_dict["choices"], list) and len(response_dict["choices"]) > 0:
                        choice = response_dict["choices"][0]
                        if isinstance(choice, dict) and "message" in choice:
                            message = choice["message"]
                            if isinstance(message, dict):
                                content = message.get("content", "") or ""
                    
                    # Extract usage from dict
                    if "usage" in response_dict and isinstance(response_dict["usage"], dict):
                        usage = response_dict["usage"]
                        token_usage = {
                            "input_tokens": usage.get("prompt_tokens", 0) or usage.get("input_tokens", 0) or 0,
                            "output_tokens": usage.get("completion_tokens", 0) or usage.get("output_tokens", 0) or 0,
                            "total_tokens": usage.get("total_tokens", 0) or 0
                        }
                elif hasattr(response, "dict"):
                    response_dict = response.dict()
                    # Extract from dict (same logic as above)
                    if "choices" in response_dict and isinstance(response_dict["choices"], list) and len(response_dict["choices"]) > 0:
                        choice = response_dict["choices"][0]
                        if isinstance(choice, dict) and "message" in choice:
                            message = choice["message"]
                            if isinstance(message, dict):
                                content = message.get("content", "") or ""
                    
                    if "usage" in response_dict and isinstance(response_dict["usage"], dict):
                        usage = response_dict["usage"]
                        token_usage = {
                            "input_tokens": usage.get("prompt_tokens", 0) or usage.get("input_tokens", 0) or 0,
                            "output_tokens": usage.get("completion_tokens", 0) or usage.get("output_tokens", 0) or 0,
                            "total_tokens": usage.get("total_tokens", 0) or 0
                        }
                else:
                    # Manual extraction from ModelResponse object
                    if response.choices and len(response.choices) > 0:
                        choice = response.choices[0]
                        if hasattr(choice, "message") and hasattr(choice.message, "content"):
                            content = choice.message.content or ""
                    
                    # Extract usage
                    if hasattr(response, "usage") and response.usage:
                        usage = response.usage
                        token_usage = {
                            "input_tokens": getattr(usage, "prompt_tokens", 0) or getattr(usage, "input_tokens", 0) or 0,
                            "output_tokens": getattr(usage, "completion_tokens", 0) or getattr(usage, "output_tokens", 0) or 0,
                            "total_tokens": getattr(usage, "total_tokens", 0) or 0
                        }
                
                return content, token_usage
            
            # Handle dict response
            if isinstance(response, dict):
                # Extract content from choices
                if "choices" in response and isinstance(response["choices"], list) and len(response["choices"]) > 0:
                    choice = response["choices"][0]
                    if isinstance(choice, dict):
                        message = choice.get("message", {})
                        if isinstance(message, dict):
                            content = message.get("content", "") or ""
                        elif isinstance(message, str):
                            content = message
                elif "content" in response:
                    content = response["content"] or ""
                
                # Extract usage
                if "usage" in response and isinstance(response["usage"], dict):
                    usage = response["usage"]
                    token_usage = {
                        "input_tokens": usage.get("prompt_tokens", 0) or usage.get("input_tokens", 0) or 0,
                        "output_tokens": usage.get("completion_tokens", 0) or usage.get("output_tokens", 0) or 0,
                        "total_tokens": usage.get("total_tokens", 0) or 0
                    }
            
            # Fallback: convert to string
            if not content:
                content = str(response)
            
        except Exception as e:
            logger.warning(f"Error extracting response data: {e}, using fallback")
            content = str(response) if not content else content
        
        return content, token_usage
    
    def _validate_workflow(self, workflow: WorkflowDefinition) -> bool:
        """
        Validate workflow definition format.
        
        Args:
            workflow: Workflow definition dict
        
        Returns:
            True if valid, False otherwise
        """
        if not isinstance(workflow, dict):
            logger.error("Workflow must be a dictionary")
            return False
        
        if "steps" not in workflow:
            logger.error("Workflow must have 'steps' key")
            return False
        
        steps = workflow["steps"]
        if not isinstance(steps, list) or len(steps) == 0:
            logger.error("Workflow must have at least one step")
            return False
        
        # Validate workflow size limit (security - Story 3.3 enhancement)
        max_steps = getattr(config, "MAX_WORKFLOW_STEPS", 20)
        if len(steps) > max_steps:
            logger.error(
                f"Workflow has {len(steps)} steps, exceeds maximum of {max_steps} steps"
            )
            return False
        
        # Validate each step
        step_ids = set()
        for i, step in enumerate(steps):
            if not isinstance(step, dict):
                logger.error(f"Step {i} must be a dictionary")
                return False
            
            required_fields = ["id", "model", "input", "prompt_template", "output_key"]
            for field in required_fields:
                if field not in step:
                    logger.error(f"Step {i} missing required field: {field}")
                    return False
            
            step_id = step["id"]
            if step_id in step_ids:
                logger.error(f"Duplicate step ID: {step_id}")
                return False
            step_ids.add(step_id)
            
            # Validate input references (check that referenced steps exist)
            input_spec = step["input"]
            if input_spec.startswith("{") and input_spec.endswith("}"):
                reference = input_spec[1:-1]  # Remove braces
                parts = reference.split(".")
                if len(parts) == 2:
                    referenced_step_id, _ = parts
                    # Check if referenced step exists in previous steps
                    if referenced_step_id not in step_ids and referenced_step_id != "user_query":
                        logger.error(
                            f"Step {i} ({step_id}) references step '{referenced_step_id}' "
                            f"which doesn't exist or hasn't been defined yet"
                        )
                        return False
            
            # Validate step input length (security - Story 3.3 enhancement)
            max_input_length = getattr(config, "MAX_STEP_INPUT_LENGTH", 100_000)
            prompt_template = step.get("prompt_template", "")
            if len(prompt_template) > max_input_length:
                logger.error(
                    f"Step {i} ({step_id}) prompt template length {len(prompt_template)} "
                    f"exceeds maximum of {max_input_length} characters"
                )
                return False
        
        logger.debug(f"Workflow validation passed: {len(steps)} steps")
        return True
    
    def _resolve_step_input(
        self,
        step: Dict[str, Any],
        initial_input: str,
        intermediate_results: Dict[str, Any]
    ) -> str:
        """
        Resolve step input from initial input or intermediate results.
        
        Args:
            step: Step definition
            initial_input: Initial workflow input
            intermediate_results: Results from previous steps
        
        Returns:
            Resolved input string
        """
        input_spec = step["input"]
        
        # If input is "user_query", use initial_input
        if input_spec == "user_query":
            resolved_input = initial_input
        # If input references a step output (e.g., "{step_1.output_key}")
        elif input_spec.startswith("{") and input_spec.endswith("}"):
            # Extract step_id and output_key from "{step_id.output_key}"
            reference = input_spec[1:-1]  # Remove braces
            parts = reference.split(".")
            
            if len(parts) == 2:
                step_id, output_key = parts
                # Look up in intermediate_results
                if step_id in intermediate_results:
                    step_result = intermediate_results[step_id]
                    if isinstance(step_result, dict) and output_key in step_result:
                        resolved_input = str(step_result[output_key])
                    elif isinstance(step_result, str):
                        resolved_input = step_result
                    else:
                        logger.warning(
                            f"Could not resolve input reference {input_spec}: "
                            f"step {step_id} result is not accessible"
                        )
                        resolved_input = initial_input  # Fallback to initial input
                else:
                    logger.warning(
                        f"Could not resolve input reference {input_spec}: "
                        f"step {step_id} not found in intermediate results"
                    )
                    resolved_input = initial_input  # Fallback to initial input
            else:
                logger.warning(
                    f"Invalid input reference format: {input_spec}. "
                    f"Expected format: {{step_id.output_key}}"
                )
                resolved_input = initial_input  # Fallback to initial input
        else:
            # If input is a direct string, use it as-is
            resolved_input = input_spec
        
        # Validate input length (security - Story 3.3 enhancement)
        max_input_length = getattr(config, "MAX_STEP_INPUT_LENGTH", 100_000)
        if len(resolved_input) > max_input_length:
            logger.warning(
                f"Resolved input length {len(resolved_input)} exceeds maximum of {max_input_length} characters. "
                f"Truncating to {max_input_length} characters"
            )
            resolved_input = resolved_input[:max_input_length]
        
        return resolved_input
    
    def _format_prompt(
        self,
        prompt_template: str,
        step_input: str,
        intermediate_results: Dict[str, Any]
    ) -> str:
        """
        Format prompt template với step input và intermediate results (Story 3.3 enhancement).
        
        Uses robust templating với proper escaping to handle edge cases.
        
        Args:
            prompt_template: Prompt template với placeholders
            step_input: Resolved step input
            intermediate_results: Results from previous steps
        
        Returns:
            Formatted prompt string
        """
        # Build replacement dict (Story 3.3 enhancement)
        replacements = {
            "input": step_input
        }
        
        # Add intermediate results to replacements
        # Format: {step_id.output_key} or {step_id}
        for step_id, step_result in intermediate_results.items():
            if isinstance(step_result, dict):
                for key, value in step_result.items():
                    replacements[f"{step_id}.{key}"] = str(value)
            elif isinstance(step_result, str):
                replacements[step_id] = step_result
        
        # Use regex-based replacement for robust templating (Story 3.3 enhancement)
        # This approach handles literal braces correctly by temporarily escaping them
        
        # Step 1: Temporarily escape literal braces ({{ and }}) to protect them
        # Use a unique placeholder that won't appear in user input
        LITERAL_OPEN = "\0LITERAL_OPEN\0"
        LITERAL_CLOSE = "\0LITERAL_CLOSE\0"
        
        # Replace literal double braces with placeholders
        template = prompt_template.replace("{{", LITERAL_OPEN).replace("}}", LITERAL_CLOSE)
        
        # Step 2: Replace placeholders with actual values using regex
        # Pattern: {placeholder} where placeholder is alphanumeric, underscore, or dot
        def replace_placeholder(match):
            placeholder = match.group(1)
            if placeholder in replacements:
                value = str(replacements[placeholder])
                # Escape any braces in the replacement value to prevent injection
                # But don't double-escape already escaped braces
                value = value.replace("{", "{{").replace("}", "}}")
                return value
            else:
                # Placeholder not found, leave as-is (or log warning)
                logger.warning(f"Placeholder {{{placeholder}}} not found in replacements, leaving as-is")
                return match.group(0)  # Return original {placeholder}
        
        # Replace all {placeholder} patterns
        formatted = re.sub(r'\{([a-zA-Z0-9_.]+)\}', replace_placeholder, template)
        
        # Step 3: Restore literal braces
        formatted = formatted.replace(LITERAL_OPEN, "{").replace(LITERAL_CLOSE, "}")
        
        # Step 4: Handle any remaining double-escaped braces in replacement values
        # These were escaped in step 2, so convert {{ back to { and }} back to }
        # But be careful: we only want to unescape braces that came from replacement values,
        # not literal braces that were in the original template
        
        # Actually, the logic above already handles this correctly:
        # - Literal braces in template: {{ -> LITERAL_OPEN -> { (preserved)
        # - Braces in replacement values: { -> {{ -> { (double-escaped then unescaped)
        # But we need to unescape the double-escaped braces from replacement values
        
        # Simple approach: after restoring literal braces, unescape any double braces
        # that are NOT part of the original template structure
        # Since we already protected literal braces, any remaining {{ or }} came from replacement values
        formatted = formatted.replace("{{", "{").replace("}}", "}")
        
        return formatted
    
    def _calculate_step_cost(
        self,
        model_id: str,
        token_usage: Optional[Dict[str, int]]
    ) -> float:
        """
        Calculate cost for a single step based on token usage và model pricing.
        
        Args:
            model_id: Model ID used for the step
            token_usage: Token usage dict với input_tokens và output_tokens
        
        Returns:
            Cost in USD (0.0 if pricing unavailable)
        """
        if not token_usage:
            return 0.0
        
        # Get model from registry
        model = self.model_router.model_registry.get(model_id)
        if not model or not model.pricing:
            logger.warning(f"No pricing info for model {model_id}, cannot calculate cost.")
            return 0.0
        
        # Calculate cost: (tokens / 1_000_000) * cost_per_million
        input_tokens = token_usage.get("input_tokens", 0)
        output_tokens = token_usage.get("output_tokens", 0)
        
        input_cost = (input_tokens / 1_000_000) * model.pricing.input_cost_per_million_tokens
        output_cost = (output_tokens / 1_000_000) * model.pricing.output_cost_per_million_tokens
        
        total_cost = input_cost + output_cost
        
        logger.debug(
            f"💰 Step cost calculation - model={model_id}, "
            f"input_tokens={input_tokens}, output_tokens={output_tokens}, "
            f"cost=${total_cost:.6f}"
        )
        
        return total_cost
    
    def _calculate_baseline_cost(
        self,
        baseline_model_id: str,
        token_usage: Optional[Dict[str, int]]
    ) -> float:
        """
        Calculate baseline cost (using premium model) for cost savings comparison.
        
        Args:
            baseline_model_id: Baseline model ID (e.g., gpt-4o)
            token_usage: Token usage dict với input_tokens và output_tokens
        
        Returns:
            Baseline cost in USD (0.0 if pricing unavailable)
        """
        if not token_usage:
            return 0.0
        
        # Get baseline model from registry
        baseline_model = self.model_router.model_registry.get(baseline_model_id)
        if not baseline_model or not baseline_model.pricing:
            logger.warning(f"No pricing info for baseline model {baseline_model_id}, cannot calculate baseline cost.")
            return 0.0
        
        input_tokens = token_usage.get("input_tokens", 0)
        output_tokens = token_usage.get("output_tokens", 0)
        
        input_cost = (input_tokens / 1_000_000) * baseline_model.pricing.input_cost_per_million_tokens
        output_cost = (output_tokens / 1_000_000) * baseline_model.pricing.output_cost_per_million_tokens
        
        return input_cost + output_cost
    
    async def _execute_step(
        self,
        step: Dict[str, Any],
        initial_input: str,
        intermediate_results: Dict[str, Any],
        workflow_id: str,
        user_id: Optional[str] = None
    ) -> StepResult:
        """
        Execute a single workflow step.
        
        Args:
            step: Step definition
            initial_input: Initial workflow input
            intermediate_results: Results from previous steps
            workflow_id: Workflow execution ID
            user_id: Optional user ID for context
        
        Returns:
            StepResult với execution result
        """
        step_id = step["id"]
        
        # Check if workflow is cancelled (Story 3.3 enhancement)
        if workflow_id in self._cancelled_workflows:
            logger.warning(f"Workflow {workflow_id} is cancelled, stopping step {step_id}")
            return StepResult(
                step_id=step_id,
                status=StepExecutionStatus.FAILED,
                model_id=step.get("model", "unknown"),
                input="",
                error="Workflow cancelled",
                timestamp=datetime.now(timezone.utc)
            )
        
        # Check if ModelRouter should be used for dynamic model selection (Story 3.3 enhancement)
        use_model_router = step.get("use_model_router", False)
        model_id = step["model"]
        
        if use_model_router and self.model_router and self.model_router.enabled:
            try:
                # Resolve step input for routing
                step_input = self._resolve_step_input(step, initial_input, intermediate_results)
                prompt_template = step["prompt_template"]
                prompt = self._format_prompt(prompt_template, step_input, intermediate_results)
                
                # Use ModelRouter to select model based on complexity
                required_capabilities = step.get("required_capabilities", [])
                routing_result = await self.model_router.route(
                    task=prompt,
                    user_id=user_id,
                    required_capabilities=required_capabilities if required_capabilities else None
                )
                
                # Use routed model instead of step-defined model
                model_id = routing_result.model_id
                logger.info(
                    f"🎯 ModelRouter selected model {model_id} for step {step_id} "
                    f"(complexity: {routing_result.complexity.value}, "
                    f"confidence: {routing_result.confidence:.2f})"
                )
            except Exception as e:
                logger.warning(
                    f"ModelRouter routing failed for step {step_id}: {e}. "
                    f"Falling back to step-defined model: {model_id}"
                )
                # Continue với step-defined model
        
        error_handling = step.get("error_handling", {})
        max_retries = error_handling.get("retry", 0)
        fallback_model = error_handling.get("fallback_model")
        
        logger.info(f"🔄 Executing step {step_id} với model {model_id}")
        
        start_time = datetime.now(timezone.utc).timestamp()
        step_result = StepResult(
            step_id=step_id,
            status=StepExecutionStatus.RUNNING,
            model_id=model_id,
            input="",  # Will be set after resolving
            metadata={"workflow_id": workflow_id}
        )
        
        try:
            # Resolve step input
            step_input = self._resolve_step_input(step, initial_input, intermediate_results)
            step_result.input = step_input
            
            # Format prompt
            prompt_template = step["prompt_template"]
            prompt = self._format_prompt(prompt_template, step_input, intermediate_results)
            
            # Prepare messages for LLM call
            messages = [
                {"role": "user", "content": prompt}
            ]
            
            # Get timeout configuration (default: 5 minutes per step)
            step_timeout = error_handling.get("timeout_seconds", 300)
            
            # Execute step với retry logic
            retry_count = 0
            last_error = None
            
            while retry_count <= max_retries:
                try:
                    # Make LLM API call với timeout
                    llm_response = await asyncio.wait_for(
                        make_llm_api_call(
                            messages=messages,
                            model_name=model_id,
                            stream=False,  # Non-streaming for workflow steps
                            thread_id=None  # Workflow steps don't use thread_id
                        ),
                        timeout=step_timeout
                    )
                    
                    # Extract response content và token usage
                    content, token_usage = self._extract_response_data(llm_response)
                    
                    # Step completed successfully
                    end_time = datetime.now(timezone.utc).timestamp()
                    execution_time_ms = (end_time - start_time) * 1000
                    
                    step_result.status = StepExecutionStatus.COMPLETED
                    step_result.output = content
                    step_result.execution_time_ms = execution_time_ms
                    step_result.token_usage = token_usage
                    step_result.retry_count = retry_count
                    
                    # Calculate step cost
                    step_cost = self._calculate_step_cost(model_id, token_usage)
                    step_result.metadata["cost"] = step_cost
                    
                    logger.info(
                        f"✅ Step {step_id} completed successfully "
                        f"(time={execution_time_ms:.0f}ms, retries={retry_count}, cost=${step_cost:.6f})"
                    )
                    
                    return step_result
                    
                except asyncio.TimeoutError:
                    last_error = f"Step {step_id} timed out after {step_timeout} seconds"
                    logger.error(f"⏱️ {last_error}")
                    retry_count += 1
                    if retry_count <= max_retries:
                        step_result.status = StepExecutionStatus.RETRYING
                        step_result.retry_count = retry_count
                        await asyncio.sleep(1)
                    else:
                        if fallback_model:
                            # Try fallback model after timeout
                            logger.warning(f"⚠️ Step {step_id} timed out. Trying fallback model: {fallback_model}")
                            step_result.status = StepExecutionStatus.FALLBACK
                            step_result.fallback_used = True
                            step_result.model_id = fallback_model
                            try:
                                llm_response = await asyncio.wait_for(
                                    make_llm_api_call(
                                        messages=messages,
                                        model_name=fallback_model,
                                        stream=False,
                                        thread_id=None
                                    ),
                                    timeout=step_timeout
                                )
                                content, token_usage = self._extract_response_data(llm_response)
                                end_time = datetime.now(timezone.utc).timestamp()
                                execution_time_ms = (end_time - start_time) * 1000
                                step_result.status = StepExecutionStatus.COMPLETED
                                step_result.output = content
                                step_result.execution_time_ms = execution_time_ms
                                step_result.token_usage = token_usage
                                step_cost = self._calculate_step_cost(fallback_model, token_usage)
                                step_result.metadata["cost"] = step_cost
                                logger.info(
                                    f"✅ Step {step_id} completed với fallback model {fallback_model} "
                                    f"(time={execution_time_ms:.0f}ms, cost=${step_cost:.6f})"
                                )
                                return step_result
                            except Exception as fallback_error:
                                last_error = f"Timeout: {last_error}, Fallback: {fallback_error}"
                                break
                        else:
                            break
                    
                except Exception as e:
                    last_error = str(e)
                    retry_count += 1
                    
                    if retry_count <= max_retries:
                        logger.warning(
                            f"⚠️ Step {step_id} failed (attempt {retry_count}/{max_retries + 1}): {last_error}. Retrying..."
                        )
                        step_result.status = StepExecutionStatus.RETRYING
                        step_result.retry_count = retry_count
                        await asyncio.sleep(1)  # Brief delay before retry
                    else:
                        # All retries exhausted, try fallback model if available
                        if fallback_model:
                            logger.warning(
                                f"⚠️ Step {step_id} failed after {max_retries + 1} attempts. "
                                f"Trying fallback model: {fallback_model}"
                            )
                            step_result.status = StepExecutionStatus.FALLBACK
                            step_result.fallback_used = True
                            step_result.model_id = fallback_model
                            
                            try:
                                # Retry với fallback model (with timeout)
                                llm_response = await asyncio.wait_for(
                                    make_llm_api_call(
                                        messages=messages,
                                        model_name=fallback_model,
                                        stream=False,
                                        thread_id=None
                                    ),
                                    timeout=step_timeout
                                )
                                
                                # Extract response content và token usage
                                content, token_usage = self._extract_response_data(llm_response)
                                
                                # Fallback succeeded
                                end_time = datetime.now(timezone.utc).timestamp()
                                execution_time_ms = (end_time - start_time) * 1000
                                
                                step_result.status = StepExecutionStatus.COMPLETED
                                step_result.output = content
                                step_result.execution_time_ms = execution_time_ms
                                step_result.token_usage = token_usage
                                
                                # Calculate step cost
                                step_cost = self._calculate_step_cost(fallback_model, token_usage)
                                step_result.metadata["cost"] = step_cost
                                
                                logger.info(
                                    f"✅ Step {step_id} completed với fallback model {fallback_model} "
                                    f"(time={execution_time_ms:.0f}ms, cost=${step_cost:.6f})"
                                )
                                
                                return step_result
                                
                            except Exception as fallback_error:
                                logger.error(
                                    f"❌ Step {step_id} failed với fallback model {fallback_model}: {fallback_error}"
                                )
                                last_error = f"Original: {last_error}, Fallback: {fallback_error}"
                                break
                        else:
                            # No fallback model, fail
                            break
            
            # Step failed
            end_time = datetime.now(timezone.utc).timestamp()
            execution_time_ms = (end_time - start_time) * 1000
            
            step_result.status = StepExecutionStatus.FAILED
            step_result.error = last_error
            step_result.execution_time_ms = execution_time_ms
            step_result.retry_count = retry_count
            
            logger.error(
                f"❌ Step {step_id} failed after {retry_count} attempts: {last_error}"
            )
            
            return step_result
            
        except Exception as e:
            # Unexpected error
            end_time = datetime.now(timezone.utc).timestamp()
            execution_time_ms = (end_time - start_time) * 1000
            
            step_result.status = StepExecutionStatus.FAILED
            step_result.error = str(e)
            step_result.execution_time_ms = execution_time_ms
            
            logger.error(f"❌ Step {step_id} failed với unexpected error: {e}", exc_info=True)
            return step_result
    
    async def execute_workflow(
        self,
        workflow: WorkflowDefinition,
        initial_input: str,
        user_id: Optional[str] = None,
        workflow_id: Optional[str] = None
    ) -> WorkflowResult:
        """
        Execute a workflow với sequential model chaining.
        
        Args:
            workflow: Workflow definition dict
            initial_input: Initial input for the workflow
            user_id: Optional user ID for context
            workflow_id: Optional workflow execution ID (auto-generated if None)
        
        Returns:
            WorkflowResult với execution results
        """
        if not self.enabled:
            logger.warning("MultiModelOrchestrator is disabled")
            return WorkflowResult(
                workflow_id=workflow_id or "disabled",
                status=WorkflowExecutionStatus.FAILED,
                initial_input=initial_input,
                error="Orchestrator is disabled"
            )
        
        # Validate workflow
        if not self._validate_workflow(workflow):
            return WorkflowResult(
                workflow_id=workflow_id or "invalid",
                status=WorkflowExecutionStatus.FAILED,
                initial_input=initial_input,
                error="Invalid workflow definition"
            )
        
        # Generate workflow ID if not provided
        if workflow_id is None:
            import uuid
            workflow_id = str(uuid.uuid4())
        
        logger.info(f"🚀 Starting workflow execution: {workflow_id} ({len(workflow['steps'])} steps)")
        
        # Update metrics
        self.metrics.total_workflows += 1
        self.metrics.workflows_by_status[WorkflowExecutionStatus.RUNNING] += 1
        
        start_time = datetime.now(timezone.utc).timestamp()
        
        # Check execution time limit (security - Story 3.3 enhancement)
        max_execution_time = getattr(config, "MAX_WORKFLOW_EXECUTION_TIME_SECONDS", 3600)
        
        workflow_result = WorkflowResult(
            workflow_id=workflow_id,
            status=WorkflowExecutionStatus.RUNNING,
            initial_input=initial_input,
            metadata={"user_id": user_id, "max_execution_time_seconds": max_execution_time}
        )
        
        # Execute steps sequentially
        intermediate_results = {}
        steps = workflow["steps"]
        
        for i, step in enumerate(steps):
            step_id = step["id"]
            
            # Check if workflow is cancelled (Story 3.3 enhancement)
            if workflow_id in self._cancelled_workflows:
                logger.warning(f"Workflow {workflow_id} is cancelled, stopping at step {step_id}")
                workflow_result.status = WorkflowExecutionStatus.FAILED
                workflow_result.error = "Workflow cancelled"
                break
            
            # Check execution time limit (security - Story 3.3 enhancement)
            current_time = datetime.now(timezone.utc).timestamp()
            elapsed_time = current_time - start_time
            if elapsed_time > max_execution_time:
                logger.error(
                    f"⏱️ Workflow {workflow_id} exceeded maximum execution time of {max_execution_time} seconds "
                    f"at step {step_id} (elapsed: {elapsed_time:.1f}s)"
                )
                workflow_result.status = WorkflowExecutionStatus.FAILED
                workflow_result.error = f"Workflow exceeded maximum execution time of {max_execution_time} seconds"
                break
            
            try:
                # Execute step
                step_result = await self._execute_step(
                    step=step,
                    initial_input=initial_input,
                    intermediate_results=intermediate_results,
                    workflow_id=workflow_id,
                    user_id=user_id
                )
                
                workflow_result.step_results.append(step_result)
                
                # Update intermediate results if step completed
                if step_result.status == StepExecutionStatus.COMPLETED:
                    output_key = step["output_key"]
                    step_output = step_result.output or ""
                    
                    # Validate intermediate result size (security - Story 3.3 enhancement)
                    max_result_size = getattr(config, "MAX_INTERMEDIATE_RESULT_SIZE", 1_000_000)
                    if len(step_output) > max_result_size:
                        logger.warning(
                            f"Step {step_id} output size {len(step_output)} exceeds maximum of {max_result_size} characters. "
                            f"Truncating to {max_result_size} characters"
                        )
                        step_output = step_output[:max_result_size]
                    
                    intermediate_results[step_id] = {
                        output_key: step_output
                    }
                    
                    # Also store full step result for reference
                    intermediate_results[f"{step_id}_result"] = {
                        "output": step_output,
                        "status": step_result.status.value,
                        "model_id": step_result.model_id,
                        "execution_time_ms": step_result.execution_time_ms,
                        "token_usage": step_result.token_usage
                    }
                    
                    # Track token usage và cost
                    if step_result.token_usage:
                        workflow_result.total_input_tokens += step_result.token_usage.get("input_tokens", 0)
                        workflow_result.total_output_tokens += step_result.token_usage.get("output_tokens", 0)
                    
                    # Calculate và accumulate step cost
                    step_cost = step_result.metadata.get("cost", 0.0)
                    if step_cost == 0.0 and step_result.token_usage:
                        # Calculate cost if not already calculated
                        step_cost = self._calculate_step_cost(step_result.model_id, step_result.token_usage)
                        step_result.metadata["cost"] = step_cost
                    
                    workflow_result.total_cost += step_cost
                    
                    logger.info(
                        f"✅ Step {step_id} completed, stored output key: {output_key}, "
                        f"cost=${step_cost:.6f}, total_cost=${workflow_result.total_cost:.6f}"
                    )
                else:
                    # Step failed, stop workflow execution
                    logger.error(f"❌ Step {step_id} failed, stopping workflow")
                    workflow_result.status = WorkflowExecutionStatus.PARTIAL
                    workflow_result.error = f"Step {step_id} failed: {step_result.error}"
                    break
                    
            except asyncio.CancelledError:
                # Workflow was cancelled during step execution
                logger.info(f"🚫 Workflow {workflow_id} was cancelled during step {step_id}")
                workflow_result.status = WorkflowExecutionStatus.FAILED
                workflow_result.error = "Workflow cancelled"
                break
            except Exception as e:
                logger.error(f"❌ Unexpected error executing step {step_id}: {e}", exc_info=True)
                step_result = StepResult(
                    step_id=step_id,
                    status=StepExecutionStatus.FAILED,
                    model_id=step.get("model", "unknown"),
                    input="",
                    error=str(e),
                    timestamp=datetime.now(timezone.utc)
                )
                workflow_result.step_results.append(step_result)
                workflow_result.status = WorkflowExecutionStatus.FAILED
                workflow_result.error = f"Unexpected error in step {step_id}: {e}"
                break
        
        # Finalize workflow result
        end_time = datetime.now(timezone.utc).timestamp()
        workflow_result.total_execution_time_ms = (end_time - start_time) * 1000
        workflow_result.intermediate_results = intermediate_results
        
        # Determine final status
        if workflow_result.status == WorkflowExecutionStatus.RUNNING:
            # All steps completed successfully
            if workflow_result.step_results:
                last_step_result = workflow_result.step_results[-1]
                if last_step_result.status == StepExecutionStatus.COMPLETED:
                    workflow_result.status = WorkflowExecutionStatus.COMPLETED
                    workflow_result.final_output = last_step_result.output
                else:
                    workflow_result.status = WorkflowExecutionStatus.PARTIAL
            else:
                workflow_result.status = WorkflowExecutionStatus.FAILED
                workflow_result.error = "No steps executed"
        
        # Update metrics
        self.metrics.workflows_by_status[WorkflowExecutionStatus.RUNNING] -= 1
        self.metrics.workflows_by_status[workflow_result.status] += 1
        
        if workflow_result.status == WorkflowExecutionStatus.COMPLETED:
            self.metrics.completed_workflows += 1
        elif workflow_result.status == WorkflowExecutionStatus.FAILED:
            self.metrics.failed_workflows += 1
        
        # Update average execution time (running average)
        if workflow_result.status == WorkflowExecutionStatus.COMPLETED:
            execution_time = workflow_result.total_execution_time_ms or 0.0
            n = self.metrics.completed_workflows
            if n == 1:
                self.metrics.average_execution_time_ms = execution_time
            else:
                # Running average: new_avg = (old_avg * (n-1) + new_value) / n
                old_avg = self.metrics.average_execution_time_ms
                self.metrics.average_execution_time_ms = (old_avg * (n - 1) + execution_time) / n
        
        # Update average cost (running average)
        if workflow_result.status == WorkflowExecutionStatus.COMPLETED and workflow_result.total_cost > 0:
            n = self.metrics.completed_workflows
            if n == 1:
                self.metrics.average_cost = workflow_result.total_cost
            else:
                old_avg = self.metrics.average_cost
                self.metrics.average_cost = (old_avg * (n - 1) + workflow_result.total_cost) / n
        
        # Calculate cost savings vs baseline model (e.g., gpt-4o for all steps)
        # Baseline: assume all steps would use premium model (e.g., gpt-4o)
        if workflow_result.status == WorkflowExecutionStatus.COMPLETED:
            baseline_model_id = "openai-compatible/gpt-4o"  # Default baseline
            baseline_cost = self._calculate_baseline_cost(
                baseline_model_id,
                {
                    "input_tokens": workflow_result.total_input_tokens,
                    "output_tokens": workflow_result.total_output_tokens
                }
            )
            
            if baseline_cost > 0:
                cost_savings = baseline_cost - workflow_result.total_cost
                cost_savings_percentage = (cost_savings / baseline_cost) * 100 if baseline_cost > 0 else 0.0
                
                # Update metrics (running average of cost savings percentage)
                if self.metrics.completed_workflows == 1:
                    self.metrics.total_cost_savings = cost_savings
                    self.metrics.cost_savings_percentage = cost_savings_percentage
                else:
                    # Weighted average based on cost difference
                    old_savings = self.metrics.total_cost_savings
                    self.metrics.total_cost_savings = old_savings + cost_savings
                    
                    # Update cost savings percentage (weighted by cost difference)
                    old_percentage = self.metrics.cost_savings_percentage
                    weight = abs(cost_savings) / (abs(old_savings) + abs(cost_savings)) if (old_savings + cost_savings) != 0 else 0.5
                    self.metrics.cost_savings_percentage = (
                        old_percentage * (1 - weight) + cost_savings_percentage * weight
                    )
                
                logger.info(
                    f"💰 Workflow cost: ${workflow_result.total_cost:.6f}, "
                    f"baseline: ${baseline_cost:.6f}, "
                    f"savings: ${cost_savings:.6f} ({cost_savings_percentage:.2f}%)"
                )
        
        logger.info(
            f"🏁 Workflow {workflow_id} completed: status={workflow_result.status.value}, "
            f"steps={len(workflow_result.step_results)}, "
            f"time={workflow_result.total_execution_time_ms:.0f}ms"
        )
        
        return workflow_result
    
    def get_metrics(self) -> Dict[str, Any]:
        """
        Get workflow execution metrics.
        
        Returns:
            Dict với workflow metrics
        """
        total = self.metrics.total_workflows
        completion_rate = (
            (self.metrics.completed_workflows / total * 100) if total > 0 else 0.0
        )
        failure_rate = (
            (self.metrics.failed_workflows / total * 100) if total > 0 else 0.0
        )
        
        return {
            "total_workflows": self.metrics.total_workflows,
            "completed_workflows": self.metrics.completed_workflows,
            "failed_workflows": self.metrics.failed_workflows,
            "completion_rate": completion_rate,
            "failure_rate": failure_rate,
            "workflows_by_status": {
                status.value: count
                for status, count in self.metrics.workflows_by_status.items()
            },
            "average_execution_time_ms": self.metrics.average_execution_time_ms,
            "average_cost": self.metrics.average_cost,
            "total_cost_savings": self.metrics.total_cost_savings,
            "cost_savings_percentage": self.metrics.cost_savings_percentage,
        }
    
    def reset_metrics(self) -> None:
        """Reset workflow metrics."""
        self.metrics = WorkflowMetrics()
        logger.info("MultiModelOrchestrator metrics reset")
    
    async def cancel_workflow(self, workflow_id: str) -> bool:
        """
        Cancel a running workflow (Story 3.3 enhancement).
        
        Args:
            workflow_id: Workflow execution ID to cancel
        
        Returns:
            True if workflow was cancelled, False if not found or already completed
        """
        if workflow_id in self._cancelled_workflows:
            logger.info(f"Workflow {workflow_id} is already cancelled")
            return True
        
        # Mark workflow as cancelled
        self._cancelled_workflows.add(workflow_id)
        
        # If workflow is active, cancel the task
        if workflow_id in self._active_workflows:
            workflow_task = self._active_workflows[workflow_id]
            workflow_task.cancel()
            logger.info(f"🚫 Cancelled workflow {workflow_id}")
            return True
        
        logger.warning(f"Workflow {workflow_id} is not active, cannot cancel")
        return False
    
    def get_active_workflows(self) -> List[str]:
        """
        Get list of active workflow IDs (Story 3.3 enhancement).
        
        Returns:
            List of active workflow IDs
        """
        # Filter out completed workflows
        active = []
        for workflow_id, task in self._active_workflows.items():
            if not task.done():
                active.append(workflow_id)
            else:
                # Clean up completed workflows
                if workflow_id in self._active_workflows:
                    del self._active_workflows[workflow_id]
        
        return active


# Global MultiModelOrchestrator instance
_orchestrator_instance: Optional[MultiModelOrchestrator] = None


def get_multi_model_orchestrator() -> MultiModelOrchestrator:
    """
    Get global MultiModelOrchestrator instance (singleton).
    
    Returns:
        MultiModelOrchestrator instance
    """
    global _orchestrator_instance
    
    if _orchestrator_instance is None:
        from core.utils.config import config
        
        # Load configuration
        orchestrator_enabled = getattr(config, "MULTI_MODEL_ORCHESTRATION_ENABLED", True)
        
        _orchestrator_instance = MultiModelOrchestrator(enabled=orchestrator_enabled)
        
        logger.info("Global MultiModelOrchestrator instance created")
    
    return _orchestrator_instance


def set_multi_model_orchestrator(instance: MultiModelOrchestrator) -> None:
    """
    Set global MultiModelOrchestrator instance (for testing).
    
    Args:
        instance: MultiModelOrchestrator instance
    """
    global _orchestrator_instance
    _orchestrator_instance = instance
    logger.info("Global MultiModelOrchestrator instance set")

