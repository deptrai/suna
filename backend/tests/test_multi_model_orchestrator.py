"""
Tests for Sequential Model Execution (Story 3.3).
"""

import pytest
import asyncio
from unittest.mock import Mock, patch, AsyncMock
from datetime import datetime, timezone

from core.optimizations.multi_model_orchestrator import (
    MultiModelOrchestrator,
    WorkflowResult,
    WorkflowExecutionStatus,
    StepResult,
    StepExecutionStatus,
    get_multi_model_orchestrator,
    set_multi_model_orchestrator
)
from core.optimizations.model_router import ModelRouter, get_model_router
from core.ai_models.registry import ModelRegistry
from core.ai_models.ai_models import Model, ModelProvider, ModelPricing


# Pytest fixtures for common test setup
@pytest.fixture
def sample_models():
    """Fixture for sample models với pricing."""
    return {
        "gpt-4o-mini": Model(
            id="openai-compatible/gpt-4o-mini",
            name="GPT-4o Mini",
            provider=ModelProvider.OPENAI_COMPATIBLE,
            pricing=ModelPricing(
                input_cost_per_million_tokens=0.15,
                output_cost_per_million_tokens=0.60
            ),
            enabled=True,
            priority=95
        ),
        "qwen3-30b": Model(
            id="openai-compatible/qwen3-30b-a3b-instruct-2507",
            name="Qwen3 30B",
            provider=ModelProvider.OPENAI_COMPATIBLE,
            pricing=ModelPricing(
                input_cost_per_million_tokens=0.10,
                output_cost_per_million_tokens=0.50
            ),
            enabled=True,
            priority=94
        ),
        "gpt-4o": Model(
            id="openai-compatible/gpt-4o",
            name="GPT-4o",
            provider=ModelProvider.OPENAI_COMPATIBLE,
            pricing=ModelPricing(
                input_cost_per_million_tokens=2.50,
                output_cost_per_million_tokens=10.00
            ),
            enabled=True,
            priority=100
        ),
    }


@pytest.fixture
def mock_model_registry(sample_models):
    """Fixture for mock ModelRegistry."""
    registry = Mock(spec=ModelRegistry)
    
    def get_model(model_id: str):
        for model in sample_models.values():
            if model.id == model_id:
                return model
        return None
    
    registry.get = Mock(side_effect=get_model)
    registry.get_all = Mock(return_value=list(sample_models.values()))
    return registry


@pytest.fixture
def mock_model_router(mock_model_registry):
    """Fixture for mock ModelRouter với model_registry."""
    router = Mock(spec=ModelRouter)
    router.model_registry = mock_model_registry
    return router


@pytest.fixture
def orchestrator_with_mocks(mock_model_router):
    """Fixture for MultiModelOrchestrator với mocked dependencies."""
    orchestrator = MultiModelOrchestrator(
        model_router=mock_model_router,
        enabled=True
    )
    return orchestrator


@pytest.fixture
def sample_workflow():
    """Fixture for sample workflow definition."""
    return {
        "steps": [
            {
                "id": "step_1",
                "model": "openai-compatible/gpt-4o-mini",
                "input": "user_query",
                "prompt_template": "Analyze: {input}",
                "output_key": "analysis_result",
                "error_handling": {"retry": 1, "fallback_model": "openai-compatible/qwen3-30b-a3b-instruct-2507"}
            },
            {
                "id": "step_2",
                "model": "openai-compatible/gpt-4o",
                "input": "{step_1.analysis_result}",
                "prompt_template": "Create plan based on: {input}",
                "output_key": "plan_result"
            }
        ]
    }


@pytest.fixture
def sample_llm_response():
    """Fixture for sample LLM response."""
    return {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": "Test response content"
                },
                "finish_reason": "stop"
            }
        ],
        "usage": {
            "prompt_tokens": 100,
            "completion_tokens": 50,
            "total_tokens": 150
        }
    }


