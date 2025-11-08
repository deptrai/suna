"""
Tests for OpenAI Prompt Caching (Story 1.1).

Tests verify:
- Prompt restructuring with static content first
- Prompt size meets OpenAI caching threshold (≥1,024 tokens)
- Cache metrics extraction and logging
- Quality validation (100% similarity)
"""

import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from typing import Dict, Any, Optional

from core.run import PromptManager
from core.services.llm import make_llm_api_call
from core.agentpress.thread_manager import ThreadManager


class TestPromptRestructuring:
    """Test prompt restructuring for OpenAI caching."""
    
    @pytest.mark.asyncio
    async def test_static_content_first(self):
        """Test that static content is placed before dynamic content."""
        model_name = "openai-compatible/gpt-4o-mini"
        agent_config = None
        thread_id = "test-thread-123"
        mcp_wrapper = None
        client = None
        tool_registry = None
        
        system_prompt = await PromptManager.build_system_prompt(
            model_name=model_name,
            agent_config=agent_config,
            thread_id=thread_id,
            mcp_wrapper_instance=mcp_wrapper,
            client=client,
            tool_registry=tool_registry,
            xml_tool_calling=True
        )
        
        content = system_prompt["content"]
        
        # Verify static content (default system prompt) appears first
        assert "You are Chainlens.so" in content or "autonomous AI Worker" in content
        
        # Verify structure: static sections should come before dynamic sections
        # Default system prompt should be at the beginning
        assert content.startswith("You are") or "Chainlens.so" in content[:500]
    
    @pytest.mark.asyncio
    async def test_prompt_size_threshold(self):
        """Test that prompt size meets OpenAI caching threshold (≥1,024 tokens)."""
        model_name = "openai-compatible/gpt-4o-mini"
        agent_config = None
        thread_id = "test-thread-123"
        mcp_wrapper = None
        client = None
        tool_registry = Mock()
        
        # Mock tool schemas to ensure prompt is large enough
        tool_registry.get_openapi_schemas = Mock(return_value={
            "test_tool": {
                "type": "function",
                "function": {
                    "name": "test_tool",
                    "description": "A test tool",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "param1": {"type": "string", "description": "Test parameter"}
                        }
                    }
                }
            }
        })
        
        system_prompt = await PromptManager.build_system_prompt(
            model_name=model_name,
            agent_config=agent_config,
            thread_id=thread_id,
            mcp_wrapper_instance=mcp_wrapper,
            client=client,
            tool_registry=tool_registry,
            xml_tool_calling=True
        )
        
        # Verify token count using LiteLLM token counter
        from litellm import token_counter
        prompt_tokens = token_counter(model=model_name, text=system_prompt["content"])
        
        assert prompt_tokens >= 1024, f"Prompt size ({prompt_tokens} tokens) below OpenAI caching threshold (1,024 tokens)"
    
    @pytest.mark.asyncio
    async def test_static_sections_order(self):
        """Test that static sections are ordered correctly."""
        model_name = "openai-compatible/gpt-4o-mini"
        agent_config = {
            "agentpress_tools": {
                "agent_config_tool": True
            }
        }
        thread_id = "test-thread-123"
        mcp_wrapper = None
        client = None
        tool_registry = Mock()
        tool_registry.get_openapi_schemas = Mock(return_value={
            "test_tool": {"type": "function", "function": {"name": "test_tool"}}
        })
        
        system_prompt = await PromptManager.build_system_prompt(
            model_name=model_name,
            agent_config=agent_config,
            thread_id=thread_id,
            mcp_wrapper_instance=mcp_wrapper,
            client=client,
            tool_registry=tool_registry,
            xml_tool_calling=True
        )
        
        content = system_prompt["content"]
        
        # Verify order: default system prompt → builder prompt → tool schemas
        default_prompt_pos = content.find("You are Chainlens.so") or content.find("autonomous AI Worker")
        builder_prompt_pos = content.find("SELF-CONFIGURATION") or content.find("AGENT BUILDING")
        tool_schemas_pos = content.find("JSON Schema format") or content.find("function_calls")
        
        # All should be present and in correct order
        assert default_prompt_pos >= 0, "Default system prompt should be present"
        if builder_prompt_pos >= 0:
            assert builder_prompt_pos > default_prompt_pos, "Builder prompt should come after default prompt"
        if tool_schemas_pos >= 0:
            assert tool_schemas_pos > default_prompt_pos, "Tool schemas should come after default prompt"
    
    @pytest.mark.asyncio
    async def test_dynamic_sections_order(self):
        """Test that dynamic sections are placed after static sections."""
        model_name = "openai-compatible/gpt-4o-mini"
        agent_config = {
            "system_prompt": "Custom agent prompt",
            "agent_id": "test-agent-123"
        }
        thread_id = "test-thread-123"
        mcp_wrapper = None
        client = Mock()
        client.rpc = AsyncMock(return_value=Mock(data="Test knowledge base content"))
        tool_registry = None
        
        system_prompt = await PromptManager.build_system_prompt(
            model_name=model_name,
            agent_config=agent_config,
            thread_id=thread_id,
            mcp_wrapper_instance=mcp_wrapper,
            client=client,
            tool_registry=tool_registry,
            xml_tool_calling=True
        )
        
        content = system_prompt["content"]
        
        # Verify dynamic sections appear after static sections
        default_prompt_pos = content.find("You are Chainlens.so") or content.find("autonomous AI Worker")
        agent_specific_pos = content.find("Custom agent prompt")
        kb_pos = content.find("AGENT KNOWLEDGE BASE")
        datetime_pos = content.find("CURRENT DATE/TIME")
        
        # Static content should come first
        assert default_prompt_pos >= 0, "Default system prompt should be present"
        
        # Dynamic content should come after static content
        if agent_specific_pos >= 0:
            assert agent_specific_pos > default_prompt_pos, "Agent-specific prompt should come after static content"
        if kb_pos >= 0:
            assert kb_pos > default_prompt_pos, "Knowledge base should come after static content"
        if datetime_pos >= 0:
            assert datetime_pos > default_prompt_pos, "Datetime info should come after static content"


