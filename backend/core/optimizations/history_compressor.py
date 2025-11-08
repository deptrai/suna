"""
Message History Compression with Quality Control (Story 2.2).

This module implements message history compression using sliding window and
LLM summarization to reduce prompt token count for long conversations while
preserving critical context and quality.

Features:
- Sliding window to keep recent messages unchanged
- LLM summarization for older messages
- Quality validation and monitoring
- Token reduction measurement
- Context preservation testing
"""

import json
import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Tuple
import asyncio

from core.utils.logger import logger
from core.services.llm import make_llm_api_call
from collections import deque

# Optional import for semantic similarity (Story 2.2 - Code Review M1)
try:
    import numpy as np
    _NUMPY_AVAILABLE = True
except ImportError:
    _NUMPY_AVAILABLE = False

# Global history compressor instance
_history_compressor_instance: Optional['MessageHistoryCompressor'] = None


@dataclass
class CompressionMetrics:
    """Metrics for message history compression."""
    total_compressions: int = 0
    total_tokens_before: int = 0
    total_tokens_after: int = 0
    total_reduction_percentage: float = 0.0
    average_reduction_percentage: float = 0.0
    quality_scores: deque = field(default_factory=lambda: deque(maxlen=100))
    consecutive_quality_breaches: int = 0
    auto_disables: int = 0