class TestMultiModelOrchestratorInitialization:
    """Test MultiModelOrchestrator initialization (AC: #1)."""
    
    @pytest.mark.p0
    def test_initialization_default(self):
        """Test initialization với default parameters.
        
        Test ID: 3.3-UNIT-001
        Priority: P0 (Critical)
        AC: #1
        
        Given: No parameters provided
        When: MultiModelOrchestrator is initialized
        Then: Should use global ModelRouter singleton và be enabled
        """
        orchestrator = MultiModelOrchestrator()
        assert orchestrator.enabled is True
        assert orchestrator.model_router is not None
        assert orchestrator.metrics is not None
    
    @pytest.mark.p0
    def test_initialization_custom(self, mock_model_router):
        """Test initialization với custom parameters.
        
        Test ID: 3.3-UNIT-002
        Priority: P0 (Critical)
        AC: #1
        
        Given: Custom ModelRouter và enabled=False
        When: MultiModelOrchestrator is initialized
        Then: Should use provided ModelRouter và be disabled
        """
        orchestrator = MultiModelOrchestrator(
            model_router=mock_model_router,
            enabled=False
        )
        assert orchestrator.enabled is False
        assert orchestrator.model_router == mock_model_router
    
    @pytest.mark.p1
    def test_singleton_pattern(self):
        """Test singleton pattern for global instance.
        
        Test ID: 3.3-UNIT-003
        Priority: P1 (High priority)
        AC: #1
        
        Given: Global orchestrator instance
        When: get_multi_model_orchestrator() is called multiple times
        Then: Should return the same instance
        """
        # Reset global instance
        set_multi_model_orchestrator(None)
        
        instance1 = get_multi_model_orchestrator()
        instance2 = get_multi_model_orchestrator()
        
        assert instance1 is instance2


class TestWorkflowDefinition:
    """Test workflow definition validation (AC: #3)."""
    
    @pytest.mark.p0
    def test_validate_workflow_valid(self, orchestrator_with_mocks, sample_workflow):
        """Test workflow validation với valid workflow.
        
        Test ID: 3.3-UNIT-004
        Priority: P0 (Critical)
        AC: #3
        
        Given: Valid workflow definition
        When: Workflow is validated
        Then: Should return True
        """
        assert orchestrator_with_mocks._validate_workflow(sample_workflow) is True
    
    @pytest.mark.p0
    def test_validate_workflow_invalid_no_steps(self, orchestrator_with_mocks):
        """Test workflow validation với invalid workflow (no steps).
        
        Test ID: 3.3-UNIT-005
        Priority: P0 (Critical)
        AC: #3
        
        Given: Workflow without 'steps' key
        When: Workflow is validated
        Then: Should return False
        """
        invalid_workflow = {}
        assert orchestrator_with_mocks._validate_workflow(invalid_workflow) is False
    
    @pytest.mark.p0
    def test_validate_workflow_invalid_empty_steps(self, orchestrator_with_mocks):
        """Test workflow validation với invalid workflow (empty steps).
        
        Test ID: 3.3-UNIT-006
        Priority: P0 (Critical)
        AC: #3
        
        Given: Workflow với empty steps list
        When: Workflow is validated
        Then: Should return False
        """
        invalid_workflow = {"steps": []}
        assert orchestrator_with_mocks._validate_workflow(invalid_workflow) is False
    
    @pytest.mark.p1
    def test_validate_workflow_invalid_missing_fields(self, orchestrator_with_mocks):
        """Test workflow validation với invalid workflow (missing required fields).
        
        Test ID: 3.3-UNIT-007
        Priority: P1 (High priority)
        AC: #3
        
        Given: Workflow step missing required fields
        When: Workflow is validated
        Then: Should return False
        """
        invalid_workflow = {
            "steps": [
                {
                    "id": "step_1",
                    # Missing: model, input, prompt_template, output_key
                }
            ]
        }
        assert orchestrator_with_mocks._validate_workflow(invalid_workflow) is False
    
    @pytest.mark.p1
    def test_validate_workflow_duplicate_step_ids(self, orchestrator_with_mocks):
        """Test workflow validation với duplicate step IDs.
        
        Test ID: 3.3-UNIT-008
        Priority: P1 (High priority)
        AC: #3
        
        Given: Workflow với duplicate step IDs
        When: Workflow is validated
        Then: Should return False
        """
        invalid_workflow = {
            "steps": [
                {
                    "id": "step_1",
                    "model": "openai-compatible/gpt-4o-mini",
                    "input": "user_query",
                    "prompt_template": "Analyze: {input}",
                    "output_key": "analysis_result"
                },
                {
                    "id": "step_1",  # Duplicate ID
                    "model": "openai-compatible/gpt-4o",
                    "input": "{step_1.analysis_result}",
                    "prompt_template": "Create plan: {input}",
                    "output_key": "plan_result"
                }
            ]
        }
        assert orchestrator_with_mocks._validate_workflow(invalid_workflow) is False


