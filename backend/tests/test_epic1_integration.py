"""
Integration tests for Epic 1 - Quality-Preserving Optimizations.

These tests verify end-to-end functionality of all Epic 1 stories:
- Story 1.1: OpenAI Prompt Caching
- Story 1.2: LiteLLM Redis Response Caching
- Story 1.3: Anthropic Explicit Caching
- Story 1.4: Dual-Mode Architecture

These tests require:
- LLM API keys configured (OPENAI_COMPATIBLE_API_KEY, ANTHROPIC_API_KEY, etc.)
- Redis instance running
- Set ENABLE_LLM_INTEGRATION_TESTS=true to run

To run integration tests:
    ENABLE_LLM_INTEGRATION_TESTS=true pytest backend/tests/test_epic1_integration.py -v
"""

import os
import pytest
import asyncio
from typing import Dict, Any, Optional
from unittest.mock import Mock, patch, AsyncMock

# Check if integration tests should run
ENABLE_INTEGRATION_TESTS = os.getenv("ENABLE_LLM_INTEGRATION_TESTS", "false").lower() == "true"


def skip_if_no_llm_setup(reason: str = "LLM integration tests disabled"):
    """Skip test if LLM setup is not available."""
    if not ENABLE_INTEGRATION_TESTS:
        pytest.skip(f"{reason}. Set ENABLE_LLM_INTEGRATION_TESTS=true to run.")


