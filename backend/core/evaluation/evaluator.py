"""
Automated Evaluator for Response Quality
Phase 2 Task 2.2.1

Evaluates response quality across multiple dimensions.
"""
import time
import re
from typing import Dict, Any, Optional
from core.utils.logger import logger


class AutomatedEvaluator:
    """
    Evaluates response quality automatically.
    
    Metrics:
    - Quality: Formatting, completeness, tone
    - Tool Calling: Correct usage, parameters
    - Format: Proper structure
    - Completeness: All requirements met
    - Latency: Response time
    """
    
    def __init__(self):
        """Initialize evaluator"""
        self.start_time = None
        logger.info("📊 AutomatedEvaluator initialized")
    
    def start_timer(self):
        """Start latency timer"""
        self.start_time = time.time()
    
    def evaluate_response(
        self, 
        response: Any, 
        expected: Optional[Dict[str, Any]] = None,
        prompt_version: str = "unknown"
    ) -> Dict[str, Any]:
        """
        Evaluate response quality.
        
        Args:
            response: Response to evaluate
            expected: Expected response characteristics (optional)
            prompt_version: Version of prompt used
        
        Returns:
            Evaluation scores and metrics
        """
        scores = {
            "quality": self._check_quality(response),
            "completeness": self._check_completeness(response, expected),
            "format": self._check_format(response),
            "tool_calling": self._check_tool_calling(response),
            "latency": self._measure_latency()
        }
        
        # Calculate overall score
        overall = sum(scores.values()) / len(scores)
        passed = overall >= 0.95  # 95% threshold
        
        result = {
            "prompt_version": prompt_version,
            "overall_score": round(overall, 3),
            "breakdown": scores,
            "passed": passed,
            "timestamp": time.time()
        }
        
        # Log results
        logger.info(f"📊 Evaluation: {overall:.3f} ({'PASS' if passed else 'FAIL'})")
        logger.debug(f"   Breakdown: {scores}")
        
        # Log to GlitchTip
        try:
            import sentry_sdk
            sentry_sdk.set_context("evaluation", result)
            sentry_sdk.capture_message(
                f"Evaluation: overall_score={overall:.3f}, passed={passed}",
                level="info"
            )
        except Exception as e:
            logger.warning(f"Failed to log evaluation to GlitchTip: {e}")
        
        return result
    
    def _check_quality(self, response: Any) -> float:
        """
        Check response quality.
        
        Checks:
        - Proper formatting
        - Complete answers
        - No obvious errors
        - Appropriate tone
        
        Returns:
            Score from 0.0 to 1.0
        """
        score = 1.0
        
        if response is None:
            return 0.0
        
        # Convert response to string
        response_str = str(response)
        
        # Check minimum length
        if len(response_str) < 10:
            score -= 0.3
        
        # Check for error indicators
        error_patterns = [
            r"error",
            r"failed",
            r"exception",
            r"traceback",
            r"undefined"
        ]
        
        for pattern in error_patterns:
            if re.search(pattern, response_str, re.IGNORECASE):
                score -= 0.2
                break
        
        # Check for completeness indicators
        if "..." in response_str or "[truncated]" in response_str:
            score -= 0.1
        
        return max(0.0, min(1.0, score))
    
    def _check_completeness(
        self, 
        response: Any, 
        expected: Optional[Dict[str, Any]] = None
    ) -> float:
        """
        Check response completeness.
        
        Args:
            response: Response to check
            expected: Expected characteristics
        
        Returns:
            Score from 0.0 to 1.0
        """
        if response is None:
            return 0.0
        
        score = 1.0
        
        # If expected characteristics provided, check them
        if expected:
            if "min_length" in expected:
                response_str = str(response)
                if len(response_str) < expected["min_length"]:
                    score -= 0.3
            
            if "required_keywords" in expected:
                response_str = str(response).lower()
                for keyword in expected["required_keywords"]:
                    if keyword.lower() not in response_str:
                        score -= 0.2
        
        return max(0.0, min(1.0, score))
    
    def _check_format(self, response: Any) -> float:
        """
        Check response format.
        
        Checks:
        - Proper structure
        - Valid JSON/dict if applicable
        - No malformed content
        
        Returns:
            Score from 0.0 to 1.0
        """
        if response is None:
            return 0.0
        
        score = 1.0
        
        # Check if response is dict (structured)
        if isinstance(response, dict):
            # Check for required keys
            if "content" not in response and "message" not in response:
                score -= 0.2
        
        # Check for malformed content
        response_str = str(response)
        if response_str.count("{") != response_str.count("}"):
            score -= 0.3
        if response_str.count("[") != response_str.count("]"):
            score -= 0.3
        
        return max(0.0, min(1.0, score))
    
    def _check_tool_calling(self, response: Any) -> float:
        """
        Check tool calling functionality.
        
        Checks:
        - Tools called when needed
        - Correct parameters
        - Proper error handling
        
        Returns:
            Score from 0.0 to 1.0
        """
        if response is None:
            return 0.0
        
        score = 1.0
        
        # Check if response is dict with tool_calls
        if isinstance(response, dict):
            if "tool_calls" in response:
                tool_calls = response["tool_calls"]
                
                # Check tool calls are valid
                if not isinstance(tool_calls, list):
                    score -= 0.5
                elif len(tool_calls) == 0:
                    # No tool calls might be OK
                    pass
                else:
                    # Check each tool call has required fields
                    for tool_call in tool_calls:
                        if not isinstance(tool_call, dict):
                            score -= 0.3
                        elif "function" not in tool_call and "name" not in tool_call:
                            score -= 0.3
        
        return max(0.0, min(1.0, score))
    
    def _measure_latency(self) -> float:
        """
        Measure response latency.
        
        Returns:
            Score from 0.0 to 1.0 (1.0 = fast, 0.0 = slow)
        """
        if self.start_time is None:
            return 1.0  # No timing data, assume OK
        
        elapsed = time.time() - self.start_time
        
        # Score based on latency
        # < 1s = 1.0
        # 1-5s = 0.8
        # 5-10s = 0.6
        # 10-30s = 0.4
        # > 30s = 0.2
        
        if elapsed < 1.0:
            return 1.0
        elif elapsed < 5.0:
            return 0.8
        elif elapsed < 10.0:
            return 0.6
        elif elapsed < 30.0:
            return 0.4
        else:
            return 0.2


# Singleton instance
_evaluator_instance: Optional[AutomatedEvaluator] = None


def get_evaluator() -> AutomatedEvaluator:
    """Get singleton instance of AutomatedEvaluator"""
    global _evaluator_instance
    if _evaluator_instance is None:
        _evaluator_instance = AutomatedEvaluator()
    return _evaluator_instance