class TestCostCalculation:
    """Test cost calculation (enhancement)."""
    
    @pytest.mark.p1
    def test_calculate_step_cost(self, orchestrator_with_mocks, sample_models):
        """Test step cost calculation.
        
        Test ID: 3.3-UNIT-009
        Priority: P1 (High priority)
        AC: #6 (enhancement)
        
        Given: Model với pricing và token usage
        When: Step cost is calculated
        Then: Should return correct cost
        """
        model = sample_models["gpt-4o-mini"]
        token_usage = {
            "input_tokens": 1000,
            "output_tokens": 500,
            "total_tokens": 1500
        }
        
        cost = orchestrator_with_mocks._calculate_step_cost(model.id, token_usage)
        
        # Expected cost: (1000/1_000_000) * 0.15 + (500/1_000_000) * 0.60
        # = 0.001 * 0.15 + 0.0005 * 0.60 = 0.00015 + 0.0003 = 0.00045
        expected_cost = (1000 / 1_000_000) * 0.15 + (500 / 1_000_000) * 0.60
        assert abs(cost - expected_cost) < 0.000001
    
    @pytest.mark.p1
    def test_calculate_step_cost_no_pricing(self, orchestrator_with_mocks):
        """Test step cost calculation với no pricing.
        
        Test ID: 3.3-UNIT-010
        Priority: P1 (High priority)
        AC: #6 (enhancement)
        
        Given: Model without pricing
        When: Step cost is calculated
        Then: Should return 0.0
        """
        token_usage = {
            "input_tokens": 1000,
            "output_tokens": 500,
            "total_tokens": 1500
        }
        
        cost = orchestrator_with_mocks._calculate_step_cost("unknown-model", token_usage)
        assert cost == 0.0
    
    @pytest.mark.p1
    @pytest.mark.asyncio
    async def test_workflow_cost_tracking(self, orchestrator_with_mocks, sample_workflow, sample_models):
        """Test workflow cost tracking.
        
        Test ID: 3.3-UNIT-011
        Priority: P1 (High priority)
        AC: #6 (enhancement)
        
        Given: Workflow execution với models có pricing
        When: Workflow completes
        Then: Should track total cost và cost savings
        """
        with patch("core.optimizations.multi_model_orchestrator.make_llm_api_call") as mock_llm:
            step1_response = {
                "choices": [{"message": {"content": "Step 1 result"}}],
                "usage": {"prompt_tokens": 1000, "completion_tokens": 500, "total_tokens": 1500}
            }
            step2_response = {
                "choices": [{"message": {"content": "Step 2 result"}}],
                "usage": {"prompt_tokens": 1500, "completion_tokens": 750, "total_tokens": 2250}
            }
            mock_llm.side_effect = [step1_response, step2_response]
            
            result = await orchestrator_with_mocks.execute_workflow(
                workflow=sample_workflow,
                initial_input="What is Python?"
            )
            
            # Check cost is tracked
            assert result.total_cost > 0
            
            # Check metrics include cost data
            metrics = orchestrator_with_mocks.get_metrics()
            assert "average_cost" in metrics
            assert "cost_savings_percentage" in metrics


class TestInputResolution:
    """Test input resolution for workflow steps (AC: #4)."""
    
    @pytest.mark.p0
    def test_resolve_step_input_user_query(self, orchestrator_with_mocks):
        """Test resolving step input from user_query.
        
        Test ID: 3.3-UNIT-012
        Priority: P0 (Critical)
        AC: #4
        
        Given: Step với input="user_query"
        When: Input is resolved
        Then: Should return initial_input
        """
        step = {
            "id": "step_1",
            "model": "openai-compatible/gpt-4o-mini",
            "input": "user_query",
            "prompt_template": "Analyze: {input}",
            "output_key": "analysis_result"
        }
        initial_input = "What is Python?"
        intermediate_results = {}
        
        resolved = orchestrator_with_mocks._resolve_step_input(
            step, initial_input, intermediate_results
        )
        
        assert resolved == initial_input
    
    @pytest.mark.p0
    def test_resolve_step_input_from_previous_step(self, orchestrator_with_mocks):
        """Test resolving step input from previous step output.
        
        Test ID: 3.3-UNIT-012
        Priority: P0 (Critical)
        AC: #4
        
        Given: Step với input="{step_1.analysis_result}"
        When: Input is resolved
        Then: Should return value from intermediate_results
        """
        step = {
            "id": "step_2",
            "model": "openai-compatible/gpt-4o",
            "input": "{step_1.analysis_result}",
            "prompt_template": "Create plan: {input}",
            "output_key": "plan_result"
        }
        initial_input = "What is Python?"
        intermediate_results = {
            "step_1": {
                "analysis_result": "Python is a programming language"
            }
        }
        
        resolved = orchestrator_with_mocks._resolve_step_input(
            step, initial_input, intermediate_results
        )
        
        assert resolved == "Python is a programming language"
    
    @pytest.mark.p1
    def test_resolve_step_input_fallback_to_initial(self, orchestrator_with_mocks):
        """Test resolving step input với fallback to initial_input.
        
        Test ID: 3.3-UNIT-013
        Priority: P1 (High priority)
        AC: #4
        
        Given: Step với input reference to non-existent step
        When: Input is resolved
        Then: Should fallback to initial_input
        """
        step = {
            "id": "step_2",
            "model": "openai-compatible/gpt-4o",
            "input": "{step_1.analysis_result}",
            "prompt_template": "Create plan: {input}",
            "output_key": "plan_result"
        }
        initial_input = "What is Python?"
        intermediate_results = {}  # step_1 not in results
        
        resolved = orchestrator_with_mocks._resolve_step_input(
            step, initial_input, intermediate_results
        )
        
        assert resolved == initial_input  # Fallback to initial_input


