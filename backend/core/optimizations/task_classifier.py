"""
Task Complexity Classification (Story 3.1).

This module implements task complexity classification to route tasks to appropriate
models based on complexity level, optimizing cost/quality trade-offs.

Features:
- Complexity levels: simple, medium, complex, very_complex
- Rule-based classification algorithm (fast, efficient)
- LLM-based classification option (more accurate, slower)
- Classification accuracy tracking
- Integration with model routing (Story 3.2)
- Logging and monitoring integration
"""

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, Any, Optional, List
import asyncio

from core.utils.logger import logger
from core.utils.config import OptimizationConfig, OptimizationMode


class ComplexityLevel(str, Enum):
    """Complexity level enumeration."""
    SIMPLE = "simple"
    MEDIUM = "medium"
    COMPLEX = "complex"
    VERY_COMPLEX = "very_complex"


@dataclass
class ClassificationResult:
    """Represents a task complexity classification result."""
    complexity: ComplexityLevel
    confidence: float  # 0.0-1.0
    task: str
    metadata: Dict[str, Any]
    timestamp: datetime


@dataclass
class ClassificationMetrics:
    """Metrics for tracking classification performance."""
    total_classifications: int = 0
    classifications_by_level: Dict[ComplexityLevel, int] = None
    average_confidence: float = 0.0
    total_confidence: float = 0.0
    
    def __post_init__(self):
        if self.classifications_by_level is None:
            self.classifications_by_level = {
                ComplexityLevel.SIMPLE: 0,
                ComplexityLevel.MEDIUM: 0,
                ComplexityLevel.COMPLEX: 0,
                ComplexityLevel.VERY_COMPLEX: 0,
            }


