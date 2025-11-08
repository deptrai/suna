"""
Model Selection Rules (Story 3.2).

This module implements model selection rules based on task complexity to route tasks
to optimal models, achieving 40-50% cost reduction với acceptable quality trade-off.

Features:
- Complexity-based routing: Map complexity levels to optimal models
- Model selection logic: Prefer cheaper models, consider availability và capabilities
- Fallback mechanism: Next best model if selected model fails
- Cost tracking: Measure và track cost savings (target: 40-50%)
- Logging và monitoring: Track routing decisions và metrics
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, Any, Optional, List, Tuple
import uuid

from core.utils.logger import logger
from core.utils.config import OptimizationConfig, OptimizationMode
from core.optimizations.task_classifier import (
    TaskClassifier,
    ComplexityLevel,
    ClassificationResult,
    get_task_classifier
)
from core.ai_models.registry import ModelRegistry, registry
from core.ai_models.ai_models import Model, ModelCapability


class RoutingDecision(str, Enum):
    """Routing decision enumeration."""
    ROUTED = "routed"  # Successfully routed to model
    FALLBACK = "fallback"  # Fallback to alternative model
    DEFAULT = "default"  # Used default model (routing unavailable)


@dataclass
class RoutingResult:
    """Represents a model routing result."""
    model_id: str
    complexity: ComplexityLevel
    confidence: float
    decision: RoutingDecision
    fallback_used: bool = False
    routing_metadata: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    routing_id: Optional[str] = None  # Unique ID for tracking token usage later (Story 3.2 enhancement)


@dataclass
class RoutingMetrics:
    """Metrics for tracking routing performance."""
    total_routings: int = 0
    routings_by_complexity: Dict[ComplexityLevel, int] = field(default_factory=lambda: {
        ComplexityLevel.SIMPLE: 0,
        ComplexityLevel.MEDIUM: 0,
        ComplexityLevel.COMPLEX: 0,
        ComplexityLevel.VERY_COMPLEX: 0,
    })
    routings_by_model: Dict[str, int] = field(default_factory=dict)
    fallback_count: int = 0
    cost_savings_percentage: float = 0.0
    total_cost_before: float = 0.0
    total_cost_after: float = 0.0
    # Story 3.2 enhancement: Actual token tracking
    total_input_tokens: int = 0  # Actual input tokens from LLM responses
    total_output_tokens: int = 0  # Actual output tokens from LLM responses
    routings_with_token_data: int = 0  # Count of routings with actual token data


class ModelRouter:
    """
    Model router based on task complexity.
    
    Routes tasks to optimal models based on complexity classification,
    achieving 40-50% cost reduction với acceptable quality trade-off (80-85%).
    
    Routing Rules:
    - simple → gpt-4o-mini, qwen3-30b (cheap models)
    - medium → deepseek-v3-1, claude-haiku-4-5 (balanced models)
    - complex → qwen3-235b (powerful but cheaper)
    - very_complex → gpt-4o, claude-sonnet (premium models)
    
    Features:
    - Complexity-based routing
    - Model selection logic (prefer cheaper, consider availability, capabilities)
    - Fallback mechanism
    - Cost tracking
    - Logging và monitoring
    """
    
    # Routing rules: Map complexity levels to model IDs (ordered by preference)
    ROUTING_RULES: Dict[ComplexityLevel, List[str]] = {
        ComplexityLevel.SIMPLE: [
            "openai-compatible/gpt-4o-mini",  # Cheapest, prefer this
            "openai-compatible/qwen3-30b-a3b-instruct-2507",  # Alternative cheap model
        ],
        ComplexityLevel.MEDIUM: [
            "openai-compatible/deepseek-v3-1",  # Balanced, prefer this
            "anthropic/claude-haiku-4-5",  # Alternative balanced model
        ],
        ComplexityLevel.COMPLEX: [
            "openai-compatible/qwen3-235b-a22b",  # Powerful but cheaper than premium
        ],
        ComplexityLevel.VERY_COMPLEX: [
            "anthropic/claude-sonnet-4-5-20250929",  # Premium, prefer this
            "anthropic/claude-sonnet-4-20250514",  # Alternative premium model
        ],
    }
    
    def __init__(
        self,
        task_classifier: Optional[TaskClassifier] = None,
        model_registry: Optional[ModelRegistry] = None,
        enabled: bool = True
    ):
        """
        Initialize ModelRouter.
        
        Args:
            task_classifier: TaskClassifier instance (uses global singleton if None)
            model_registry: ModelRegistry instance (uses global registry if None)
            enabled: Whether routing is enabled
        """
        self.task_classifier = task_classifier or get_task_classifier()
        self.model_registry = model_registry or registry
        self.enabled = enabled
        self.metrics = RoutingMetrics()
        self._round_robin_index: Dict[ComplexityLevel, int] = {
            ComplexityLevel.SIMPLE: 0,
            ComplexityLevel.MEDIUM: 0,
            ComplexityLevel.COMPLEX: 0,
            ComplexityLevel.VERY_COMPLEX: 0,
        }
        # Story 3.2 enhancement: Track routing decisions for token usage updates
        self._active_routings: Dict[str, Dict[str, Any]] = {}  # routing_id -> {model_id, complexity, timestamp}
    
    @staticmethod
    def get_routing_rules() -> Dict[ComplexityLevel, List[str]]:
        """
        Get routing rules mapping complexity levels to models.
        
        Returns:
            Dict mapping ComplexityLevel to list of model IDs (ordered by preference)
        """
        return ModelRouter.ROUTING_RULES.copy()
    
    @staticmethod
    def get_routing_decision_matrix() -> Dict[str, Any]:
        """
        Get routing decision matrix for documentation.
        
        Returns:
            Dict with routing decision matrix
        """
        return {
            "simple": {
                "models": ["openai-compatible/gpt-4o-mini", "openai-compatible/qwen3-30b-a3b-instruct-2507"],
                "rationale": "Cheap models for simple tasks. Prefer gpt-4o-mini (cheapest).",
                "expected_cost_reduction": "60-70%",
                "quality_impact": "Minimal (simple tasks don't require premium models)"
            },
            "medium": {
                "models": ["openai-compatible/deepseek-v3-1", "anthropic/claude-haiku-4-5"],
                "rationale": "Balanced models for medium complexity tasks. Prefer deepseek-v3-1 (good balance).",
                "expected_cost_reduction": "40-50%",
                "quality_impact": "5-10% (acceptable trade-off)"
            },
            "complex": {
                "models": ["openai-compatible/qwen3-235b-a22b"],
                "rationale": "Powerful model but cheaper than premium. Good for complex tasks.",
                "expected_cost_reduction": "30-40%",
                "quality_impact": "10-15% (acceptable for cost savings)"
            },
            "very_complex": {
                "models": ["anthropic/claude-sonnet-4-5-20250929", "anthropic/claude-sonnet-4-20250514"],
                "rationale": "Premium models for very complex tasks. Quality is critical.",
                "expected_cost_reduction": "0-10%",
                "quality_impact": "Minimal (premium models maintain quality)"
            }
        }
    
    def _get_available_models_for_complexity(
        self,
        complexity: ComplexityLevel,
        required_capabilities: Optional[List[ModelCapability]] = None
    ) -> List[Model]:
        """
        Get available models for a complexity level.
        
        Args:
            complexity: Complexity level
            required_capabilities: Optional list of required capabilities
        
        Returns:
            List of available Model objects (enabled, accessible)
        """
        model_ids = self.ROUTING_RULES.get(complexity, [])
        available_models = []
        
        for model_id in model_ids:
            model = self.model_registry.get(model_id)
            if model and model.enabled:
                # Check capabilities if required
                if required_capabilities:
                    if all(cap in model.capabilities for cap in required_capabilities):
                        available_models.append(model)
                else:
                    available_models.append(model)
        
        return available_models
    
    def _select_best_model(
        self,
        models: List[Model],
        complexity: ComplexityLevel,
        prefer_cheaper: bool = True
    ) -> Optional[Model]:
        """
        Select best model from available models.
        
        Selection logic:
        1. Prefer cheaper model if multiple models match (if prefer_cheaper=True)
        2. Consider model availability (already filtered)
        3. Consider model capabilities (already filtered)
        4. Use round-robin if all factors equal (for load balancing)
        
        Args:
            models: List of available models
            complexity: Complexity level for round-robin tracking
            prefer_cheaper: Whether to prefer cheaper models
        
        Returns:
            Selected Model or None if no models available
        """
        if not models:
            return None
        
        if len(models) == 1:
            return models[0]
        
        # Filter models with pricing information
        models_with_pricing = [m for m in models if m.pricing]
        models_without_pricing = [m for m in models if not m.pricing]
        
        # If prefer_cheaper and we have pricing info, sort by input cost
        if prefer_cheaper and models_with_pricing:
            # Sort by input cost per million tokens (cheaper first)
            sorted_models = sorted(
                models_with_pricing,
                key=lambda m: m.pricing.input_cost_per_million_tokens
            )
            
            # Group models by cost (for round-robin when costs are equal)
            cost_groups: Dict[float, List[Model]] = {}
            for model in sorted_models:
                cost = model.pricing.input_cost_per_million_tokens
                if cost not in cost_groups:
                    cost_groups[cost] = []
                cost_groups[cost].append(model)
            
            # Get cheapest cost group
            cheapest_cost = min(cost_groups.keys())
            cheapest_models = cost_groups[cheapest_cost]
            
            # If multiple models have same cost, use round-robin
            if len(cheapest_models) > 1:
                idx = self._round_robin_index[complexity] % len(cheapest_models)
                selected_model = cheapest_models[idx]
                # Update round-robin index for next selection
                self._round_robin_index[complexity] = (idx + 1) % len(cheapest_models)
                return selected_model
            
            # Single cheapest model
            return cheapest_models[0]
        
        # If no pricing info or prefer_cheaper=False, use priority và recommended
        # Sort by priority (higher first), then recommended (True first)
        sorted_models = sorted(
            models,
            key=lambda m: (-m.priority, not m.recommended)
        )
        
        # Group models by priority and recommended status (for round-robin when equal)
        priority_groups: Dict[Tuple[int, bool], List[Model]] = {}
        for model in sorted_models:
            key = (model.priority, model.recommended)
            if key not in priority_groups:
                priority_groups[key] = []
            priority_groups[key].append(model)
        
        # Get highest priority group
        highest_priority = max(priority_groups.keys(), key=lambda k: (k[0], k[1]))
        highest_priority_models = priority_groups[highest_priority]
        
        # If multiple models have same priority and recommended status, use round-robin
        if len(highest_priority_models) > 1:
            idx = self._round_robin_index[complexity] % len(highest_priority_models)
            selected_model = highest_priority_models[idx]
            # Update round-robin index for next selection
            self._round_robin_index[complexity] = (idx + 1) % len(highest_priority_models)
            return selected_model
        
        # Single highest priority model
        return highest_priority_models[0]
    
    async def route(
        self,
        task: str,
        user_id: Optional[str] = None,
        required_capabilities: Optional[List[ModelCapability]] = None,
        fallback_on_failure: bool = True
    ) -> RoutingResult:
        """
        Route task to optimal model based on complexity.
        
        Args:
            task: Task text to route
            user_id: Optional user ID for context
            required_capabilities: Optional list of required model capabilities
            fallback_on_failure: Whether to use fallback if routing fails
        
        Returns:
            RoutingResult with selected model và routing metadata
        """
        if not self.enabled:
            # Return default routing if disabled
            default_model = self.model_registry.get("openai-compatible/gpt-4o-mini")
            if not default_model:
                # Fallback to first available model
                all_models = self.model_registry.get_all(enabled_only=True)
                default_model = all_models[0] if all_models else None
            
            return RoutingResult(
                model_id=default_model.id if default_model else "unknown",
                complexity=ComplexityLevel.SIMPLE,
                confidence=1.0,
                decision=RoutingDecision.DEFAULT,
                routing_metadata={"enabled": False}
            )
        
        # Classify task complexity
        try:
            classification_result = await self.task_classifier.classify(task)
            complexity = classification_result.complexity
            confidence = classification_result.confidence
        except Exception as e:
            logger.warning(f"Task classification failed: {e}, using default routing")
            # Fallback to default model
            default_model = self.model_registry.get("openai-compatible/gpt-4o-mini")
            return RoutingResult(
                model_id=default_model.id if default_model else "unknown",
                complexity=ComplexityLevel.SIMPLE,
                confidence=0.0,
                decision=RoutingDecision.DEFAULT,
                routing_metadata={"classification_error": str(e)}
            )
        
        # Get available models for complexity level
        available_models = self._get_available_models_for_complexity(
            complexity,
            required_capabilities
        )
        
        if not available_models:
            logger.warning(
                f"No available models for complexity {complexity.value}, "
                f"falling back to default model"
            )
            # Fallback to default model
            default_model = self.model_registry.get("openai-compatible/gpt-4o-mini")
            return RoutingResult(
                model_id=default_model.id if default_model else "unknown",
                complexity=complexity,
                confidence=confidence,
                decision=RoutingDecision.DEFAULT,
                routing_metadata={"no_models_available": True}
            )
        
        # Select best model (with round-robin support)
        selected_model = self._select_best_model(available_models, complexity, prefer_cheaper=True)
        
        if not selected_model:
            logger.warning(f"Model selection failed for complexity {complexity.value}")
            # Fallback to default
            default_model = self.model_registry.get("openai-compatible/gpt-4o-mini")
            return RoutingResult(
                model_id=default_model.id if default_model else "unknown",
                complexity=complexity,
                confidence=confidence,
                decision=RoutingDecision.DEFAULT,
                routing_metadata={"selection_failed": True}
            )
        
        # Generate unique routing ID for token usage tracking (Story 3.2 enhancement)
        routing_id = str(uuid.uuid4())
        
        # Store routing information for later token usage update
        self._active_routings[routing_id] = {
            "model_id": selected_model.id,
            "complexity": complexity,
            "timestamp": datetime.now(timezone.utc),
            "baseline_model_id": "anthropic/claude-sonnet-4-5-20250929"  # Premium baseline
        }
        
        # Update metrics
        self.metrics.total_routings += 1
        self.metrics.routings_by_complexity[complexity] += 1
        self.metrics.routings_by_model[selected_model.id] = (
            self.metrics.routings_by_model.get(selected_model.id, 0) + 1
        )
        
        # Calculate estimated cost savings (will be updated with actual tokens later)
        # Baseline: Assume all requests would use premium model (claude-sonnet-4-5)
        baseline_model = self.model_registry.get("anthropic/claude-sonnet-4-5-20250929")
        if baseline_model and baseline_model.pricing and selected_model.pricing:
            # Estimate cost for baseline model (using average input/output ratio)
            # Note: This is an estimate - actual cost will be calculated when token usage is available
            baseline_cost_estimate = (
                baseline_model.pricing.input_cost_per_million_tokens +
                baseline_model.pricing.output_cost_per_million_tokens
            ) / 2
            
            selected_cost_estimate = (
                selected_model.pricing.input_cost_per_million_tokens +
                selected_model.pricing.output_cost_per_million_tokens
            ) / 2
            
            # Note: We don't update total_cost_before/total_cost_after here with estimates
            # Actual costs will be updated when token usage is available via update_cost_with_tokens()
            # We only update cost_savings_percentage based on estimates for routings without token data
            # When actual tokens are available, cost_savings_percentage will be recalculated based on actual costs
        
        # Log routing decision
        logger.info(
            f"✅ Routed task to {selected_model.id} "
            f"(complexity={complexity.value}, confidence={confidence:.2f})"
        )
        
        # Track routing decision in quality monitor
        try:
            from core.optimizations.quality_monitor import get_quality_monitor
            quality_monitor = get_quality_monitor()
            await quality_monitor.track_metric(
                "model_routing_decision",
                value=1.0,
                metadata={
                    "model_id": selected_model.id,
                    "complexity": complexity.value,
                    "confidence": confidence,
                    "task_length": len(task.split()),
                }
            )
        except Exception as e:
            logger.warning(f"Failed to track routing decision in quality monitor: {e}")
        
        return RoutingResult(
            model_id=selected_model.id,
            complexity=complexity,
            confidence=confidence,
            decision=RoutingDecision.ROUTED,
            routing_id=routing_id,  # Story 3.2 enhancement: Include routing_id for token tracking
            routing_metadata={
                "model_name": selected_model.name,
                "model_provider": selected_model.provider.value,
                "available_models_count": len(available_models),
                "selected_model_pricing": {
                    "input_cost_per_million": selected_model.pricing.input_cost_per_million_tokens if selected_model.pricing else None,
                    "output_cost_per_million": selected_model.pricing.output_cost_per_million_tokens if selected_model.pricing else None,
                } if selected_model.pricing else None,
            }
        )
    
    async def route_with_fallback(
        self,
        task: str,
        user_id: Optional[str] = None,
        required_capabilities: Optional[List[ModelCapability]] = None,
        failed_model_id: Optional[str] = None
    ) -> RoutingResult:
        """
        Route task với fallback mechanism.
        
        If selected model fails, fallback to next best model based on complexity.
        
        Args:
            task: Task text to route
            user_id: Optional user ID for context
            required_capabilities: Optional list of required model capabilities
            failed_model_id: ID of model that failed (to avoid selecting it again)
        
        Returns:
            RoutingResult with selected model (possibly fallback)
        """
        # First, try normal routing
        routing_result = await self.route(
            task,
            user_id,
            required_capabilities,
            fallback_on_failure=False
        )
        
        # If we have a failed model ID và it matches the selected model, find alternative
        if failed_model_id and routing_result.model_id == failed_model_id:
            logger.warning(
                f"Selected model {failed_model_id} failed, finding fallback..."
            )
            
            # Get available models for complexity (excluding failed model)
            available_models = self._get_available_models_for_complexity(
                routing_result.complexity,
                required_capabilities
            )
            available_models = [
                m for m in available_models if m.id != failed_model_id
            ]
            
            if available_models:
                # Select next best model (with round-robin support)
                fallback_model = self._select_best_model(available_models, routing_result.complexity, prefer_cheaper=True)
                
                if fallback_model:
                    # Update metrics
                    self.metrics.fallback_count += 1
                    
                    logger.info(
                        f"✅ Fallback to {fallback_model.id} "
                        f"(original: {failed_model_id})"
                    )
                    
                    # Track fallback in quality monitor
                    try:
                        from core.optimizations.quality_monitor import get_quality_monitor
                        quality_monitor = get_quality_monitor()
                        await quality_monitor.track_metric(
                            "model_routing_fallback",
                            value=1.0,
                            metadata={
                                "original_model": failed_model_id,
                                "fallback_model": fallback_model.id,
                                "complexity": routing_result.complexity.value,
                            }
                        )
                    except Exception as e:
                        logger.warning(f"Failed to track fallback in quality monitor: {e}")
                    
                    # Story 3.2 enhancement: Update active_routings với fallback model if routing_id exists
                    if routing_result.routing_id and routing_result.routing_id in self._active_routings:
                        # Update the routing entry to point to fallback model
                        self._active_routings[routing_result.routing_id]["model_id"] = fallback_model.id
                        logger.debug(
                            f"Updated routing_id {routing_result.routing_id} to use fallback model {fallback_model.id}"
                        )
                    
                    return RoutingResult(
                        model_id=fallback_model.id,
                        complexity=routing_result.complexity,
                        confidence=routing_result.confidence,
                        decision=RoutingDecision.FALLBACK,
                        fallback_used=True,
                        routing_id=routing_result.routing_id,  # Reuse routing_id from original routing
                        routing_metadata={
                            **routing_result.routing_metadata,
                            "original_model": failed_model_id,
                            "fallback_reason": "model_failure",
                        }
                    )
        
        return routing_result
    
    def get_metrics(self) -> Dict[str, Any]:
        """
        Get routing metrics.
        
        Returns:
            Dict with routing metrics
        """
        total = self.metrics.total_routings
        distribution_percentage = {
            level.value: (
                (count / total * 100) if total > 0 else 0.0
            )
            for level, count in self.metrics.routings_by_complexity.items()
        }
        
        return {
            "total_routings": self.metrics.total_routings,
            "routings_by_complexity": {
                level.value: count
                for level, count in self.metrics.routings_by_complexity.items()
            },
            "distribution_percentage": distribution_percentage,
            "routings_by_model": self.metrics.routings_by_model,
            "fallback_count": self.metrics.fallback_count,
            "fallback_rate": (
                (self.metrics.fallback_count / total * 100) if total > 0 else 0.0
            ),
            "cost_savings_percentage": self.metrics.cost_savings_percentage,
            "total_cost_before": self.metrics.total_cost_before,
            "total_cost_after": self.metrics.total_cost_after,
            # Story 3.2 enhancement: Actual token tracking
            "total_input_tokens": self.metrics.total_input_tokens,
            "total_output_tokens": self.metrics.total_output_tokens,
            "routings_with_token_data": self.metrics.routings_with_token_data,
            "token_data_coverage": (
                (self.metrics.routings_with_token_data / total * 100) if total > 0 else 0.0
            ),
        }
    
    def update_cost_with_tokens(
        self,
        routing_id: str,
        input_tokens: int,
        output_tokens: int
    ) -> None:
        """
        Update cost metrics with actual token usage (Story 3.2 enhancement).
        
        This method should be called after LLM API call completes với actual token usage.
        
        Args:
            routing_id: Unique routing ID from RoutingResult
            input_tokens: Actual input tokens from LLM response
            output_tokens: Actual output tokens from LLM response
        """
        if routing_id not in self._active_routings:
            logger.debug(f"Routing ID {routing_id} not found in active routings (may have expired)")
            return
        
        routing_info = self._active_routings[routing_id]
        model_id = routing_info["model_id"]
        baseline_model_id = routing_info["baseline_model_id"]
        
        # Get model và baseline model from registry
        selected_model = self.model_registry.get(model_id)
        baseline_model = self.model_registry.get(baseline_model_id)
        
        if not selected_model or not selected_model.pricing:
            logger.debug(f"Model {model_id} not found or has no pricing info")
            # Clean up routing info
            del self._active_routings[routing_id]
            return
        
        if not baseline_model or not baseline_model.pricing:
            logger.debug(f"Baseline model {baseline_model_id} not found or has no pricing info")
            # Clean up routing info
            del self._active_routings[routing_id]
            return
        
        # Calculate actual costs based on token usage
        # Cost = (input_tokens / 1_000_000) * input_cost_per_million + (output_tokens / 1_000_000) * output_cost_per_million
        baseline_cost = (
            (input_tokens / 1_000_000) * baseline_model.pricing.input_cost_per_million_tokens +
            (output_tokens / 1_000_000) * baseline_model.pricing.output_cost_per_million_tokens
        )
        
        selected_cost = (
            (input_tokens / 1_000_000) * selected_model.pricing.input_cost_per_million_tokens +
            (output_tokens / 1_000_000) * selected_model.pricing.output_cost_per_million_tokens
        )
        
        # Update metrics với actual token data
        self.metrics.total_input_tokens += input_tokens
        self.metrics.total_output_tokens += output_tokens
        self.metrics.routings_with_token_data += 1
        
        # Recalculate cost savings percentage based on actual tokens
        if baseline_cost > 0:
            cost_savings = ((baseline_cost - selected_cost) / baseline_cost) * 100
            
            # Update running average of cost savings (only for routings with token data)
            if self.metrics.routings_with_token_data == 1:
                self.metrics.cost_savings_percentage = cost_savings
            else:
                # Weighted average based on actual cost difference
                # Weight by cost difference (larger savings have more weight)
                previous_avg = self.metrics.cost_savings_percentage
                cost_diff_weight = abs(baseline_cost - selected_cost)
                
                # Simple weighted average (can be improved)
                self.metrics.cost_savings_percentage = (
                    (previous_avg * (self.metrics.routings_with_token_data - 1) + cost_savings) /
                    self.metrics.routings_with_token_data
                )
            
            # Update total cost metrics (replace estimated with actual)
            # Note: We subtract the estimated cost and add actual cost
            # Since we can't easily track which estimated cost to subtract, we'll track actual separately
            # For now, we'll accumulate actual costs (this is more accurate)
            self.metrics.total_cost_before += baseline_cost
            self.metrics.total_cost_after += selected_cost
            
            logger.debug(
                f"💰 Updated cost metrics với actual tokens - routing_id={routing_id}, "
                f"input_tokens={input_tokens}, output_tokens={output_tokens}, "
                f"baseline_cost=${baseline_cost:.6f}, selected_cost=${selected_cost:.6f}, "
                f"savings={cost_savings:.2f}%"
            )
        
        # Clean up routing info (optional - can keep for a TTL if needed)
        del self._active_routings[routing_id]
    
    def reset_metrics(self) -> None:
        """Reset routing metrics."""
        self.metrics = RoutingMetrics()
        self._active_routings.clear()  # Clear active routings when resetting metrics
        logger.info("ModelRouter metrics reset")


# Global ModelRouter instance
_model_router_instance: Optional[ModelRouter] = None


def get_model_router() -> ModelRouter:
    """
    Get global ModelRouter instance (singleton).
    
    Returns:
        ModelRouter instance
    """
    global _model_router_instance
    
    if _model_router_instance is None:
        from core.utils.config import config
        
        # Load configuration
        routing_enabled = getattr(config, "MODEL_ROUTING_ENABLED", True)
        
        _model_router_instance = ModelRouter(enabled=routing_enabled)
        
        logger.info("Global ModelRouter instance created")
    
    return _model_router_instance


def set_model_router(instance: ModelRouter) -> None:
    """
    Set global ModelRouter instance (for testing).
    
    Args:
        instance: ModelRouter instance
    """
    global _model_router_instance
    _model_router_instance = instance