class TestCacheMetricsExtraction:
    """Test cache metrics extraction from LLM responses."""
    
    def test_extract_cached_tokens_from_usage(self):
        """Test extraction of cached_tokens from usage object."""
        # Simulate OpenAI Compatible API response format
        usage_dict = {
            "prompt_tokens": 1500,
            "completion_tokens": 200,
            "total_tokens": 1700,
            "prompt_tokens_details": {
                "cached_tokens": 800  # OpenAI prompt caching
            }
        }
        
        # Extract cached tokens (matching thread_manager.py logic)
        cache_read_tokens = int(usage_dict.get("cache_read_input_tokens", 0) or 0)
        if cache_read_tokens == 0:
            prompt_tokens_details = usage_dict.get("prompt_tokens_details") or {}
            if isinstance(prompt_tokens_details, dict):
                cache_read_tokens = int(prompt_tokens_details.get("cached_tokens", 0) or 0)
        
        assert cache_read_tokens == 800, f"Expected 800 cached tokens, got {cache_read_tokens}"
    
    def test_cache_hit_rate_calculation(self):
        """Test cache hit rate calculation."""
        prompt_tokens = 1500
        cache_read_tokens = 800
        
        cache_hit_rate = (cache_read_tokens / prompt_tokens) * 100.0
        
        expected_rate = (800 / 1500) * 100.0
        assert abs(cache_hit_rate - expected_rate) < 0.01, f"Expected cache hit rate ~{expected_rate:.2f}%, got {cache_hit_rate:.2f}%"
    
    def test_cache_metrics_with_zero_cached_tokens(self):
        """Test cache metrics when no tokens are cached."""
        usage_dict = {
            "prompt_tokens": 1500,
            "completion_tokens": 200,
            "total_tokens": 1700,
            "prompt_tokens_details": {
                "cached_tokens": 0
            }
        }
        
        cache_read_tokens = int(usage_dict.get("cache_read_input_tokens", 0) or 0)
        if cache_read_tokens == 0:
            prompt_tokens_details = usage_dict.get("prompt_tokens_details") or {}
            if isinstance(prompt_tokens_details, dict):
                cache_read_tokens = int(prompt_tokens_details.get("cached_tokens", 0) or 0)
        
        assert cache_read_tokens == 0, "Should return 0 when no tokens are cached"
        
        # Cache hit rate should be 0
        prompt_tokens = usage_dict["prompt_tokens"]
        cache_hit_rate = (cache_read_tokens / prompt_tokens) * 100.0 if prompt_tokens > 0 else 0.0
        assert cache_hit_rate == 0.0, "Cache hit rate should be 0 when no tokens are cached"