class TaskClassifier:
    """
    Task complexity classifier.
    
    Classifies tasks into complexity levels (simple, medium, complex, very_complex)
    based on task characteristics (length, keywords, intent, etc.).
    
    Features:
    - Rule-based classification (default, fast)
    - LLM-based classification (optional, more accurate)
    - Classification accuracy tracking
    - Logging and monitoring integration
    """
    
    # Complexity level criteria
    SIMPLE_MAX_WORDS = 50
    MEDIUM_MAX_WORDS = 150
    COMPLEX_MAX_WORDS = 300
    MAX_TASK_LENGTH = 10000  # Maximum task length in words to prevent DoS
    
    # Keywords for complexity detection
    SIMPLE_KEYWORDS = [
        "what is", "what's", "explain briefly", "tell me", "define",
        "who is", "when is", "where is", "how to"
    ]
    
    MEDIUM_KEYWORDS = [
        "explain", "compare", "describe", "list", "summarize",
        "discuss", "outline"
    ]
    
    COMPLEX_KEYWORDS = [
        "analyze", "evaluate", "create", "design", "develop",
        "implement", "optimize", "recommend", "propose", "synthesize"
    ]
    
    VERY_COMPLEX_KEYWORDS = [
        "research", "plan", "execute", "synthesize", "orchestrate",
        "multi-step", "workflow", "pipeline", "architecture"
    ]
    
    # Multi-step indicators
    MULTI_STEP_INDICATORS = [
        "then", "next", "after", "followed by", "subsequently",
        "first", "second", "third", "finally", "lastly",
        "step 1", "step 2", "step 3", "phase 1", "phase 2"
    ]
    
    def __init__(
        self,
        classification_method: str = "rule-based",
        llm_model: Optional[str] = None,
        enabled: bool = True
    ):
        """
        Initialize TaskClassifier.
        
        Args:
            classification_method: Classification method ("rule-based" or "llm-based")
            llm_model: LLM model to use for LLM-based classification (default: gpt-4o-mini)
            enabled: Whether classification is enabled
        """
        self.classification_method = classification_method
        self.llm_model = llm_model or "openai-compatible/gpt-4o-mini"
        self.enabled = enabled
        
        # Metrics
        self.metrics = ClassificationMetrics()
        
        logger.info(
            f"TaskClassifier initialized: method={classification_method}, "
            f"enabled={enabled}, llm_model={llm_model}"
        )
    
    @staticmethod
    def get_complexity_level_criteria() -> Dict[str, Dict[str, Any]]:
        """
        Get complexity level criteria definitions.
        
        Returns:
            Dictionary with complexity level criteria
        """
        return {
            "simple": {
                "max_words": 50,
                "description": "Short queries (<50 words), single intent, no complex reasoning",
                "examples": [
                    "What is Python?",
                    "Explain Y briefly",
                    "Tell me about X",
                    "Define Z"
                ],
                "characteristics": [
                    "Single intent",
                    "No complex reasoning",
                    "Direct questions",
                    "Simple definitions"
                ]
            },
            "medium": {
                "max_words": 150,
                "description": "Moderate length (50-150 words), multiple intents, basic reasoning",
                "examples": [
                    "Explain X and Y",
                    "Compare A with B",
                    "Describe the differences between X and Y",
                    "List the main features of Z"
                ],
                "characteristics": [
                    "Multiple intents",
                    "Basic reasoning",
                    "Comparison tasks",
                    "Moderate complexity"
                ]
            },
            "complex": {
                "max_words": 300,
                "description": "Long queries (150-300 words), complex reasoning, multi-step tasks",
                "examples": [
                    "Analyze X, compare with Y, and provide recommendations",
                    "Design a solution for problem Z with multiple steps",
                    "Evaluate the pros and cons of approach A and B"
                ],
                "characteristics": [
                    "Complex reasoning",
                    "Multi-step tasks",
                    "Analysis and evaluation",
                    "Requires synthesis"
                ]
            },
            "very_complex": {
                "max_words": None,  # >300 words
                "description": "Very long queries (>300 words), advanced reasoning, multi-model workflows",
                "examples": [
                    "Research X, create plan, execute, synthesize",
                    "Design architecture, implement solution, test, deploy",
                    "Analyze multiple scenarios, compare approaches, recommend strategy"
                ],
                "characteristics": [
                    "Advanced reasoning",
                    "Multi-model workflows",
                    "Multiple phases",
                    "Requires orchestration"
                ]
            }
        }
    
    def _count_words(self, text: str) -> int:
        """
        Count words in text.
        
        Args:
            text: Input text
        
        Returns:
            Word count
        """
        # Remove extra whitespace and split
        words = text.strip().split()
        return len(words)
    
    def _detect_keywords(self, text: str, keywords: List[str]) -> int:
        """
        Detect keyword matches in text (case-insensitive).
        
        Args:
            text: Input text
            keywords: List of keywords to search for
        
        Returns:
            Number of keyword matches
        """
        text_lower = text.lower()
        matches = 0
        for keyword in keywords:
            if keyword.lower() in text_lower:
                matches += 1
        return matches
    
    def _detect_multi_step(self, text: str) -> bool:
        """
        Detect if task involves multiple steps.
        
        Args:
            text: Input text
        
        Returns:
            True if multi-step task detected
        """
        text_lower = text.lower()
        for indicator in self.MULTI_STEP_INDICATORS:
            if indicator in text_lower:
                return True
        return False
    
    def _detect_complex_reasoning(self, text: str) -> bool:
        """
        Detect if task requires complex reasoning.
        
        Args:
            text: Input text
        
        Returns:
            True if complex reasoning required
        """
        # Check for complex reasoning indicators
        complex_indicators = [
            "analyze", "evaluate", "synthesize", "optimize",
            "recommend", "propose", "design", "architecture",
            "workflow", "pipeline", "orchestrate"
        ]
        
        text_lower = text.lower()
        for indicator in complex_indicators:
            if indicator in text_lower:
                return True
        
        return False
    
    def _rule_based_classify(self, task: str) -> ClassificationResult:
        """
        Classify task complexity using rule-based algorithm.
        
        Args:
            task: Task text to classify
        
        Returns:
            ClassificationResult with complexity level and confidence
        """
        word_count = self._count_words(task)
        
        # Calculate keyword scores
        simple_score = self._detect_keywords(task, self.SIMPLE_KEYWORDS)
        medium_score = self._detect_keywords(task, self.MEDIUM_KEYWORDS)
        complex_score = self._detect_keywords(task, self.COMPLEX_KEYWORDS)
        very_complex_score = self._detect_keywords(task, self.VERY_COMPLEX_KEYWORDS)
        
        # Detect multi-step and complex reasoning
        is_multi_step = self._detect_multi_step(task)
        requires_complex_reasoning = self._detect_complex_reasoning(task)
        
        # Classification logic
        complexity: ComplexityLevel
        confidence: float = 0.0
        metadata: Dict[str, Any] = {
            "word_count": word_count,
            "simple_score": simple_score,
            "medium_score": medium_score,
            "complex_score": complex_score,
            "very_complex_score": very_complex_score,
            "is_multi_step": is_multi_step,
            "requires_complex_reasoning": requires_complex_reasoning,
        }
        
        # Improved classification algorithm for better accuracy
        # Very complex: >300 words OR (very_complex keywords + (multi-step OR complex reasoning))
        if word_count > self.COMPLEX_MAX_WORDS:
            complexity = ComplexityLevel.VERY_COMPLEX
            confidence = 0.95  # High confidence for very long tasks
        elif very_complex_score > 0 and (is_multi_step or requires_complex_reasoning):
            complexity = ComplexityLevel.VERY_COMPLEX
            confidence = 0.9  # High confidence when keywords match indicators
        elif very_complex_score >= 2:  # Multiple very_complex keywords
            complexity = ComplexityLevel.VERY_COMPLEX
            confidence = 0.85
        
        # Complex: 150-300 words OR (complex keywords + (multi-step OR reasoning)) OR high complex keyword score
        elif word_count > self.MEDIUM_MAX_WORDS:
            # Long tasks are more likely to be complex
            if complex_score > 0 or requires_complex_reasoning:
                complexity = ComplexityLevel.COMPLEX
                confidence = 0.9  # Higher confidence when indicators match
            elif is_multi_step:
                complexity = ComplexityLevel.COMPLEX
                confidence = 0.85
            else:
                complexity = ComplexityLevel.COMPLEX
                confidence = 0.8  # Default for long tasks
        elif complex_score > 0 and (is_multi_step or requires_complex_reasoning):
            complexity = ComplexityLevel.COMPLEX
            confidence = 0.85
        elif complex_score >= 2:  # Multiple complex keywords
            complexity = ComplexityLevel.COMPLEX
            confidence = 0.8
        
        # Medium: 50-150 words OR (medium keywords AND (not simple keywords OR multi-intent indicators))
        elif word_count > self.SIMPLE_MAX_WORDS:
            # Medium-length tasks
            if medium_score > 0:
                complexity = ComplexityLevel.MEDIUM
                confidence = 0.85  # Higher confidence when keywords match
            elif complex_score > 0:
                # Some complex keywords but not enough indicators -> medium
                complexity = ComplexityLevel.MEDIUM
                confidence = 0.75
            else:
                complexity = ComplexityLevel.MEDIUM
                confidence = 0.8
        elif medium_score > 0:
            complexity = ComplexityLevel.MEDIUM
            confidence = 0.8
        
        # Simple: <50 words, simple keywords, single intent
        else:
            complexity = ComplexityLevel.SIMPLE
            if simple_score > 0:
                confidence = 0.95  # Very high confidence when simple keywords match
            else:
                confidence = 0.85  # High confidence for short tasks
        
        # Adjust confidence based on keyword matches
        if simple_score > 0 and complexity == ComplexityLevel.SIMPLE:
            confidence = min(0.95, confidence + 0.1)
        elif medium_score > 0 and complexity == ComplexityLevel.MEDIUM:
            confidence = min(0.95, confidence + 0.1)
        elif complex_score > 0 and complexity == ComplexityLevel.COMPLEX:
            confidence = min(0.95, confidence + 0.1)
        elif very_complex_score > 0 and complexity == ComplexityLevel.VERY_COMPLEX:
            confidence = min(0.95, confidence + 0.1)
        
        return ClassificationResult(
            complexity=complexity,
            confidence=confidence,
            task=task,
            metadata=metadata,
            timestamp=datetime.now(timezone.utc)
        )
    
    async def _llm_based_classify(self, task: str) -> ClassificationResult:
        """
        Classify task complexity using LLM-based classification.
        
        Args:
            task: Task text to classify
        
        Returns:
            ClassificationResult with complexity level and confidence
        """
        try:
            from core.services.llm import make_llm_api_call
            
            # Build classification prompt
            classification_prompt = f"""Classify the following task into one of these complexity levels:
- simple: Short queries (<50 words), single intent, no complex reasoning
- medium: Moderate length (50-150 words), multiple intents, basic reasoning
- complex: Long queries (150-300 words), complex reasoning, multi-step tasks
- very_complex: Very long queries (>300 words), advanced reasoning, multi-model workflows

Task: {task}

Respond with JSON format:
{{
    "complexity": "simple|medium|complex|very_complex",
    "confidence": 0.0-1.0,
    "reasoning": "brief explanation"
}}
"""
            
            messages = [
                {"role": "system", "content": "You are a task complexity classifier. Respond only with valid JSON."},
                {"role": "user", "content": classification_prompt}
            ]
            
            # Call LLM for classification
            response = await make_llm_api_call(
                messages=messages,
                model_name=self.llm_model,
                temperature=0.3,  # Low temperature for consistency
                max_tokens=200,
                stream=False
            )
            
            # Parse response
            if isinstance(response, dict):
                content = response.get("choices", [{}])[0].get("message", {}).get("content", "")
            else:
                content = str(response)
            
            # Extract JSON from response - improved parsing for nested JSON
            import json
            
            # Try to parse entire response as JSON first
            result_data = None
            try:
                result_data = json.loads(content)
            except json.JSONDecodeError:
                # If entire response is not JSON, try to find JSON object in response
                # Find the first { and last } to extract JSON object (handles nested braces)
                json_start = content.find('{')
                json_end = content.rfind('}') + 1
                
                if json_start >= 0 and json_end > json_start:
                    try:
                        json_content = content[json_start:json_end]
                        result_data = json.loads(json_content)
                    except json.JSONDecodeError:
                        # Try to find JSON with balanced braces
                        brace_count = 0
                        json_start = -1
                        for i, char in enumerate(content):
                            if char == '{':
                                if json_start == -1:
                                    json_start = i
                                brace_count += 1
                            elif char == '}':
                                brace_count -= 1
                                if brace_count == 0 and json_start >= 0:
                                    try:
                                        json_content = content[json_start:i+1]
                                        result_data = json.loads(json_content)
                                        break
                                    except json.JSONDecodeError:
                                        json_start = -1
                                        brace_count = 0
            
            # Parse result data
            if result_data and isinstance(result_data, dict):
                complexity_str = result_data.get("complexity", "simple")
                confidence = float(result_data.get("confidence", 0.8))
                reasoning = result_data.get("reasoning", "")
            else:
                # Fallback: try to parse complexity from text or use rule-based
                logger.warning(f"Failed to parse LLM JSON response, falling back to rule-based: {content[:100]}")
                return self._rule_based_classify(task)
            
            # Map string to ComplexityLevel
            complexity_map = {
                "simple": ComplexityLevel.SIMPLE,
                "medium": ComplexityLevel.MEDIUM,
                "complex": ComplexityLevel.COMPLEX,
                "very_complex": ComplexityLevel.VERY_COMPLEX,
            }
            complexity = complexity_map.get(complexity_str.lower(), ComplexityLevel.SIMPLE)
            
            return ClassificationResult(
                complexity=complexity,
                confidence=confidence,
                task=task,
                metadata={
                    "classification_method": "llm-based",
                    "llm_model": self.llm_model,
                    "reasoning": reasoning,
                },
                timestamp=datetime.now(timezone.utc)
            )
        
        except Exception as e:
            logger.warning(f"LLM-based classification failed: {e}, falling back to rule-based")
            # Fallback to rule-based classification
            return self._rule_based_classify(task)
    
    async def classify(self, task: str) -> ClassificationResult:
        """
        Classify task complexity.
        
        Args:
            task: Task text to classify
        
        Returns:
            ClassificationResult with complexity level and confidence
        """
        if not self.enabled:
            # Return default simple classification if disabled
            return ClassificationResult(
                complexity=ComplexityLevel.SIMPLE,
                confidence=1.0,
                task=task,
                metadata={"enabled": False},
                timestamp=datetime.now(timezone.utc)
            )
        
        # Normalize task (trim whitespace)
        task = task.strip()
        
        if not task:
            # Empty task -> simple
            return ClassificationResult(
                complexity=ComplexityLevel.SIMPLE,
                confidence=1.0,
                task=task,
                metadata={"empty_task": True},
                timestamp=datetime.now(timezone.utc)
            )
        
        # Input validation: Check maximum task length to prevent DoS
        word_count = len(task.split())
        if word_count > self.MAX_TASK_LENGTH:
            logger.warning(
                f"Task exceeds maximum length: {word_count} words (max: {self.MAX_TASK_LENGTH}). "
                f"Truncating for classification."
            )
            # Truncate to maximum length
            words = task.split()[:self.MAX_TASK_LENGTH]
            task = " ".join(words)
            word_count = self.MAX_TASK_LENGTH
        
        # Classify based on method
        if self.classification_method == "llm-based":
            result = await self._llm_based_classify(task)
        else:
            result = self._rule_based_classify(task)
        
        # Update metrics
        self.metrics.total_classifications += 1
        self.metrics.classifications_by_level[result.complexity] += 1
        self.metrics.total_confidence += result.confidence
        self.metrics.average_confidence = (
            self.metrics.total_confidence / self.metrics.total_classifications
        )
        
        # Log classification result
        logger.info(
            f"📊 Task classified: complexity={result.complexity.value}, "
            f"confidence={result.confidence:.3f}, task='{task[:50]}...'"
        )
        
        # Track in quality monitor (Story 2.4 integration)
        try:
            from core.optimizations.quality_monitor import get_quality_monitor
            quality_monitor = get_quality_monitor()
            await quality_monitor.track_metric(
                "task_complexity_classification",
                value=result.confidence,
                metadata={
                    "complexity": result.complexity.value,
                    "task_length": len(task),
                    "method": self.classification_method
                }
            )
        except Exception as e:
            logger.warning(f"Failed to track classification in quality monitor: {e}", exc_info=True)
        
        return result
    
    def get_metrics(self) -> Dict[str, Any]:
        """
        Get classification metrics.
        
        Returns:
            Dictionary with classification metrics
        """
        total = self.metrics.total_classifications
        if total == 0:
            return {
                "total_classifications": 0,
                "classifications_by_level": {
                    level.value: 0
                    for level in ComplexityLevel
                },
                "average_confidence": 0.0,
                "distribution_percentage": {
                    level.value: 0.0
                    for level in ComplexityLevel
                }
            }
        
        distribution = {
            level.value: (count / total * 100.0)
            for level, count in self.metrics.classifications_by_level.items()
        }
        
        return {
            "total_classifications": total,
            "classifications_by_level": {
                level.value: count
                for level, count in self.metrics.classifications_by_level.items()
            },
            "average_confidence": self.metrics.average_confidence,
            "distribution_percentage": distribution,
            "enabled": self.enabled,
            "classification_method": self.classification_method
        }
    
    def reset_metrics(self) -> None:
        """Reset classification metrics (for testing)."""
        self.metrics = ClassificationMetrics()
        logger.info("TaskClassifier metrics reset")


# Global TaskClassifier instance
_task_classifier_instance: Optional[TaskClassifier] = None


def get_task_classifier() -> TaskClassifier:
    """
    Get global TaskClassifier instance (singleton).
    
    Returns:
        TaskClassifier instance
    """
    global _task_classifier_instance
    
    if _task_classifier_instance is None:
        from core.utils.config import config
        
        # Load configuration
        classification_method = getattr(
            config,
            "TASK_CLASSIFICATION_METHOD",
            "rule-based"
        )
        llm_model = getattr(config, "TASK_CLASSIFICATION_LLM_MODEL", None)
        enabled = getattr(config, "TASK_CLASSIFICATION_ENABLED", True)
        
        _task_classifier_instance = TaskClassifier(
            classification_method=classification_method,
            llm_model=llm_model,
            enabled=enabled
        )
        
        logger.info("Global TaskClassifier instance created")
    
    return _task_classifier_instance


def set_task_classifier(instance: TaskClassifier) -> None:
    """
    Set global TaskClassifier instance (for testing).
    
    Args:
        instance: TaskClassifier instance to set
    """
    global _task_classifier_instance
    _task_classifier_instance = instance
    logger.info("TaskClassifier instance set (for testing)")