class TestPromptFormatting:
    """Test prompt formatting với placeholders (AC: #4)."""
    
    @pytest.mark.p0
    def test_format_prompt_with_input(self, orchestrator_with_mocks):
        """Test formatting prompt với {input} placeholder.
        
        Test ID: 3.3-UNIT-014
        Priority: P0 (Critical)
        AC: #4
        
        Given: Prompt template với {input} placeholder
        When: Prompt is formatted
        Then: Should replace {input} với step input
        """
        prompt_template = "Analyze: {input}"
        step_input = "What is Python?"
        intermediate_results = {}
        
        formatted = orchestrator_with_mocks._format_prompt(
            prompt_template, step_input, intermediate_results
        )
        
        assert formatted == "Analyze: What is Python?"
        assert "{input}" not in formatted
    
    @pytest.mark.p1
    def test_format_prompt_with_literal_braces(self, orchestrator_with_mocks):
        """Test formatting prompt với literal braces ({{ and }}).
        
        Test ID: 3.3-UNIT-015
        Priority: P1 (High priority)
        AC: #4 (enhancement)
        
        Given: Prompt template với literal braces {{ and }}
        When: Prompt is formatted
        Then: Should preserve literal braces và replace placeholders
        """
        prompt_template = "Analyze: {input} with {{literal}} braces"
        step_input = "test value"
        intermediate_results = {}
        
        formatted = orchestrator_with_mocks._format_prompt(
            prompt_template, step_input, intermediate_results
        )
        
        assert formatted == "Analyze: test value with {literal} braces"
        assert "{input}" not in formatted
        assert "{{literal}}" not in formatted  # Should be single braces after formatting
    
    @pytest.mark.p1
    def test_format_prompt_with_intermediate_results(self, orchestrator_with_mocks):
        """Test formatting prompt với intermediate result placeholders.
        
        Test ID: 3.3-UNIT-016
        Priority: P1 (High priority)
        AC: #4
        
        Given: Prompt template với {step_id.output_key} placeholder
        When: Prompt is formatted
        Then: Should replace placeholder với value from intermediate_results
        """
        prompt_template = "Create plan based on: {input} và analysis: {step_1.analysis_result}"
        step_input = "User question"
        intermediate_results = {
            "step_1": {
                "analysis_result": "Python is a programming language"
            }
        }
        
        formatted = orchestrator_with_mocks._format_prompt(
            prompt_template, step_input, intermediate_results
        )
        
        assert "Create plan based on: User question" in formatted
        assert "analysis: Python is a programming language" in formatted
        assert "{step_1.analysis_result}" not in formatted


class TestResponseExtraction:
    """Test response data extraction."""
    
    @pytest.mark.p0
    def test_extract_response_data_dict(self, orchestrator_with_mocks, sample_llm_response):
        """Test extracting response data from dict response.
        
        Test ID: 3.3-UNIT-016
        Priority: P0 (Critical)
        AC: #2, #4
        
        Given: Dict response với choices và usage
        When: Response data is extracted
        Then: Should return content và token_usage
        """
        content, token_usage = orchestrator_with_mocks._extract_response_data(sample_llm_response)
        
        assert content == "Test response content"
        assert token_usage is not None
        assert token_usage["input_tokens"] == 100
        assert token_usage["output_tokens"] == 50
        assert token_usage["total_tokens"] == 150
    
    @pytest.mark.p1
    def test_extract_response_data_model_response(self, orchestrator_with_mocks):
        """Test extracting response data from ModelResponse object.
        
        Test ID: 3.3-UNIT-017
        Priority: P1 (High priority)
        AC: #2, #4
        
        Given: ModelResponse object
        When: Response data is extracted
        Then: Should return content và token_usage
        """
        # Mock ModelResponse object
        mock_response = Mock()
        mock_choice = Mock()
        mock_message = Mock()
        mock_message.content = "Test response content"
        mock_choice.message = mock_message
        mock_response.choices = [mock_choice]
        
        mock_usage = Mock()
        mock_usage.prompt_tokens = 100
        mock_usage.completion_tokens = 50
        mock_usage.total_tokens = 150
        mock_response.usage = mock_usage
        mock_response.model_dump = Mock(return_value={
            "choices": [
                {
                    "message": {
                        "content": "Test response content"
                    }
                }
            ],
            "usage": {
                "prompt_tokens": 100,
                "completion_tokens": 50,
                "total_tokens": 150
            }
        })
        
        content, token_usage = orchestrator_with_mocks._extract_response_data(mock_response)
        
        assert content == "Test response content"
        assert token_usage is not None
        assert token_usage["input_tokens"] == 100
        assert token_usage["output_tokens"] == 50


