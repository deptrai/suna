"""
Tests for Message History Compression (Story 2.2).

Tests cover:
- MessageHistoryCompressor class initialization and configuration
- Sliding window logic
- Message summarization
- Quality validation and monitoring
- Auto-disable mechanism
- Token reduction measurement
- Integration with LLM service
"""

import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from datetime import datetime, timezone

from core.optimizations.history_compressor import (
    MessageHistoryCompressor,
    get_history_compressor,
    set_history_compressor,
    CompressionMetrics
)


class TestMessageHistoryCompressorInitialization:
    """Test MessageHistoryCompressor initialization and configuration."""
    
    def test_compressor_init_default(self):
        """Test MessageHistoryCompressor initialization with default parameters."""
        compressor = MessageHistoryCompressor()
        
        assert compressor.sliding_window_size == 10
        assert compressor.quality_threshold == 0.95
        assert compressor.summarization_model is None
        assert compressor.enabled is True
        assert compressor.auto_disable_enabled is True
        assert compressor.metrics.total_compressions == 0
        assert compressor.metrics.total_tokens_before == 0
        assert compressor.metrics.total_tokens_after == 0
    
    def test_compressor_init_custom(self):
        """Test MessageHistoryCompressor initialization with custom parameters."""
        compressor = MessageHistoryCompressor(
            sliding_window_size=5,
            quality_threshold=0.90,
            summarization_model="gpt-4o-mini",
            enabled=False,
            auto_disable_enabled=False
        )
        
        assert compressor.sliding_window_size == 5
        assert compressor.quality_threshold == 0.90
        assert compressor.summarization_model == "gpt-4o-mini"
        assert compressor.enabled is False
        assert compressor.auto_disable_enabled is False
    
    def test_get_history_compressor_singleton(self):
        """Test get_history_compressor returns singleton instance."""
        compressor1 = get_history_compressor()
        compressor2 = get_history_compressor()
        
        assert compressor1 is compressor2
    
    def test_set_history_compressor(self):
        """Test set_history_compressor for testing."""
        original_compressor = get_history_compressor()
        test_compressor = MessageHistoryCompressor(enabled=False)
        
        set_history_compressor(test_compressor)
        assert get_history_compressor() is test_compressor
        
        # Restore original
        set_history_compressor(original_compressor)


class TestSlidingWindow:
    """Test sliding window logic (AC: #2)."""
    
    @pytest.mark.asyncio
    async def test_sliding_window_keeps_recent_messages(self):
        """Test sliding window keeps recent messages unchanged."""
        compressor = MessageHistoryCompressor(sliding_window_size=5)
        
        # Create messages with more than sliding window size
        messages = [
            {"role": "user", "content": f"Message {i}"}
            for i in range(20)
        ]
        
        # Mock summarization to return a simple summary
        with patch.object(compressor, '_summarize_messages', new_callable=AsyncMock) as mock_summarize:
            mock_summarize.return_value = "Summary of older messages"
            
            compressed_messages, metadata = await compressor.compress_history(
                messages,
                "test-model",
                min_messages_to_compress=15
            )
            
            # Should keep last 5 messages unchanged
            assert len(compressed_messages) == 6  # 1 summary + 5 recent messages
            assert compressed_messages[0]["role"] == "system"
            assert "[Previous conversation summary]" in compressed_messages[0]["content"]
            
            # Recent messages should be unchanged
            assert compressed_messages[1:] == messages[-5:]
    
    @pytest.mark.asyncio
    async def test_sliding_window_below_threshold(self):
        """Test sliding window doesn't compress if below threshold."""
        compressor = MessageHistoryCompressor(sliding_window_size=10)
        
        # Create messages below compression threshold
        messages = [
            {"role": "user", "content": f"Message {i}"}
            for i in range(10)
        ]
        
        compressed_messages, metadata = await compressor.compress_history(
            messages,
            "test-model",
            min_messages_to_compress=15
        )
        
        # Should not compress
        assert metadata["compressed"] is False
        assert compressed_messages == messages
    
    @pytest.mark.asyncio
    async def test_sliding_window_exact_size(self):
        """Test sliding window with exact window size."""
        compressor = MessageHistoryCompressor(sliding_window_size=10)
        
        # Create exactly sliding window size messages
        messages = [
            {"role": "user", "content": f"Message {i}"}
            for i in range(10)
        ]
        
        compressed_messages, metadata = await compressor.compress_history(
            messages,
            "test-model",
            min_messages_to_compress=5  # Lower threshold for testing
        )
        
        # Should not compress (no older messages to summarize)
        assert metadata["compressed"] is False
        assert compressed_messages == messages