class MessageHistoryCompressor:
    """
    Message history compressor with quality control.
    
    Uses sliding window to keep recent messages unchanged and LLM summarization
    for older messages. Implements quality monitoring to ensure context preservation.
    
    Features:
    - Sliding window (default: last 10 messages)
    - LLM summarization for older messages
    - Quality validation and monitoring
    - Token reduction measurement
    - Context preservation testing
    """
    
    def __init__(
        self,
        sliding_window_size: int = 10,
        quality_threshold: float = 0.95,
        summarization_model: Optional[str] = None,
        enabled: bool = True,
        auto_disable_enabled: bool = True
    ):
        """
        Initialize message history compressor.
        
        Args:
            sliding_window_size: Number of recent messages to keep unchanged
            quality_threshold: Minimum quality score to maintain (0.0-1.0)
            summarization_model: Model to use for summarization (None = use same as main call)
            enabled: Whether compression is enabled
            auto_disable_enabled: Whether auto-disable is enabled
        """
        self.sliding_window_size = sliding_window_size
        self.quality_threshold = quality_threshold
        self.summarization_model = summarization_model
        self.enabled = enabled
        self.auto_disable_enabled = auto_disable_enabled
        
        # Metrics
        self.metrics = CompressionMetrics()
        self.auto_disable_threshold = 5  # Auto-disable after 5 consecutive breaches
        
        # Summarization prompt template
        self.summarization_prompt_template = """Summarize the following conversation history while preserving critical context, key decisions, important facts, and user preferences. The summary should be concise but maintain all essential information needed for the conversation to continue naturally.

Conversation History:
{history}

Summary:"""
        
        logger.info(
            f"MessageHistoryCompressor initialized: "
            f"sliding_window_size={sliding_window_size}, "
            f"quality_threshold={quality_threshold}, "
            f"enabled={enabled}, "
            f"auto_disable={auto_disable_enabled}"
        )
    
    async def compress_history(
        self,
        messages: List[Dict[str, Any]],
        model_name: str,
        min_messages_to_compress: int = 15
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Compress message history using sliding window and summarization.
        
        Args:
            messages: List of message dictionaries with 'role' and 'content'
            model_name: Model name for LLM calls (used for summarization if summarization_model not set)
            min_messages_to_compress: Minimum number of messages before compression kicks in
        
        Returns:
            Tuple of (compressed_messages, compression_metadata)
            compression_metadata includes:
            - tokens_before: Token count before compression
            - tokens_after: Token count after compression
            - reduction_percentage: Percentage reduction
            - compressed: Whether compression was applied
            - summary: Summary text if compression was applied
        """
        if not self.enabled:
            logger.debug("Message history compression is disabled")
            return messages, {
                "compressed": False,
                "tokens_before": self._estimate_tokens(messages),
                "tokens_after": self._estimate_tokens(messages),
                "reduction_percentage": 0.0
            }
        
        # Don't compress if message count is below threshold
        if len(messages) < min_messages_to_compress:
            logger.debug(f"Message count ({len(messages)}) below compression threshold ({min_messages_to_compress})")
            return messages, {
                "compressed": False,
                "tokens_before": self._estimate_tokens(messages),
                "tokens_after": self._estimate_tokens(messages),
                "reduction_percentage": 0.0
            }
        
        try:
            # Calculate token count before compression
            tokens_before = self._estimate_tokens(messages)
            
            # Apply sliding window: keep last N messages unchanged
            recent_messages = messages[-self.sliding_window_size:]
            older_messages = messages[:-self.sliding_window_size]
            
            if not older_messages:
                # No older messages to compress
                return messages, {
                    "compressed": False,
                    "tokens_before": tokens_before,
                    "tokens_after": tokens_before,
                    "reduction_percentage": 0.0
                }
            
            # Summarize older messages
            summary_text = await self._summarize_messages(older_messages, model_name)
            
            # Create summary message
            summary_message = {
                "role": "system",
                "content": f"[Previous conversation summary]: {summary_text}"
            }
            
            # Combine summary with recent messages
            compressed_messages = [summary_message] + recent_messages
            
            # Calculate token count after compression
            tokens_after = self._estimate_tokens(compressed_messages)
            
            # Calculate reduction percentage
            reduction_percentage = ((tokens_before - tokens_after) / tokens_before * 100) if tokens_before > 0 else 0.0
            
            # Update metrics
            self.metrics.total_compressions += 1
            self.metrics.total_tokens_before += tokens_before
            self.metrics.total_tokens_after += tokens_after
            if self.metrics.total_compressions > 0:
                self.metrics.total_reduction_percentage = (
                    (self.metrics.total_tokens_before - self.metrics.total_tokens_after) /
                    self.metrics.total_tokens_before * 100
                ) if self.metrics.total_tokens_before > 0 else 0.0
                self.metrics.average_reduction_percentage = self.metrics.total_reduction_percentage / self.metrics.total_compressions
            
            logger.info(
                f"✅ Message history compressed: "
                f"{len(messages)} → {len(compressed_messages)} messages, "
                f"{tokens_before} → {tokens_after} tokens ({reduction_percentage:.1f}% reduction)"
            )
            
            return compressed_messages, {
                "compressed": True,
                "tokens_before": tokens_before,
                "tokens_after": tokens_after,
                "reduction_percentage": reduction_percentage,
                "summary": summary_text,
                "original_message_count": len(messages),
                "compressed_message_count": len(compressed_messages)
            }
            
        except Exception as e:
            logger.error(f"Error compressing message history: {e}")
            # Return original messages on error (fail-safe)
            return messages, {
                "compressed": False,
                "error": str(e),
                "tokens_before": self._estimate_tokens(messages),
                "tokens_after": self._estimate_tokens(messages),
                "reduction_percentage": 0.0
            }
    
    async def _summarize_messages(
        self,
        messages: List[Dict[str, Any]],
        model_name: str
    ) -> str:
        """
        Summarize older messages using LLM.
        
        Args:
            messages: List of message dictionaries to summarize
            model_name: Model name for summarization
        
        Returns:
            Summary text
        """
        try:
            # Convert messages to text format
            history_text = self._messages_to_text(messages)
            
            # Create summarization prompt
            prompt = self.summarization_prompt_template.format(history=history_text)
            
            # Use summarization model if specified, otherwise use main model
            summarization_model = self.summarization_model or model_name
            
            # Make LLM call for summarization
            summary_messages = [
                {"role": "system", "content": "You are a helpful assistant that creates concise summaries of conversations while preserving all critical context."},
                {"role": "user", "content": prompt}
            ]
            
            logger.debug(f"Summarizing {len(messages)} messages using model: {summarization_model}")
            
            response = await make_llm_api_call(
                messages=summary_messages,
                model_name=summarization_model,
                temperature=0.3,  # Lower temperature for more consistent summaries
                max_tokens=500,  # Limit summary length
                stream=False
            )
            
            # Extract summary text from response
            if isinstance(response, dict):
                if "choices" in response and len(response["choices"]) > 0:
                    choice = response["choices"][0]
                    if "message" in choice:
                        summary_text = choice["message"].get("content", "")
                    elif "text" in choice:
                        summary_text = choice["text"]
                    else:
                        summary_text = str(response)
                elif "content" in response:
                    summary_text = response["content"]
                else:
                    summary_text = str(response)
            elif isinstance(response, str):
                summary_text = response
            else:
                summary_text = str(response)
            
            logger.debug(f"Summary generated: {len(summary_text)} characters")
            return summary_text.strip()
            
        except Exception as e:
            logger.error(f"Error summarizing messages: {e}")
            # Fallback: return a basic summary
            return f"[{len(messages)} previous messages in conversation]"
    
    def _messages_to_text(self, messages: List[Dict[str, Any]]) -> str:
        """Convert messages to text format for summarization."""
        text_parts = []
        for msg in messages:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            if isinstance(content, str):
                text_parts.append(f"{role.capitalize()}: {content}")
            elif isinstance(content, list):
                # Handle content array (e.g., OpenAI format)
                texts = []
                for item in content:
                    if isinstance(item, dict) and "text" in item:
                        texts.append(item["text"])
                    elif isinstance(item, str):
                        texts.append(item)
                text_parts.append(f"{role.capitalize()}: {' '.join(texts)}")
            else:
                text_parts.append(f"{role.capitalize()}: {str(content)}")
        return "\n".join(text_parts)
    
    def _estimate_tokens(self, messages: List[Dict[str, Any]]) -> int:
        """
        Estimate token count for messages.
        
        Uses a simple estimation: ~4 characters per token.
        For more accurate counting, could use tiktoken or similar.
        """
        total_chars = 0
        for msg in messages:
            content = msg.get("content", "")
            if isinstance(content, str):
                total_chars += len(content)
            elif isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and "text" in item:
                        total_chars += len(item["text"])
                    elif isinstance(item, str):
                        total_chars += len(item)
            else:
                total_chars += len(str(content))
        # Rough estimate: 4 characters per token
        return int(total_chars / 4)
    
    async def validate_compression_quality(
        self,
        original_messages: List[Dict[str, Any]],
        compressed_messages: List[Dict[str, Any]],
        original_response: Dict[str, Any],
        compressed_response: Dict[str, Any]
    ) -> float:
        """
        Validate compression quality by comparing responses.
        
        Args:
            original_messages: Original message history
            compressed_messages: Compressed message history
            original_response: Response from original messages
            compressed_response: Response from compressed messages
        
        Returns:
            Quality score (0.0-1.0) based on semantic similarity
        """
        try:
            # Extract response text
            original_text = self._extract_response_text(original_response)
            compressed_text = self._extract_response_text(compressed_response)
            
            # Calculate semantic similarity using embeddings
            # For now, use a simple text similarity as a placeholder
            # In production, would use sentence-transformers like semantic cache
            similarity = self._calculate_text_similarity(original_text, compressed_text)
            
            # Update quality scores
            self.metrics.quality_scores.append(similarity)
            
            # Check for quality breach
            if similarity < self.quality_threshold:
                self.metrics.consecutive_quality_breaches += 1
                logger.warning(
                    f"Quality breach detected: similarity={similarity:.3f} < threshold={self.quality_threshold}"
                )
                
                # Auto-disable if threshold exceeded
                if self.auto_disable_enabled and self.metrics.consecutive_quality_breaches >= self.auto_disable_threshold:
                    logger.error(
                        f"Auto-disabling compression after {self.metrics.consecutive_quality_breaches} "
                        f"consecutive quality breaches"
                    )
                    self.disable()
                    self.metrics.auto_disables += 1
            else:
                # Reset breach counter on good quality
                self.metrics.consecutive_quality_breaches = 0
            
            return similarity
            
        except Exception as e:
            logger.error(f"Error validating compression quality: {e}")
            return 0.0  # Fail-safe: assume low quality on error
    
    def _extract_response_text(self, response: Dict[str, Any]) -> str:
        """Extract text from LLM response."""
        if isinstance(response, str):
            return response
        
        if "choices" in response and len(response["choices"]) > 0:
            choice = response["choices"][0]
            if "message" in choice:
                return choice["message"].get("content", "")
            elif "text" in choice:
                return choice["text"]
        
        if "content" in response:
            return response["content"]
        
        return str(response)
    
    def _calculate_text_similarity(self, text1: str, text2: str) -> float:
        """
        Calculate semantic similarity using embeddings (Story 2.2 - Code Review M1).
        
        Uses sentence-transformers for accurate semantic similarity measurement,
        consistent with semantic cache implementation (Story 2.1).
        """
        try:
            # Try to use semantic embeddings for accurate similarity
            from sentence_transformers import SentenceTransformer
            
            if not _NUMPY_AVAILABLE:
                logger.warning("numpy not available, falling back to word-based similarity")
                return self._calculate_word_based_similarity(text1, text2)
            
            # Lazy load embedding model (same as semantic cache)
            if not hasattr(self, '_embedding_model') or self._embedding_model is None:
                model_name = "all-MiniLM-L6-v2"  # Same model as semantic cache
                logger.debug(f"Loading SentenceTransformer model: {model_name}")
                self._embedding_model = SentenceTransformer(model_name)
            
            # Generate embeddings
            embeddings = self._embedding_model.encode([text1, text2])
            embedding1 = embeddings[0]
            embedding2 = embeddings[1]
            
            # Calculate cosine similarity
            dot_product = np.dot(embedding1, embedding2)
            norm1 = np.linalg.norm(embedding1)
            norm2 = np.linalg.norm(embedding2)
            
            if norm1 == 0 or norm2 == 0:
                return 0.0
            
            cosine_similarity = dot_product / (norm1 * norm2)
            # Clamp to [0, 1] range to handle floating point precision issues
            return float(max(0.0, min(1.0, cosine_similarity)))
            
        except ImportError:
            # Fallback to word-based similarity if sentence-transformers not available
            logger.warning(
                "sentence-transformers not available, falling back to word-based similarity. "
                "Install sentence-transformers for more accurate quality validation."
            )
            return self._calculate_word_based_similarity(text1, text2)
        except Exception as e:
            logger.warning(f"Error calculating semantic similarity: {e}, falling back to word-based similarity")
            return self._calculate_word_based_similarity(text1, text2)
    
    def _calculate_word_based_similarity(self, text1: str, text2: str) -> float:
        """
        Calculate word-based similarity (fallback method).
        
        Used when semantic embeddings are not available.
        """
        # Simple word-based similarity
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        
        if not words1 or not words2:
            return 0.0
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        if not union:
            return 0.0
        
        # Jaccard similarity
        return len(intersection) / len(union)
    
    def enable(self):
        """Enable compression."""
        self.enabled = True
        self.metrics.consecutive_quality_breaches = 0
        logger.info("Message history compression enabled")
    
    def disable(self):
        """Disable compression."""
        self.enabled = False
        logger.warning("Message history compression disabled")
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get compression metrics."""
        return {
            "total_compressions": self.metrics.total_compressions,
            "total_tokens_before": self.metrics.total_tokens_before,
            "total_tokens_after": self.metrics.total_tokens_after,
            "average_reduction_percentage": self.metrics.average_reduction_percentage,
            "total_reduction_percentage": self.metrics.total_reduction_percentage,
            "quality_scores": list(self.metrics.quality_scores),
            "average_quality_score": (
                sum(self.metrics.quality_scores) / len(self.metrics.quality_scores)
                if self.metrics.quality_scores else 0.0
            ),
            "consecutive_quality_breaches": self.metrics.consecutive_quality_breaches,
            "auto_disables": self.metrics.auto_disables,
            "enabled": self.enabled,
            "sliding_window_size": self.sliding_window_size,
            "quality_threshold": self.quality_threshold
        }
    
    def reset_metrics(self):
        """Reset compression metrics."""
        self.metrics = CompressionMetrics()
        logger.info("Compression metrics reset")


def get_history_compressor() -> MessageHistoryCompressor:
    """Get global history compressor instance (singleton)."""
    global _history_compressor_instance
    if _history_compressor_instance is None:
        # Load configuration from config object or environment variables
        import os
        from core.utils.config import config
        
        # Get sliding window size
        sliding_window_size = 10
        if hasattr(config, 'HISTORY_COMPRESSION_SLIDING_WINDOW_SIZE') and config.HISTORY_COMPRESSION_SLIDING_WINDOW_SIZE is not None:
            sliding_window_size = config.HISTORY_COMPRESSION_SLIDING_WINDOW_SIZE
        else:
            sliding_window_size = int(os.getenv("HISTORY_COMPRESSION_SLIDING_WINDOW_SIZE", "10"))
        
        # Get quality threshold
        quality_threshold = 0.95
        if hasattr(config, 'HISTORY_COMPRESSION_QUALITY_THRESHOLD') and config.HISTORY_COMPRESSION_QUALITY_THRESHOLD is not None:
            quality_threshold = config.HISTORY_COMPRESSION_QUALITY_THRESHOLD
        else:
            quality_threshold = float(os.getenv("HISTORY_COMPRESSION_QUALITY_THRESHOLD", "0.95"))
        
        # Get enabled flag
        enabled = True
        if hasattr(config, 'HISTORY_COMPRESSION_ENABLED') and config.HISTORY_COMPRESSION_ENABLED is not None:
            enabled = config.HISTORY_COMPRESSION_ENABLED
        else:
            enabled = os.getenv("HISTORY_COMPRESSION_ENABLED", "true").lower() in ('true', 't', 'yes', 'y', '1')
        
        # Get auto-disable enabled flag
        auto_disable_enabled = True
        if hasattr(config, 'HISTORY_COMPRESSION_AUTO_DISABLE_ENABLED') and config.HISTORY_COMPRESSION_AUTO_DISABLE_ENABLED is not None:
            auto_disable_enabled = config.HISTORY_COMPRESSION_AUTO_DISABLE_ENABLED
        else:
            auto_disable_enabled = os.getenv("HISTORY_COMPRESSION_AUTO_DISABLE_ENABLED", "true").lower() in ('true', 't', 'yes', 'y', '1')
        
        _history_compressor_instance = MessageHistoryCompressor(
            sliding_window_size=sliding_window_size,
            quality_threshold=quality_threshold,
            enabled=enabled,
            auto_disable_enabled=auto_disable_enabled
        )
    return _history_compressor_instance


def set_history_compressor(compressor: MessageHistoryCompressor):
    """Set global history compressor instance (for testing)."""
    global _history_compressor_instance
    _history_compressor_instance = compressor