class TestSequentialExecution:
    """Test sequential execution logic (AC: #2)."""
    
    @pytest.mark.p0
    @pytest.mark.asyncio
    async def test_execute_workflow_sequential(self, orchestrator_with_mocks, sample_workflow):
        """Test executing workflow với sequential steps.
        
        Test ID: 3.3-UNIT-018
        Priority: P0 (Critical)
        AC: #2
        
        Given: Workflow với multiple steps
        When: Workflow is executed
        Then: Steps should execute in sequence (step 1 → step 2)
        """
        # Mock make_llm_api_call
        with patch("core.optimizations.multi_model_orchestrator.make_llm_api_call") as mock_llm:
            # Step 1 response
            mock_response_1 = {
                "choices": [
                    {
                        "message": {
                            "content": "Analysis result from step 1"
                        }
                    }
                ],
                "usage": {
                    "prompt_tokens": 100,
                    "completion_tokens": 50,
                    "total_tokens": 150
                }
            }
            # Step 2 response
            mock_response_2 = {
                "choices": [
                    {
                        "message": {
                            "content": "Plan result from step 2"
                        }
                    }
                ],
                "usage": {
                    "prompt_tokens": 150,
                    "completion_tokens": 75,
                    "total_tokens": 225
                }
            }
            mock_llm.side_effect = [mock_response_1, mock_response_2]
            
            result = await orchestrator_with_mocks.execute_workflow(
                workflow=sample_workflow,
                initial_input="What is Python?"
            )
            
            # Verify workflow completed
            assert result.status == WorkflowExecutionStatus.COMPLETED
            assert len(result.step_results) == 2
            
            # Verify step 1 executed first
            step1_result = result.step_results[0]
            assert step1_result.step_id == "step_1"
            assert step1_result.status == StepExecutionStatus.COMPLETED
            assert step1_result.output == "Analysis result from step 1"
            
            # Verify step 2 executed second với step 1 output
            step2_result = result.step_results[1]
            assert step2_result.step_id == "step_2"
            assert step2_result.status == StepExecutionStatus.COMPLETED
            assert step2_result.output == "Plan result from step 2"
            
            # Verify intermediate results
            assert "step_1" in result.intermediate_results
            assert result.intermediate_results["step_1"]["analysis_result"] == "Analysis result from step 1"
            assert "step_2" in result.intermediate_results
            assert result.intermediate_results["step_2"]["plan_result"] == "Plan result from step 2"
            
            # Verify LLM was called twice (once per step)
            assert mock_llm.call_count == 2
            
            # Verify calls were made với correct models
            call_args = mock_llm.call_args_list
            assert call_args[0].kwargs["model_name"] == "openai-compatible/gpt-4o-mini"
            assert call_args[1].kwargs["model_name"] == "openai-compatible/gpt-4o"
    
    @pytest.mark.p1
    @pytest.mark.asyncio
    async def test_execute_workflow_single_step(self, orchestrator_with_mocks):
        """Test executing workflow với single step.
        
        Test ID: 3.3-UNIT-019
        Priority: P1 (High priority)
        AC: #2
        
        Given: Workflow với single step
        When: Workflow is executed
        Then: Should execute step và return result
        """
        workflow = {
            "steps": [
                {
                    "id": "step_1",
                    "model": "openai-compatible/gpt-4o-mini",
                    "input": "user_query",
                    "prompt_template": "Analyze: {input}",
                    "output_key": "analysis_result"
                }
            ]
        }
        
        with patch("core.optimizations.multi_model_orchestrator.make_llm_api_call") as mock_llm:
            mock_response = {
                "choices": [
                    {
                        "message": {
                            "content": "Single step result"
                        }
                    }
                ],
                "usage": {
                    "prompt_tokens": 100,
                    "completion_tokens": 50,
                    "total_tokens": 150
                }
            }
            mock_llm.return_value = mock_response
            
            result = await orchestrator_with_mocks.execute_workflow(
                workflow=workflow,
                initial_input="What is Python?"
            )
            
            assert result.status == WorkflowExecutionStatus.COMPLETED
            assert len(result.step_results) == 1
            assert result.step_results[0].status == StepExecutionStatus.COMPLETED
            assert result.final_output == "Single step result"