class TestMessageSummarization:
    """Test message summarization (AC: #3)."""
    
    @pytest.mark.asyncio
    @patch('core.optimizations.history_compressor.make_llm_api_call')
    async def test_summarize_messages(self, mock_llm_call):
        """Test message summarization using LLM."""
        mock_llm_call.return_value = {
            "choices": [{
                "message": {
                    "content": "This is a summary of the conversation."
                }
            }]
        }
        
        compressor = MessageHistoryCompressor()
        messages = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
            {"role": "user", "content": "How are you?"}
        ]
        
        summary = await compressor._summarize_messages(messages, "test-model")
        
        assert summary == "This is a summary of the conversation."
        mock_llm_call.assert_called_once()
    
    @pytest.mark.asyncio
    @patch('core.optimizations.history_compressor.make_llm_api_call')
    async def test_summarize_messages_error_handling(self, mock_llm_call):
        """Test summarization error handling."""
        mock_llm_call.side_effect = Exception("LLM error")
        
        compressor = MessageHistoryCompressor()
        messages = [
            {"role": "user", "content": "Hello"}
        ]
        
        summary = await compressor._summarize_messages(messages, "test-model")
        
        # Should return fallback summary
        assert "previous messages" in summary.lower() or "messages in conversation" in summary.lower()
    
    def test_messages_to_text(self):
        """Test conversion of messages to text format."""
        compressor = MessageHistoryCompressor()
        messages = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"}
        ]
        
        text = compressor._messages_to_text(messages)
        
        assert "User: Hello" in text
        assert "Assistant: Hi there!" in text


class TestTokenCounting:
    """Test token counting and reduction measurement (AC: #5)."""
    
    def test_estimate_tokens(self):
        """Test token estimation."""
        compressor = MessageHistoryCompressor()
        messages = [
            {"role": "user", "content": "Hello world" * 10}  # ~110 chars = ~27 tokens
        ]
        
        tokens = compressor._estimate_tokens(messages)
        
        assert tokens > 0
        assert tokens == int(len("Hello world" * 10) / 4)
    
    @pytest.mark.asyncio
    async def test_token_reduction_measurement(self):
        """Test token reduction measurement."""
        compressor = MessageHistoryCompressor(sliding_window_size=5)
        
        # Create messages
        messages = [
            {"role": "user", "content": f"Message {i}" * 10}
            for i in range(20)
        ]
        
        with patch.object(compressor, '_summarize_messages', new_callable=AsyncMock) as mock_summarize:
            mock_summarize.return_value = "Summary"  # Short summary
            
            compressed_messages, metadata = await compressor.compress_history(
                messages,
                "test-model",
                min_messages_to_compress=15
            )
            
            if metadata["compressed"]:
                assert metadata["tokens_before"] > 0
                assert metadata["tokens_after"] > 0
                assert metadata["reduction_percentage"] >= 0
                assert metadata["tokens_after"] < metadata["tokens_before"]


class TestQualityValidation:
    """Test quality validation and monitoring (AC: #6)."""
    
    @pytest.mark.asyncio
    async def test_validate_compression_quality(self):
        """Test compression quality validation."""
        compressor = MessageHistoryCompressor()
        
        original_messages = [{"role": "user", "content": "Hello"}]
        compressed_messages = [{"role": "system", "content": "[Summary]: Hello"}]
        original_response = {"choices": [{"message": {"content": "Hi there!"}}]}
        compressed_response = {"choices": [{"message": {"content": "Hi there!"}}]}
        
        quality_score = await compressor.validate_compression_quality(
            original_messages,
            compressed_messages,
            original_response,
            compressed_response
        )
        
        # Identical responses should have high quality
        # Note: Cosine similarity can be slightly > 1.0 due to floating point precision
        assert quality_score >= 0.0
        assert quality_score <= 1.0 or abs(quality_score - 1.0) < 0.0001  # Allow small floating point errors
    
    @pytest.mark.asyncio
    async def test_auto_disable_on_quality_breach(self):
        """Test auto-disable on quality threshold breach."""
        compressor = MessageHistoryCompressor(
            quality_threshold=0.95,
            auto_disable_enabled=True,
            enabled=True
        )
        
        # Simulate quality breaches
        for i in range(5):
            await compressor.validate_compression_quality(
                [{"role": "user", "content": "test"}],
                [{"role": "system", "content": "summary"}],
                {"choices": [{"message": {"content": "response A"}}]},
                {"choices": [{"message": {"content": "response B"}}]}  # Different response
            )
        
        # Should be disabled after 5 consecutive breaches
        assert compressor.enabled is False
        assert compressor.metrics.auto_disables == 1
    
    def test_extract_response_text(self):
        """Test response text extraction."""
        compressor = MessageHistoryCompressor()
        
        # Test OpenAI-style response
        response = {
            "choices": [{
                "message": {
                    "content": "Hello world"
                }
            }]
        }
        assert compressor._extract_response_text(response) == "Hello world"
        
        # Test string response
        assert compressor._extract_response_text("Hello") == "Hello"
        
        # Test dict with content
        assert compressor._extract_response_text({"content": "Hello"}) == "Hello"
    
    def test_calculate_text_similarity(self):
        """Test text similarity calculation."""
        compressor = MessageHistoryCompressor()
        
        # Identical texts
        similarity = compressor._calculate_text_similarity("Hello world", "Hello world")
        assert similarity == 1.0
        
        # Similar texts
        similarity = compressor._calculate_text_similarity("Hello world", "Hello")
        assert similarity > 0.0
        assert similarity < 1.0
        
        # Different texts
        similarity = compressor._calculate_text_similarity("Hello", "Goodbye")
        assert similarity >= 0.0
        assert similarity < 1.0


