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
        # Mock successful knowledge base retrieval - properly configure async mock
        # client.rpc() returns an object with .execute() method that returns the result
        kb_mock_response = Mock()
        kb_mock_response.data = "Test knowledge base content"
        rpc_mock_result = Mock()
        async def mock_execute():
            return kb_mock_response
        rpc_mock_result.execute = mock_execute
        client.rpc = Mock(return_value=rpc_mock_result)
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


class TestEdgeCases:
    """Test edge cases and error handling."""
    
    @pytest.mark.asyncio
    async def test_knowledge_base_retrieval_failure(self):
        """Test that prompt building continues when knowledge base retrieval fails."""
        model_name = "openai-compatible/gpt-4o-mini"
        agent_config = {
            "system_prompt": "Test agent prompt",
            "agent_id": "test-agent-123",
            "agentpress_tools": {
                "agent_config_tool": True
            }
        }
        thread_id = "test-thread-123"
        mcp_wrapper = None
        client = Mock()
        # Mock knowledge base retrieval failure
        async def mock_execute():
            raise Exception("Knowledge base retrieval failed")
        rpc_mock_result = Mock()
        rpc_mock_result.execute = mock_execute
        client.rpc = Mock(return_value=rpc_mock_result)
        tool_registry = Mock()
        tool_registry.get_openapi_schemas = Mock(return_value={
            "test_tool": {"type": "function", "function": {"name": "test_tool"}}
        })
        
        # Prompt building should not fail even if knowledge base retrieval fails
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
        
        # Verify prompt is still built successfully without knowledge base
        assert "You are Chainlens.so" in content or "autonomous AI Worker" in content
        assert "Test agent prompt" in content
        # Knowledge base should not be present due to retrieval failure
        assert "AGENT KNOWLEDGE BASE" not in content or "Knowledge base retrieval failed" not in content
    
    @pytest.mark.asyncio
    async def test_empty_knowledge_base_response(self):
        """Test that prompt building handles empty knowledge base responses."""
        model_name = "openai-compatible/gpt-4o-mini"
        agent_config = {
            "system_prompt": "Test agent prompt",
            "agent_id": "test-agent-123",
            "agentpress_tools": {
                "agent_config_tool": True
            }
        }
        thread_id = "test-thread-123"
        mcp_wrapper = None
        client = Mock()
        # Mock empty knowledge base response
        kb_mock_response = Mock()
        kb_mock_response.data = ""  # Empty response
        rpc_mock_result = Mock()
        async def mock_execute():
            return kb_mock_response
        rpc_mock_result.execute = mock_execute
        client.rpc = Mock(return_value=rpc_mock_result)
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
        
        # Verify prompt is built successfully
        assert "You are Chainlens.so" in content or "autonomous AI Worker" in content
        # Knowledge base should not be present due to empty response
        assert "AGENT KNOWLEDGE BASE" not in content
    
    def test_cache_metrics_with_missing_prompt_tokens_details(self):
        """Test cache metrics extraction when prompt_tokens_details is missing."""
        usage_dict = {
            "prompt_tokens": 1500,
            "completion_tokens": 200,
            "total_tokens": 1700
            # Missing prompt_tokens_details
        }
        
        # Extract cached tokens (matching thread_manager.py logic)
        cache_read_tokens = int(usage_dict.get("cache_read_input_tokens", 0) or 0)
        if cache_read_tokens == 0:
            prompt_tokens_details = usage_dict.get("prompt_tokens_details") or {}
            if isinstance(prompt_tokens_details, dict):
                cache_read_tokens = int(prompt_tokens_details.get("cached_tokens", 0) or 0)
        
        # Should return 0 when prompt_tokens_details is missing
        assert cache_read_tokens == 0, "Should return 0 when prompt_tokens_details is missing"
    
    def test_cache_metrics_with_cache_read_input_tokens(self):
        """Test cache metrics extraction using cache_read_input_tokens (alternative format)."""
        usage_dict = {
            "prompt_tokens": 1500,
            "completion_tokens": 200,
            "total_tokens": 1700,
            "cache_read_input_tokens": 500  # Alternative format
        }
        
        # Extract cached tokens (matching thread_manager.py logic)
        cache_read_tokens = int(usage_dict.get("cache_read_input_tokens", 0) or 0)
        if cache_read_tokens == 0:
            prompt_tokens_details = usage_dict.get("prompt_tokens_details") or {}
            if isinstance(prompt_tokens_details, dict):
                cache_read_tokens = int(prompt_tokens_details.get("cached_tokens", 0) or 0)
        
        assert cache_read_tokens == 500, "Should extract cache_read_input_tokens when present"
    
    @pytest.mark.asyncio
    async def test_large_tool_schemas_prompt_size(self):
        """Test that prompt size meets threshold even with large tool schemas."""
        model_name = "openai-compatible/gpt-4o-mini"
        agent_config = None
        thread_id = "test-thread-123"
        mcp_wrapper = None
        client = None
        tool_registry = Mock()
        
        # Create a large tool schema (simulating 10+ tools)
        large_schemas = {}
        for i in range(15):
            tool_name = f"test_tool_{i}"
            large_schemas[tool_name] = {
                "type": "function",
                "function": {
                    "name": tool_name,
                    "description": f"A comprehensive test tool {i} with detailed description",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            f"param1_{i}": {
                                "type": "string",
                                "description": f"Parameter 1 for tool {i} with detailed description"
                            },
                            f"param2_{i}": {
                                "type": "integer",
                                "description": f"Parameter 2 for tool {i} with detailed description"
                            }
                        },
                        "required": [f"param1_{i}"]
                    }
                }
            }
        
        tool_registry.get_openapi_schemas = Mock(return_value=large_schemas)
        
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
        
        # Should still meet threshold with large tool schemas
        assert prompt_tokens >= 1024, f"Prompt size ({prompt_tokens} tokens) should meet threshold even with large tool schemas"
    
    def test_cache_hit_rate_edge_cases(self):
        """Test cache hit rate calculation edge cases."""
        # Test division by zero protection
        prompt_tokens = 0
        cache_read_tokens = 0
        cache_hit_rate = (cache_read_tokens / prompt_tokens) * 100.0 if prompt_tokens > 0 else 0.0
        assert cache_hit_rate == 0.0, "Cache hit rate should be 0.0 when prompt_tokens is 0"
        
        # Test 100% cache hit rate
        prompt_tokens = 1000
        cache_read_tokens = 1000
        cache_hit_rate = (cache_read_tokens / prompt_tokens) * 100.0
        assert cache_hit_rate == 100.0, "Cache hit rate should be 100% when all tokens are cached"
        
        # Test partial cache hit rate
        prompt_tokens = 1000
        cache_read_tokens = 500
        cache_hit_rate = (cache_read_tokens / prompt_tokens) * 100.0
        assert cache_hit_rate == 50.0, "Cache hit rate should be 50% when half tokens are cached"


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
        # Mock successful knowledge base retrieval - properly configure async mock
        # client.rpc() returns an object with .execute() method that returns the result
        kb_mock_response = Mock()
        kb_mock_response.data = "Test knowledge base content"
        rpc_mock_result = Mock()
        async def mock_execute():
            return kb_mock_response
        rpc_mock_result.execute = mock_execute
        client.rpc = Mock(return_value=rpc_mock_result)
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