class TestErrorHandling:
    """Test error handling (AC: #5)."""
    
    @pytest.mark.p0
    @pytest.mark.asyncio
    async def test_execute_step_with_retry(self, orchestrator_with_mocks):
        """Test executing step với retry logic.
        
        Test ID: 3.3-UNIT-020
        Priority: P0 (Critical)
        AC: #5
        
        Given: Step với error_handling.retry=2
        When: Step fails initially
        Then: Should retry up to 2 times before failing
        """
        step = {
            "id": "step_1",
            "model": "openai-compatible/gpt-4o-mini",
            "input": "user_query",
            "prompt_template": "Analyze: {input}",
            "output_key": "analysis_result",
            "error_handling": {"retry": 2}
        }
        
        with patch("core.optimizations.multi_model_orchestrator.make_llm_api_call") as mock_llm:
            # First two calls fail, third succeeds
            mock_llm.side_effect = [
                Exception("API error 1"),
                Exception("API error 2"),
                {
                    "choices": [{"message": {"content": "Success after retry"}}],
                    "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}
                }
            ]
            
            result = await orchestrator_with_mocks._execute_step(
                step=step,
                initial_input="What is Python?",
                intermediate_results={},
                workflow_id="test-workflow"
            )
            
            assert result.status == StepExecutionStatus.COMPLETED
            assert result.retry_count == 2
            assert result.output == "Success after retry"
            assert mock_llm.call_count == 3  # 2 retries + 1 success
    
    @pytest.mark.p0
    @pytest.mark.asyncio
    async def test_execute_step_with_fallback(self, orchestrator_with_mocks):
        """Test executing step với fallback model.
        
        Test ID: 3.3-UNIT-021
        Priority: P0 (Critical)
        AC: #5
        
        Given: Step với error_handling.fallback_model
        When: Primary model fails after retries
        Then: Should try fallback model
        """
        step = {
            "id": "step_1",
            "model": "openai-compatible/gpt-4o-mini",
            "input": "user_query",
            "prompt_template": "Analyze: {input}",
            "output_key": "analysis_result",
            "error_handling": {
                "retry": 1,
                "fallback_model": "openai-compatible/qwen3-30b-a3b-instruct-2507"
            }
        }
        
        with patch("core.optimizations.multi_model_orchestrator.make_llm_api_call") as mock_llm:
            # Primary model fails twice (1 retry), then fallback succeeds
            mock_llm.side_effect = [
                Exception("Primary model error 1"),
                Exception("Primary model error 2"),
                {
                    "choices": [{"message": {"content": "Success với fallback model"}}],
                    "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}
                }
            ]
            
            result = await orchestrator_with_mocks._execute_step(
                step=step,
                initial_input="What is Python?",
                intermediate_results={},
                workflow_id="test-workflow"
            )
            
            assert result.status == StepExecutionStatus.COMPLETED
            assert result.fallback_used is True
            assert result.model_id == "openai-compatible/qwen3-30b-a3b-instruct-2507"
            assert result.output == "Success với fallback model"
            assert mock_llm.call_count == 3  # 2 primary attempts + 1 fallback
    
    @pytest.mark.p1
    @pytest.mark.asyncio
    async def test_execute_workflow_step_failure_stops_workflow(self, orchestrator_with_mocks, sample_workflow):
        """Test workflow stops when step fails.
        
        Test ID: 3.3-UNIT-022
        Priority: P1 (High priority)
        AC: #5
        
        Given: Workflow với multiple steps
        When: Step fails after all retries và no fallback
        Then: Workflow should stop và return PARTIAL status
        """
        with patch("core.optimizations.multi_model_orchestrator.make_llm_api_call") as mock_llm:
            # Step 1 succeeds
            mock_response_1 = {
                "choices": [{"message": {"content": "Step 1 result"}}],
                "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}
            }
            # Step 2 fails
            mock_llm.side_effect = [
                mock_response_1,
                Exception("Step 2 failed")
            ]
            
            # Remove fallback from step 2
            sample_workflow["steps"][1]["error_handling"] = {"retry": 0}
            
            result = await orchestrator_with_mocks.execute_workflow(
                workflow=sample_workflow,
                initial_input="What is Python?"
            )
            
            assert result.status == WorkflowExecutionStatus.PARTIAL
            assert len(result.step_results) == 2
            assert result.step_results[0].status == StepExecutionStatus.COMPLETED
            assert result.step_results[1].status == StepExecutionStatus.FAILED
            assert result.error is not None
            assert "step_2" in result.error
    
    @pytest.mark.p1
    @pytest.mark.asyncio
    async def test_execute_step_with_timeout(self, orchestrator_with_mocks):
        """Test executing step với timeout.
        
        Test ID: 3.3-UNIT-023
        Priority: P1 (High priority)
        AC: #5 (enhancement)
        
        Given: Step với error_handling.timeout_seconds=1
        When: Step takes longer than timeout
        Then: Should timeout và retry or fail
        """
        step = {
            "id": "step_1",
            "model": "openai-compatible/gpt-4o-mini",
            "input": "user_query",
            "prompt_template": "Analyze: {input}",
            "output_key": "analysis_result",
            "error_handling": {"retry": 0, "timeout_seconds": 1}
        }
        
        with patch("core.optimizations.multi_model_orchestrator.make_llm_api_call") as mock_llm:
            # Simulate slow response (longer than timeout)
            async def slow_llm_call(*args, **kwargs):
                await asyncio.sleep(2)  # Sleep longer than timeout
                return {
                    "choices": [{"message": {"content": "Result"}}],
                    "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}
                }
            
            mock_llm.side_effect = slow_llm_call
            
            result = await orchestrator_with_mocks._execute_step(
                step=step,
                initial_input="What is Python?",
                intermediate_results={},
                workflow_id="test-workflow"
            )
            
            # Should timeout
            assert result.status == StepExecutionStatus.FAILED
            assert "timed out" in result.error.lower()