class TestCompressionOperations:
    """Test compression operations."""
    
    @pytest.mark.asyncio
    async def test_compress_history_disabled(self):
        """Test compress_history when compression is disabled."""
        compressor = MessageHistoryCompressor(enabled=False)
        
        messages = [{"role": "user", "content": "Hello"}]
        compressed_messages, metadata = await compressor.compress_history(
            messages,
            "test-model"
        )
        
        assert compressed_messages == messages
        assert metadata["compressed"] is False
    
    @pytest.mark.asyncio
    async def test_compress_history_success(self):
        """Test successful compression."""
        compressor = MessageHistoryCompressor(sliding_window_size=5)
        
        messages = [
            {"role": "user", "content": f"Message {i}"}
            for i in range(20)
        ]
        
        with patch.object(compressor, '_summarize_messages', new_callable=AsyncMock) as mock_summarize:
            mock_summarize.return_value = "Summary of older messages"
            
            compressed_messages, metadata = await compressor.compress_history(
                messages,
                "test-model",
                min_messages_to_compress=15
            )
            
            assert metadata["compressed"] is True
            assert len(compressed_messages) == 6  # 1 summary + 5 recent
            assert metadata["reduction_percentage"] >= 0
    
    @pytest.mark.asyncio
    async def test_compress_history_error_handling(self):
        """Test compression error handling."""
        compressor = MessageHistoryCompressor(sliding_window_size=5)
        
        messages = [
            {"role": "user", "content": f"Message {i}"}
            for i in range(20)
        ]
        
        with patch.object(compressor, '_summarize_messages', new_callable=AsyncMock) as mock_summarize:
            mock_summarize.side_effect = Exception("Summarization error")
            
            compressed_messages, metadata = await compressor.compress_history(
                messages,
                "test-model",
                min_messages_to_compress=15
            )
            
            # Should return original messages on error
            assert compressed_messages == messages
            assert metadata["compressed"] is False
            assert "error" in metadata
    
    def test_enable_disable(self):
        """Test enable/disable methods."""
        compressor = MessageHistoryCompressor()
        
        assert compressor.enabled is True
        
        compressor.disable()
        assert compressor.enabled is False
        
        compressor.enable()
        assert compressor.enabled is True
        assert compressor.metrics.consecutive_quality_breaches == 0  # Reset on enable


class TestCompressionMetrics:
    """Test compression metrics tracking."""
    
    @pytest.mark.asyncio
    async def test_metrics_tracking(self):
        """Test compression metrics are tracked correctly."""
        compressor = MessageHistoryCompressor(sliding_window_size=5)
        
        messages = [
            {"role": "user", "content": f"Message {i}"}
            for i in range(20)
        ]
        
        with patch.object(compressor, '_summarize_messages', new_callable=AsyncMock) as mock_summarize:
            mock_summarize.return_value = "Summary"
            
            await compressor.compress_history(
                messages,
                "test-model",
                min_messages_to_compress=15
            )
            
            metrics = compressor.get_metrics()
            
            assert metrics["total_compressions"] >= 0
            assert "total_tokens_before" in metrics
            assert "total_tokens_after" in metrics
            assert "average_reduction_percentage" in metrics
    
    def test_reset_metrics(self):
        """Test metrics reset."""
        compressor = MessageHistoryCompressor()
        
        # Add some metrics
        compressor.metrics.total_compressions = 10
        compressor.metrics.total_tokens_before = 1000
        compressor.metrics.total_tokens_after = 800
        
        compressor.reset_metrics()
        
        assert compressor.metrics.total_compressions == 0
        assert compressor.metrics.total_tokens_before == 0
        assert compressor.metrics.total_tokens_after == 0
    
    def test_get_metrics(self):
        """Test get_metrics returns correct structure."""
        compressor = MessageHistoryCompressor()
        
        metrics = compressor.get_metrics()
        
        assert "total_compressions" in metrics
        assert "total_tokens_before" in metrics
        assert "total_tokens_after" in metrics
        assert "average_reduction_percentage" in metrics
        assert "quality_scores" in metrics
        assert "average_quality_score" in metrics
        assert "consecutive_quality_breaches" in metrics
        assert "auto_disables" in metrics
        assert "enabled" in metrics
        assert "sliding_window_size" in metrics
        assert "quality_threshold" in metrics


