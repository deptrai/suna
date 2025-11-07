"""
Quality Metrics Calculation Helpers (Story 2.4).

Helper functions to calculate quality metrics for monitoring.
"""

import re
from typing import Dict, Any, Optional, List
from core.utils.logger import logger


def calculate_response_similarity(
    original_response: str,
    optimized_response: str,
    use_semantic: bool = False
) -> float:
    """
    Calculate similarity between original and optimized responses.
    
    Args:
        original_response: Original response text
        optimized_response: Optimized response text
        use_semantic: If True, use semantic similarity (requires SentenceTransformer)
                     If False, use simple text similarity (faster, less accurate)
    
    Returns:
        Similarity score (0.0-1.0)
    """
    if not original_response or not optimized_response:
        return 0.0
    
    if use_semantic:
        try:
            from sentence_transformers import SentenceTransformer
            from sklearn.metrics.pairwise import cosine_similarity
            import numpy as np
            
            # Load model (cache it for performance)
            if not hasattr(calculate_response_similarity, '_model'):
                calculate_response_similarity._model = SentenceTransformer('all-MiniLM-L6-v2')
            
            model = calculate_response_similarity._model
            
            # Get embeddings
            original_embedding = model.encode(original_response)
            optimized_embedding = model.encode(optimized_response)
            
            # Calculate cosine similarity
            similarity = cosine_similarity(
                original_embedding.reshape(1, -1),
                optimized_embedding.reshape(1, -1)
            )[0][0]
            
            return float(similarity)
        except Exception as e:
            logger.warning(f"Semantic similarity calculation failed: {e}, falling back to text similarity")
            use_semantic = False
    
    # Simple text similarity (fallback)
    if not use_semantic:
        # Normalize text
        original_normalized = _normalize_text(original_response)
        optimized_normalized = _normalize_text(optimized_response)
        
        # Calculate Jaccard similarity (word overlap)
        original_words = set(original_normalized.split())
        optimized_words = set(optimized_normalized.split())
        
        if not original_words and not optimized_words:
            return 1.0
        
        intersection = len(original_words & optimized_words)
        union = len(original_words | optimized_words)
        
        if union == 0:
            return 0.0
        
        similarity = intersection / union
        return similarity


def _normalize_text(text: str) -> str:
    """Normalize text for comparison."""
    # Convert to lowercase
    text = text.lower()
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text)
    # Remove punctuation (optional - can be adjusted)
    # text = re.sub(r'[^\w\s]', '', text)
    return text.strip()


def calculate_tool_success_rate(
    tool_calls: List[Dict[str, Any]],
    tool_results: List[Dict[str, Any]]
) -> float:
    """
    Calculate tool success rate.
    
    Args:
        tool_calls: List of tool calls made
        tool_results: List of tool execution results
    
    Returns:
        Success rate (0.0-1.0)
    """
    if not tool_calls:
        return 1.0  # No tools called = 100% success
    
    if len(tool_results) != len(tool_calls):
        logger.warning(f"Tool calls ({len(tool_calls)}) and results ({len(tool_results)}) count mismatch")
        return 0.0
    
    successful = 0
    for result in tool_results:
        # Check if tool execution was successful
        if isinstance(result, dict):
            # Check for error indicators
            if result.get("error") is None and result.get("status") != "error":
                successful += 1
        elif hasattr(result, "error") and result.error is None:
            successful += 1
    
    success_rate = successful / len(tool_calls) if tool_calls else 0.0
    return success_rate


def calculate_error_rate(
    responses: List[Dict[str, Any]],
    errors: List[Optional[Exception]]
) -> float:
    """
    Calculate error rate from responses and errors.
    
    Args:
        responses: List of response objects
        errors: List of errors (None if no error)
    
    Returns:
        Error rate (0.0-1.0)
    """
    if not responses:
        return 0.0
    
    error_count = sum(1 for error in errors if error is not None)
    error_rate = error_count / len(responses) if responses else 0.0
    return error_rate


def calculate_response_completeness(
    response: str,
    expected_length: Optional[int] = None,
    required_keywords: Optional[List[str]] = None
) -> float:
    """
    Calculate response completeness.
    
    Args:
        response: Response text
        expected_length: Expected minimum length (optional)
        required_keywords: List of keywords that should be present (optional)
    
    Returns:
        Completeness score (0.0-1.0)
    """
    if not response:
        return 0.0
    
    score = 1.0
    
    # Check length
    if expected_length and len(response) < expected_length:
        length_ratio = len(response) / expected_length
        score *= length_ratio
    
    # Check required keywords
    if required_keywords:
        response_lower = response.lower()
        found_keywords = sum(1 for keyword in required_keywords if keyword.lower() in response_lower)
        keyword_score = found_keywords / len(required_keywords) if required_keywords else 1.0
        score *= keyword_score
    
    # Check for truncation indicators
    if "..." in response or "[truncated]" in response.lower():
        score *= 0.8
    
    return max(0.0, min(1.0, score))


def extract_user_satisfaction(
    feedback: Optional[Dict[str, Any]] = None,
    rating: Optional[float] = None
) -> float:
    """
    Extract user satisfaction from feedback or rating.
    
    Args:
        feedback: User feedback dictionary (optional)
        rating: User rating (0.0-1.0 or 0-5 scale, optional)
    
    Returns:
        Satisfaction score (0.0-1.0)
    """
    if rating is not None:
        # Normalize rating to 0.0-1.0
        if rating > 1.0:
            rating = rating / 5.0  # Assume 5-point scale
        return max(0.0, min(1.0, rating))
    
    if feedback:
        # Extract satisfaction from feedback
        # This is a placeholder - actual implementation would analyze feedback text
        feedback_text = str(feedback).lower()
        
        # Positive indicators
        positive_words = ["good", "great", "excellent", "helpful", "satisfied", "thanks"]
        negative_words = ["bad", "poor", "wrong", "error", "failed", "disappointed"]
        
        positive_count = sum(1 for word in positive_words if word in feedback_text)
        negative_count = sum(1 for word in negative_words if word in feedback_text)
        
        if positive_count > negative_count:
            return 0.8  # Positive feedback
        elif negative_count > positive_count:
            return 0.3  # Negative feedback
        else:
            return 0.6  # Neutral
    
    # Default: no feedback available
    return 0.5  # Neutral/unknown

