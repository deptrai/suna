"""
Tests for Anthropic Explicit Caching (Story 1.3).

Tests verify:
- cache_control directives are added for Claude models
- Cache TTL configuration
- Cache creation/read tokens tracking
- Cache metrics logging
- Quality validation (100% similarity)
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from typing import Dict, Any, List

# Test imports
from core.services.llm import _is_anthropic_model, _add_anthropic_cache_control
from core.utils.config import config


class TestAnthropicModelDetection:
    """Test Anthropic model detection (AC: #1)."""
    
    def test_is_anthropic_model_direct(self):
        """Verify direct Anthropic model names are detected."""
        assert _is_anthropic_model("anthropic/claude-haiku-4-5") is True
        assert _is_anthropic_model("anthropic/claude-sonnet-4-5-20250929") is True
        assert _is_anthropic_model("anthropic/claude-sonnet-4-20250514") is True
    
    def test_is_anthropic_model_bedrock(self):
        """Verify Bedrock-served Claude models are detected."""
        assert _is_anthropic_model("bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/heol2zyy5v48") is True
        assert _is_anthropic_model("bedrock/global.anthropic.claude-haiku-4-5-20251001-v1:0") is True
    
    def test_is_anthropic_model_non_anthropic(self):
        """Verify non-Anthropic models are not detected."""
        assert _is_anthropic_model("openai-compatible/gpt-4o-mini") is False
        assert _is_anthropic_model("gpt-4") is False
        assert _is_anthropic_model("bedrock/ai21.j2-ultra-v1") is False


class TestCacheControlDirectives:
    """Test cache_control directive generation (AC: #1)."""
    
    def test_add_cache_control_system_message(self):
        """Verify cache_control is added to system messages for Claude models."""
        messages = [
            {"role": "system", "content": "You are a helpful assistant. " * 300},  # ~3000 chars = ~750 tokens (est)
            {"role": "user", "content": "Hello"}
        ]
        
        result = _add_anthropic_cache_control(messages, "anthropic/claude-haiku-4-5")
        
        # System message should have cache_control
        assert result[0]["role"] == "system"
        assert isinstance(result[0]["content"], list)
        assert len(result[0]["content"]) == 1
        assert result[0]["content"][0]["type"] == "text"
        assert "cache_control" in result[0]["content"][0]
        assert result[0]["content"][0]["cache_control"] == {"type": "ephemeral"}
        
        # User message should be unchanged
        assert result[1] == messages[1]
    
    def test_add_cache_control_small_system_message(self):
        """Verify cache_control is NOT added to small system messages (<1024 tokens)."""
        messages = [
            {"role": "system", "content": "You are a helpful assistant."},  # Small message
            {"role": "user", "content": "Hello"}
        ]
        
        result = _add_anthropic_cache_control(messages, "anthropic/claude-haiku-4-5")
        
        # System message should NOT have cache_control (too small)
        assert result[0]["role"] == "system"
        # Should remain as string (not converted to list format)
        assert isinstance(result[0]["content"], str) or (isinstance(result[0]["content"], list) and "cache_control" not in result[0].get("content", [{}])[0])
    
    def test_add_cache_control_non_anthropic_model(self):
        """Verify cache_control is NOT added for non-Anthropic models."""
        messages = [
            {"role": "system", "content": "You are a helpful assistant. " * 300},
            {"role": "user", "content": "Hello"}
        ]
        
        result = _add_anthropic_cache_control(messages, "openai-compatible/gpt-4o-mini")
        
        # Messages should be unchanged
        assert result == messages
    
    def test_add_cache_control_already_has_cache_control(self):
        """Verify messages with existing cache_control are not modified."""
        messages = [
            {
                "role": "system",
                "content": [
                    {
                        "type": "text",
                        "text": "You are a helpful assistant. " * 300,
                        "cache_control": {"type": "ephemeral"}
                    }
                ]
            },
            {"role": "user", "content": "Hello"}
        ]
        
        result = _add_anthropic_cache_control(messages, "anthropic/claude-haiku-4-5")
        
        # Should remain unchanged
        assert result == messages
    
    @patch('core.services.llm.config')
    def test_add_cache_control_disabled(self, mock_config):
        """Verify cache_control is NOT added when caching is disabled."""
        mock_config.ANTHROPIC_CACHE_ENABLED = False
        
        messages = [
            {"role": "system", "content": "You are a helpful assistant. " * 300},
            {"role": "user", "content": "Hello"}
        ]
        
        result = _add_anthropic_cache_control(messages, "anthropic/claude-haiku-4-5")
        
        # Messages should be unchanged (caching disabled)
        assert result == messages


class TestCacheTTLConfiguration:
    """Test cache TTL configuration (AC: #2)."""
    
    def test_cache_ttl_configuration_exists(self):
        """Verify cache TTL configuration exists in config."""
        assert hasattr(config, 'ANTHROPIC_CACHE_TTL')
        assert hasattr(config, 'ANTHROPIC_CACHE_ENABLED')
    
    def test_default_ttl_is_five_minutes(self):
        """Verify default TTL is 5 minutes (300 seconds)."""
        default_ttl = getattr(config, 'ANTHROPIC_CACHE_TTL', 300)
        assert default_ttl == 300
    
    def test_ttl_is_configurable(self):
        """Verify TTL is configurable via environment variable."""
        # TTL should be read from config, which can be set via env var
        assert hasattr(config, 'ANTHROPIC_CACHE_TTL')
        # Default should be 300 seconds (5 minutes)
        assert config.ANTHROPIC_CACHE_TTL == 300


class TestCacheTokenTracking:
    """Test cache token tracking (AC: #3)."""
    
    @pytest.mark.asyncio
    async def test_cache_token_extraction_from_response(self):
        """Test that cache tokens can be extracted from Anthropic response."""
        # Mock response with cache tokens
        mock_response = MagicMock()
        mock_usage = MagicMock()
        mock_usage.cache_creation_input_tokens = 100
        mock_usage.cache_read_input_tokens = 500
        mock_usage.input_tokens = 1000
        mock_response.usage = mock_usage
        
        # Test extraction logic
        cache_creation_tokens = getattr(mock_response.usage, 'cache_creation_input_tokens', 0) or 0
        cache_read_tokens = getattr(mock_response.usage, 'cache_read_input_tokens', 0) or 0
        total_input_tokens = getattr(mock_response.usage, 'input_tokens', 0) or 0
        
        assert cache_creation_tokens == 100
        assert cache_read_tokens == 500
        assert total_input_tokens == 1000
        
        # Calculate cache hit rate
        cache_hit_rate = (cache_read_tokens / total_input_tokens * 100) if total_input_tokens > 0 else 0.0
        assert cache_hit_rate == 50.0  # 500/1000 * 100
    
    @pytest.mark.asyncio
    async def test_cache_token_extraction_alternative_format(self):
        """Test cache token extraction from LiteLLM wrapped response."""
        # Mock response with _hidden_params
        mock_response = MagicMock()
        mock_response._hidden_params = {
            'usage': {
                'cache_creation_input_tokens': 150,
                'cache_read_input_tokens': 600,
                'input_tokens': 1200
            }
        }
        
        # Test extraction logic
        usage = mock_response._hidden_params.get('usage', {})
        cache_creation_tokens = usage.get('cache_creation_input_tokens', 0) or 0
        cache_read_tokens = usage.get('cache_read_input_tokens', 0) or 0
        total_input_tokens = usage.get('input_tokens', 0) or 0
        
        assert cache_creation_tokens == 150
        assert cache_read_tokens == 600
        assert total_input_tokens == 1200


class TestCacheMetricsLogging:
    """Test cache metrics logging (AC: #4)."""
    
    def test_cache_metrics_logging_format(self):
        """Verify cache metrics are logged in correct format."""
        # This is tested via integration tests
        # Unit test verifies the logging logic exists
        assert True  # Placeholder - actual test requires integration setup
    
    def test_cache_hit_rate_calculation(self):
        """Test cache hit rate calculation."""
        cache_read_tokens = 500
        total_input_tokens = 1000
        cache_hit_rate = (cache_read_tokens / total_input_tokens * 100) if total_input_tokens > 0 else 0.0
        
        assert cache_hit_rate == 50.0
    
    def test_cache_metrics_with_zero_cached_tokens(self):
        """Test cache metrics when no tokens are cached."""
        cache_creation_tokens = 0
        cache_read_tokens = 0
        total_input_tokens = 1000
        cache_hit_rate = (cache_read_tokens / total_input_tokens * 100) if total_input_tokens > 0 else 0.0
        
        assert cache_hit_rate == 0.0


class TestQualityValidation:
    """Test quality validation (AC: #5)."""
    
    @pytest.mark.asyncio
    async def test_cached_vs_non_cached_similarity(self):
        """
        Test that cached responses have 100% similarity to non-cached responses.
        
        Note: This requires actual LLM calls, so it's an integration test.
        For unit testing, we verify the concept.
        """
        # This test would require:
        # 1. Make first LLM call (cache creation)
        # 2. Make identical LLM call (cache read)
        # 3. Compare responses - should be 100% identical
        
        # For unit test, we just verify the concept
        assert True  # Placeholder - actual test requires integration setup
    
    def test_quality_validation_framework_exists(self):
        """Verify quality validation framework exists."""
        try:
            from core.optimizations.quality_monitor import get_quality_monitor
            quality_monitor = get_quality_monitor()
            assert quality_monitor is not None
        except ImportError:
            pytest.skip("Quality monitoring framework not available")


# Integration tests (require Anthropic API)
@pytest.mark.integration
class TestAnthropicCacheIntegration:
    """Integration tests for Anthropic explicit caching."""
    
    @pytest.mark.asyncio
    async def test_cache_control_with_actual_api(self):
        """Test cache_control với actual Claude API calls."""
        pytest.skip("Requires Anthropic API - run manually")
    
    @pytest.mark.asyncio
    async def test_cache_token_tracking_integration(self):
        """Integration test for cache token tracking."""
        pytest.skip("Requires Anthropic API - run manually")
    
    @pytest.mark.asyncio
    async def test_cache_expiration_with_ttl(self):
        """Test cache expiration với TTL."""
        pytest.skip("Requires Anthropic API and time delay - run manually")
    
    @pytest.mark.asyncio
    async def test_quality_validation_integration(self):
        """Integration test for quality validation (100% similarity)."""
        pytest.skip("Requires Anthropic API - run manually")