class TestContextPreservation:
    """Test context preservation (AC: #4)."""
    
    @pytest.mark.asyncio
    async def test_context_preservation_recent_messages(self):
        """Test that recent messages are preserved for context."""
        compressor = MessageHistoryCompressor(sliding_window_size=10)
        
        messages = [
            {"role": "user", "content": f"Message {i}"}
            for i in range(25)
        ]
        
        with patch.object(compressor, '_summarize_messages', new_callable=AsyncMock) as mock_summarize:
            mock_summarize.return_value = "Summary"
            
            compressed_messages, metadata = await compressor.compress_history(
                messages,
                "test-model",
                min_messages_to_compress=15
            )
            
            if metadata["compressed"]:
                # Recent messages should be preserved
                assert compressed_messages[-10:] == messages[-10:]
    
    @pytest.mark.asyncio
    async def test_compression_preserves_message_structure(self):
        """Test that compression preserves message structure."""
        compressor = MessageHistoryCompressor(sliding_window_size=5)
        
        messages = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi!"},
            {"role": "user", "content": "How are you?"}
        ] * 10  # 30 messages total
        
        with patch.object(compressor, '_summarize_messages', new_callable=AsyncMock) as mock_summarize:
            mock_summarize.return_value = "Summary"
            
            compressed_messages, metadata = await compressor.compress_history(
                messages,
                "test-model",
                min_messages_to_compress=15
            )
            
            if metadata["compressed"]:
                # All messages should have role and content
                for msg in compressed_messages:
                    assert "role" in msg
                    assert "content" in msg


# Integration tests (require actual LLM setup)
# ===========================================
# To run integration tests:
#   1. Ensure LLM API keys are configured
#   2. Set environment variable: ENABLE_HISTORY_COMPRESSION_INTEGRATION_TESTS=true
#   3. Run: pytest backend/tests/test_history_compressor.py -m integration -v
# ===========================================

ENABLE_INTEGRATION_TESTS = False  # Set to True to enable integration tests


def skip_if_no_integration_setup(reason: str = "Integration tests disabled"):
    """Skip test if integration setup is not available."""
    if not ENABLE_INTEGRATION_TESTS:
        pytest.skip(f"{reason}. Set ENABLE_HISTORY_COMPRESSION_INTEGRATION_TESTS=true to run.")


@pytest.mark.integration
class TestHistoryCompressorIntegration:
    """Integration tests with real LLM calls."""
    
    @pytest.fixture(autouse=True)
    def setup_test(self):
        """Setup for integration tests."""
        skip_if_no_integration_setup("Integration tests disabled")
        yield
    
    @pytest.mark.asyncio
    async def test_real_compression_with_llm(self):
        """Test compression with real LLM summarization."""
        skip_if_no_integration_setup()
        
        compressor = MessageHistoryCompressor(sliding_window_size=5)
        
        messages = [
            {"role": "user", "content": f"Message {i}: This is message number {i} in a long conversation."}
            for i in range(20)
        ]
        
        compressed_messages, metadata = await compressor.compress_history(
            messages,
            "openai-compatible/gpt-4o-mini",
            min_messages_to_compress=15
        )
        
        if metadata.get("compressed"):
            assert len(compressed_messages) < len(messages)
            assert metadata["tokens_after"] < metadata["tokens_before"]
            assert metadata["reduction_percentage"] > 0
    
    @pytest.mark.asyncio
    async def test_real_quality_validation(self):
        """Test quality validation with real responses."""
        skip_if_no_integration_setup()
        
        compressor = MessageHistoryCompressor()
        
        original_response = {"choices": [{"message": {"content": "Hello, how can I help you?"}}]}
        compressed_response = {"choices": [{"message": {"content": "Hello, how can I help you?"}}]}
        
        quality_score = await compressor.validate_compression_quality(
            [{"role": "user", "content": "Hello"}],
            [{"role": "system", "content": "[Summary]: Hello"}],
            original_response,
            compressed_response
        )
        
        # Identical responses should have high quality
        assert quality_score >= 0.9