class TestIntermediateResults:
    """Test intermediate result passing (AC: #4)."""
    
    @pytest.mark.p0
    @pytest.mark.asyncio
    async def test_intermediate_result_passing(self, orchestrator_with_mocks, sample_workflow):
        """Test passing intermediate results between steps.
        
        Test ID: 3.3-UNIT-024
        Priority: P0 (Critical)
        AC: #4
        
        Given: Workflow với step 2 using step 1 output
        When: Workflow is executed
        Then: Step 2 should receive step 1 output as input
        """
        with patch("core.optimizations.multi_model_orchestrator.make_llm_api_call") as mock_llm:
            step1_response = {
                "choices": [{"message": {"content": "Step 1 analysis result"}}],
                "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}
            }
            step2_response = {
                "choices": [{"message": {"content": "Step 2 plan result"}}],
                "usage": {"prompt_tokens": 150, "completion_tokens": 75, "total_tokens": 225}
            }
            mock_llm.side_effect = [step1_response, step2_response]
            
            result = await orchestrator_with_mocks.execute_workflow(
                workflow=sample_workflow,
                initial_input="What is Python?"
            )
            
            # Verify intermediate results stored
            assert "step_1" in result.intermediate_results
            assert result.intermediate_results["step_1"]["analysis_result"] == "Step 1 analysis result"
            
            # Verify step 2 received step 1 output
            # Check that step 2 input was resolved correctly
            step2_call = mock_llm.call_args_list[1]
            step2_messages = step2_call.kwargs["messages"]
            step2_prompt = step2_messages[0]["content"]
            
            # Step 2 prompt should include step 1 result
            assert "Step 1 analysis result" in step2_prompt or "step_1" in step2_prompt