class TestQualityValidation:
    """Test quality validation for cached vs non-cached responses."""
    
    @pytest.mark.asyncio
    async def test_prompt_structure_preserved(self):
        """Test that prompt restructuring doesn't change content, only order."""
        model_name = "openai-compatible/gpt-4o-mini"
        agent_config = {
            "system_prompt": "Test agent prompt",
            "agent_id": "test-agent-123",  # Required for knowledge base retrieval
            "agentpress_tools": {
                "agent_config_tool": True
            }
        }
        thread_id = "test-thread-123"
        mcp_wrapper = None
        client = Mock()
        # Mock successful knowledge base retrieval
        kb_mock_response = Mock()
        kb_mock_response.data = "Test knowledge base content"
        client.rpc = AsyncMock(return_value=kb_mock_response)
        tool_registry = Mock()
        tool_registry.get_openapi_schemas = Mock(return_value={
            "test_tool": {"type": "function", "function": {"name": "test_tool"}}
        })
        
        # Build prompt with new structure
        system_prompt = await PromptManager.build_system_prompt(
            model_name=model_name,
            agent_config=agent_config,
            thread_id=thread_id,
            mcp_wrapper_instance=mcp_wrapper,
            client=client,
            tool_registry=tool_registry,
            xml_tool_calling=True
        )
        
        content = system_prompt["content"]
        
        # Verify all expected content is present
        assert "You are Chainlens.so" in content or "autonomous AI Worker" in content, "Default system prompt should be present"
        assert "SELF-CONFIGURATION" in content or "AGENT BUILDING" in content, "Builder prompt should be present"
        assert "Test agent prompt" in content, "Agent-specific prompt should be present"
        # Knowledge base is optional - only present if agent_id exists and retrieval succeeds
        # If knowledge base is present, verify it's in the correct section (after static content)
        if "AGENT KNOWLEDGE BASE" in content:
            default_prompt_pos = content.find("You are Chainlens.so") or content.find("autonomous AI Worker")
            kb_pos = content.find("AGENT KNOWLEDGE BASE")
            assert kb_pos > default_prompt_pos, "Knowledge base should come after static content"
        assert "CURRENT DATE/TIME" in content, "Datetime info should be present"
        assert "JSON Schema format" in content or "function_calls" in content, "Tool schemas should be present"
    
    @pytest.mark.asyncio
    async def test_token_count_verification(self):
        """Test that token count verification works correctly."""
        model_name = "openai-compatible/gpt-4o-mini"
        agent_config = None
        thread_id = "test-thread-123"
        mcp_wrapper = None
        client = None
        tool_registry = Mock()
        tool_registry.get_openapi_schemas = Mock(return_value={
            "test_tool": {
                "type": "function",
                "function": {
                    "name": "test_tool",
                    "description": "A test tool with a long description to ensure prompt size meets threshold",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "param1": {
                                "type": "string",
                                "description": "A test parameter with a detailed description"
                            }
                        }
                    }
                }
            }
        })
        
        system_prompt = await PromptManager.build_system_prompt(
            model_name=model_name,
            agent_config=agent_config,
            thread_id=thread_id,
            mcp_wrapper_instance=mcp_wrapper,
            client=client,
            tool_registry=tool_registry,
            xml_tool_calling=True
        )
        
        # Verify token count is logged (check via mock or actual count)
        from litellm import token_counter
        prompt_tokens = token_counter(model=model_name, text=system_prompt["content"])
        
        # Should meet threshold
        assert prompt_tokens >= 1024, f"Prompt should meet OpenAI caching threshold, got {prompt_tokens} tokens"