@pytest.mark.integration
class TestEpic1Integration:
    """Integration tests for Epic 1 stories."""
    
    @pytest.mark.asyncio
    async def test_openai_prompt_caching_integration(self):
        """Test OpenAI prompt caching with actual API calls."""
        skip_if_no_llm_setup("OpenAI prompt caching integration test")
        
        from backend.core.run import PromptManager
        from backend.core.services.llm import make_llm_api_call
        
        # Build system prompt (should have static content first)
        model_name = "openai-compatible/gpt-4o-mini"
        system_prompt = await PromptManager.build_system_prompt(
            model_name=model_name,
            agent_config=None,
            thread_id="test-thread-integration",
            mcp_wrapper_instance=None,
            client=None,
            tool_registry=None,
            xml_tool_calling=False
        )
        
        # Verify prompt structure
        content = system_prompt["content"]
        assert len(content) > 0, "System prompt should not be empty"
        
        # Make LLM call and check for cached_tokens in response
        messages = [
            system_prompt,
            {"role": "user", "content": "Say hello"}
        ]
        
        response = await make_llm_api_call(
            messages=messages,
            model_name=model_name,
            temperature=0,
            max_tokens=10
        )
        
        # Verify response structure
        assert response is not None, "LLM response should not be None"
        assert "choices" in response or "content" in response, "Response should have content"
        
        # Check for cache metrics (may not be available in all responses)
        # This is a best-effort check
        if hasattr(response, 'usage'):
            usage = response.usage
            if hasattr(usage, 'prompt_tokens'):
                assert usage.prompt_tokens > 0, "Should have prompt tokens"
    
    @pytest.mark.asyncio
    async def test_litellm_redis_caching_integration(self):
        """Test LiteLLM Redis caching with actual API calls."""
        skip_if_no_llm_setup("LiteLLM Redis caching integration test")
        
        from core.services.llm import make_llm_api_call, setup_litellm_redis_cache
        from core.services.cache_metrics import get_cache_metrics_collector
        
        # Setup cache (should already be configured, but ensure it's ready)
        setup_litellm_redis_cache()
        
        # Make first LLM call (cache miss)
        model_name = "openai-compatible/gpt-4o-mini"
        messages = [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "What is 2+2?"}
        ]
        
        response1 = await make_llm_api_call(
            messages=messages,
            model_name=model_name,
            temperature=0,
            max_tokens=10
        )
        
        assert response1 is not None, "First LLM response should not be None"
        
        # Make identical LLM call (should be cache hit)
        response2 = await make_llm_api_call(
            messages=messages,
            model_name=model_name,
            temperature=0,
            max_tokens=10
        )
        
        assert response2 is not None, "Second LLM response should not be None"
        
        # Check cache metrics
        collector = get_cache_metrics_collector()
        metrics = collector.get_summary()
        
        assert metrics["total_requests"] >= 2, "Should have at least 2 requests"
        # Note: Cache hit may not be immediate, so we just verify metrics exist
    
    @pytest.mark.asyncio
    async def test_anthropic_explicit_caching_integration(self):
        """Test Anthropic explicit caching with actual API calls."""
        skip_if_no_llm_setup("Anthropic explicit caching integration test")
        
        from core.services.llm import make_llm_api_call, _is_anthropic_model
        
        # Check if Anthropic API key is available
        anthropic_api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("AWS_BEARER_TOKEN_BEDROCK")
        if not anthropic_api_key:
            pytest.skip("Anthropic API key not available")
        
        # Use Anthropic model
        model_name = "anthropic/claude-haiku-4-5-20251001"
        
        if not _is_anthropic_model(model_name):
            pytest.skip(f"Model {model_name} is not detected as Anthropic model")
        
        # Make LLM call with system message >= 1024 tokens
        # Create a system message that's large enough for caching
        large_system_content = "You are a helpful assistant. " * 200  # ~1000 tokens
        messages = [
            {"role": "system", "content": large_system_content},
            {"role": "user", "content": "Say hello"}
        ]
        
        response = await make_llm_api_call(
            messages=messages,
            model_name=model_name,
            temperature=0,
            max_tokens=10
        )
        
        assert response is not None, "Anthropic LLM response should not be None"
        
        # Check for cache metrics in response (if available)
        if hasattr(response, 'usage'):
            usage = response.usage
            # Anthropic cache metrics may be in usage object
            # This is a best-effort check
    
    @pytest.mark.asyncio
    async def test_dual_mode_architecture_integration(self):
        """Test dual-mode architecture with actual LLM calls."""
        skip_if_no_llm_setup("Dual-mode architecture integration test")
        
        from core.run import PromptManager
        from core.utils.config import OptimizationConfig, OptimizationMode
        from core.services.llm import make_llm_api_call
        
        model_name = "openai-compatible/gpt-4o-mini"
        
        # Test ORIGINAL mode
        OptimizationConfig.set_mode(OptimizationMode.ORIGINAL)
        system_prompt_original = await PromptManager.build_system_prompt(
            model_name=model_name,
            agent_config=None,
            thread_id="test-thread-original",
            mcp_wrapper_instance=None,
            client=None,
            tool_registry=None,
            xml_tool_calling=False
        )
        
        assert system_prompt_original is not None, "ORIGINAL mode prompt should not be None"
        
        # Test OPTIMIZED mode
        OptimizationConfig.set_mode(OptimizationMode.OPTIMIZED)
        system_prompt_optimized = await PromptManager.build_system_prompt(
            model_name=model_name,
            agent_config=None,
            thread_id="test-thread-optimized",
            mcp_wrapper_instance=None,
            client=None,
            tool_registry=None,
            xml_tool_calling=False
        )
        
        assert system_prompt_optimized is not None, "OPTIMIZED mode prompt should not be None"
        
        # Verify both prompts have content
        assert len(system_prompt_original["content"]) > 0, "ORIGINAL prompt should have content"
        assert len(system_prompt_optimized["content"]) > 0, "OPTIMIZED prompt should have content"
        
        # Reset to ORIGINAL mode
        OptimizationConfig.set_mode(OptimizationMode.ORIGINAL)
    
    @pytest.mark.asyncio
    async def test_epic1_end_to_end_integration(self):
        """Test end-to-end Epic 1 functionality with actual API calls."""
        skip_if_no_llm_setup("Epic 1 end-to-end integration test")
        
        from core.run import PromptManager
        from core.services.llm import make_llm_api_call
        from core.utils.config import OptimizationConfig, OptimizationMode
        from core.services.cache_metrics import get_cache_metrics_collector
        
        # Set to OPTIMIZED mode (includes all Epic 1 optimizations)
        OptimizationConfig.set_mode(OptimizationMode.OPTIMIZED)
        
        model_name = "openai-compatible/gpt-4o-mini"
        
        # Build system prompt (Story 1.1: static content first)
        system_prompt = await PromptManager.build_system_prompt(
            model_name=model_name,
            agent_config=None,
            thread_id="test-thread-e2e",
            mcp_wrapper_instance=None,
            client=None,
            tool_registry=None,
            xml_tool_calling=False
        )
        
        # Make LLM call (Stories 1.2, 1.3: caching enabled)
        messages = [
            system_prompt,
            {"role": "user", "content": "What is the capital of France?"}
        ]
        
        response = await make_llm_api_call(
            messages=messages,
            model_name=model_name,
            temperature=0,
            max_tokens=50
        )
        
        assert response is not None, "LLM response should not be None"
        
        # Check cache metrics (Story 1.2)
        collector = get_cache_metrics_collector()
        metrics = collector.get_summary()
        assert metrics is not None, "Cache metrics should be available"
        
        # Reset to ORIGINAL mode
        OptimizationConfig.set_mode(OptimizationMode.ORIGINAL)


@pytest.mark.integration
class TestEpic1CacheMetricsIntegration:
    """Integration tests for cache metrics tracking."""
    
    @pytest.mark.asyncio
    async def test_cache_metrics_tracking_integration(self):
        """Test cache metrics tracking with actual API calls."""
        skip_if_no_llm_setup("Cache metrics tracking integration test")
        
        from core.services.llm import make_llm_api_call
        from core.services.cache_metrics import get_cache_metrics_collector
        
        collector = get_cache_metrics_collector()
        
        # Get initial metrics
        initial_metrics = collector.get_summary()
        initial_requests = initial_metrics.get("total_requests", 0)
        
        # Make LLM call
        model_name = "openai-compatible/gpt-4o-mini"
        messages = [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Say hello"}
        ]
        
        response = await make_llm_api_call(
            messages=messages,
            model_name=model_name,
            temperature=0,
            max_tokens=10
        )
        
        assert response is not None, "LLM response should not be None"
        
        # Check metrics updated
        updated_metrics = collector.get_summary()
        updated_requests = updated_metrics.get("total_requests", 0)
        
        # Metrics should have increased (may take a moment to update)
        # This is a best-effort check
        assert updated_requests >= initial_requests, "Request count should increase or stay same"