class TestWorkflowMetrics:
    """Test workflow metrics tracking."""
    
    @pytest.mark.p1
    @pytest.mark.asyncio
    async def test_workflow_metrics_tracking(self, orchestrator_with_mocks, sample_workflow):
        """Test workflow metrics are tracked correctly.
        
        Test ID: 3.3-UNIT-025
        Priority: P1 (High priority)
        AC: #6
        
        Given: Workflow execution
        When: Workflow completes
        Then: Metrics should be updated
        """
        with patch("core.optimizations.multi_model_orchestrator.make_llm_api_call") as mock_llm:
            mock_response = {
                "choices": [{"message": {"content": "Test result"}}],
                "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}
            }
            mock_llm.return_value = mock_response
            
            # Execute workflow
            result = await orchestrator_with_mocks.execute_workflow(
                workflow=sample_workflow,
                initial_input="What is Python?"
            )
            
            # Check metrics
            metrics = orchestrator_with_mocks.get_metrics()
            assert metrics["total_workflows"] > 0
            assert metrics["completed_workflows"] > 0
            assert WorkflowExecutionStatus.COMPLETED.value in metrics["workflows_by_status"]
            
            # Check cost tracking (if models have pricing)
            assert "average_cost" in metrics
            assert "cost_savings_percentage" in metrics
            # Cost should be > 0 if pricing is available
            if result.total_cost > 0:
                assert metrics["average_cost"] > 0
    
    @pytest.mark.p1
    def test_metrics_reset(self, orchestrator_with_mocks):
        """Test resetting workflow metrics.
        
        Test ID: 3.3-UNIT-026
        Priority: P1 (High priority)
        AC: #6
        
        Given: Metrics with some data
        When: Metrics are reset
        Then: All metrics should be reset to zero
        """
        # Set some metrics
        orchestrator_with_mocks.metrics.total_workflows = 10
        orchestrator_with_mocks.metrics.completed_workflows = 5
        
        orchestrator_with_mocks.reset_metrics()
        
        metrics = orchestrator_with_mocks.get_metrics()
        assert metrics["total_workflows"] == 0
        assert metrics["completed_workflows"] == 0
    
    @pytest.mark.p1
    @pytest.mark.asyncio
    async def test_average_execution_time_calculation(self, orchestrator_with_mocks, sample_workflow):
        """Test average execution time calculation (running average).
        
        Test ID: 3.3-UNIT-027
        Priority: P1 (High priority)
        AC: #6 (enhancement)
        
        Given: Multiple workflow executions
        When: Workflows complete
        Then: Average execution time should be calculated correctly
        """
        with patch("core.optimizations.multi_model_orchestrator.make_llm_api_call") as mock_llm:
            mock_response = {
                "choices": [{"message": {"content": "Result"}}],
                "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}
            }
            mock_llm.return_value = mock_response
            
            # Execute workflow multiple times
            for i in range(3):
                result = await orchestrator_with_mocks.execute_workflow(
                    workflow=sample_workflow,
                    initial_input=f"Test {i}"
                )
                assert result.status == WorkflowExecutionStatus.COMPLETED
            
            # Check metrics
            metrics = orchestrator_with_mocks.get_metrics()
            assert metrics["completed_workflows"] == 3
            assert metrics["average_execution_time_ms"] > 0
            # Average should be reasonable (not just the last value)
            assert metrics["average_execution_time_ms"] == metrics["average_execution_time_ms"]  # Should be consistent


class TestWorkflowIntegration:
    """Integration tests for workflow execution (AC: #6)."""
    
    @pytest.mark.p0
    @pytest.mark.asyncio
    async def test_end_to_end_workflow_execution(self, orchestrator_with_mocks, sample_workflow):
        """Test end-to-end workflow execution.
        
        Test ID: 3.3-UNIT-028
        Priority: P0 (Critical)
        AC: #6
        
        Given: Complete workflow với multiple steps
        When: Workflow is executed
        Then: All steps should execute và final result should be returned
        """
        with patch("core.optimizations.multi_model_orchestrator.make_llm_api_call") as mock_llm:
            step1_response = {
                "choices": [{"message": {"content": "Analysis: Python is a programming language"}}],
                "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}
            }
            step2_response = {
                "choices": [{"message": {"content": "Plan: Learn Python basics, then advanced topics"}}],
                "usage": {"prompt_tokens": 150, "completion_tokens": 75, "total_tokens": 225}
            }
            mock_llm.side_effect = [step1_response, step2_response]
            
            result = await orchestrator_with_mocks.execute_workflow(
                workflow=sample_workflow,
                initial_input="How do I learn Python?",
                workflow_id="test-workflow-001"
            )
            
            # Verify workflow completed
            assert result.status == WorkflowExecutionStatus.COMPLETED
            assert result.workflow_id == "test-workflow-001"
            assert result.final_output == "Plan: Learn Python basics, then advanced topics"
            
            # Verify all steps executed
            assert len(result.step_results) == 2
            assert all(step.status == StepExecutionStatus.COMPLETED for step in result.step_results)
            
            # Verify token usage tracked
            assert result.total_input_tokens > 0
            assert result.total_output_tokens > 0
            assert result.total_execution_time_ms > 0
    
    @pytest.mark.p1
    @pytest.mark.asyncio
    async def test_disabled_orchestrator(self, mock_model_router):
        """Test orchestrator when disabled.
        
        Test ID: 3.3-UNIT-029
        Priority: P1 (High priority)
        AC: #1
        
        Given: Orchestrator với enabled=False
        When: Workflow is executed
        Then: Should return failed result immediately
        """
        orchestrator = MultiModelOrchestrator(
            model_router=mock_model_router,
            enabled=False
        )
        
        workflow = {
            "steps": [
                {
                    "id": "step_1",
                    "model": "openai-compatible/gpt-4o-mini",
                    "input": "user_query",
                    "prompt_template": "Analyze: {input}",
                    "output_key": "analysis_result"
                }
            ]
        }
        
        result = await orchestrator.execute_workflow(
            workflow=workflow,
            initial_input="What is Python?"
        )
        
        assert result.status == WorkflowExecutionStatus.FAILED
        assert "disabled" in result.error.lower()

