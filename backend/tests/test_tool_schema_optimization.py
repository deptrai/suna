"""
Tests for Tool Schema Optimization (Story 2.3).

Tests minimal format implementation, token reduction, tool calling success rate monitoring,
and rollback mechanism.
"""

import pytest
import json
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from typing import Dict, List, Any

from core.run import PromptManager
from core.agentpress.tool_registry import ToolRegistry
from core.agentpress.tool import ToolResult
from core.optimizations.quality_monitor import QualityMonitor, QualityThresholds
from core.utils.config import OptimizationConfig, OptimizationMode


class TestToolSchemaFormatting:
    """Test tool schema formatting (AC #1, #2)."""
    
    def test_format_tools_full_format(self):
        """Test full format includes all schema fields."""
        openapi_schemas = [
            {
                "type": "function",
                "function": {
                    "name": "test_tool",
                    "description": "Test tool description",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "param1": {"type": "string", "description": "Parameter 1"}
                        },
                        "required": ["param1"]
                    }
                }
            }
        ]
        
        result = PromptManager._format_tools(openapi_schemas, format_type="full")
        parsed = json.loads(result)
        
        assert len(parsed) == 1
        assert "function" in parsed[0]
        assert "parameters" in parsed[0]["function"]
        assert parsed[0]["function"]["name"] == "test_tool"
        assert parsed[0]["function"]["description"] == "Test tool description"
    
    def test_format_tools_minimal_format(self):
        """Test minimal format includes only name and description (AC #2)."""
        openapi_schemas = [
            {
                "type": "function",
                "function": {
                    "name": "test_tool",
                    "description": "Test tool description",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "param1": {"type": "string", "description": "Parameter 1"}
                        },
                        "required": ["param1"]
                    }
                }
            }
        ]
        
        result = PromptManager._format_tools(openapi_schemas, format_type="minimal")
        parsed = json.loads(result)
        
        assert len(parsed) == 1
        assert "function" in parsed[0]
        assert parsed[0]["function"]["name"] == "test_tool"
        assert parsed[0]["function"]["description"] == "Test tool description"
        # Minimal format should NOT include parameters
        assert "parameters" not in parsed[0]["function"]
    
    def test_format_tools_multiple_tools(self):
        """Test formatting multiple tools."""
        openapi_schemas = [
            {
                "type": "function",
                "function": {
                    "name": "tool1",
                    "description": "Tool 1 description",
                    "parameters": {"type": "object", "properties": {}}
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "tool2",
                    "description": "Tool 2 description",
                    "parameters": {"type": "object", "properties": {}}
                }
            }
        ]
        
        result = PromptManager._format_tools(openapi_schemas, format_type="minimal")
        parsed = json.loads(result)
        
        assert len(parsed) == 2
        assert parsed[0]["function"]["name"] == "tool1"
        assert parsed[1]["function"]["name"] == "tool2"
        # Both should be minimal format
        assert "parameters" not in parsed[0]["function"]
        assert "parameters" not in parsed[1]["function"]


class TestTokenReduction:
    """Test token reduction measurement (AC #5)."""
    
    def test_token_reduction_tracking(self):
        """Test that token reduction is tracked and logged."""
        # Simple test: minimal format should be shorter than full format
        
        openapi_schemas = [
            {
                "type": "function",
                "function": {
                    "name": "test_tool",
                    "description": "Test tool description",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "param1": {"type": "string", "description": "Parameter 1 description"},
                            "param2": {"type": "integer", "description": "Parameter 2 description"}
                        },
                        "required": ["param1", "param2"]
                    }
                }
            }
        ]
        
        # Full format should have more characters/tokens
        full_result = PromptManager._format_tools(openapi_schemas, format_type="full")
        minimal_result = PromptManager._format_tools(openapi_schemas, format_type="minimal")
        
        # Minimal format should be shorter (fewer characters)
        assert len(minimal_result) < len(full_result)
        
        # Verify minimal format doesn't include parameters
        minimal_parsed = json.loads(minimal_result)
        assert "parameters" not in minimal_parsed[0]["function"]


class TestToolSuccessRateMonitoring:
    """Test tool calling success rate monitoring (AC #3)."""
    
    @pytest.mark.asyncio
    async def test_track_tool_success_rate_successful(self):
        """Test tracking successful tool calls."""
        from core.agentpress.response_processor import ResponseProcessor
        
        # Mock dependencies
        tool_registry = Mock()
        add_message_callback = AsyncMock(return_value={"message_id": "test-id"})
        trace = Mock()
        
        processor = ResponseProcessor(tool_registry, add_message_callback, trace)
        
        # Create tool results map with successful calls
        tool_results_map = {
            0: (
                {"function_name": "test_tool", "arguments": {}},
                ToolResult(success=True, output="Success"),
                Mock()
            ),
            1: (
                {"function_name": "test_tool2", "arguments": {}},
                ToolResult(success=True, output="Success"),
                Mock()
            )
        }
        
        with patch('core.optimizations.quality_monitor.get_quality_monitor') as mock_get_monitor, \
             patch.object(OptimizationConfig, 'OPTIMIZATION_MODE', OptimizationMode.OPTIMIZED):
            
            # Mock quality monitor
            mock_monitor = AsyncMock()
            mock_get_monitor.return_value = mock_monitor
            
            # Track success rate
            await processor._track_tool_success_rate(tool_results_map)
            
            # Verify metric was tracked
            mock_monitor.track_metric.assert_called_once()
            call_args = mock_monitor.track_metric.call_args
            # track_metric is called with: ("tool_success_rate", value=..., metadata=...)
            assert call_args[0][0] == "tool_success_rate"  # First positional arg
            assert call_args.kwargs["value"] == 1.0  # 100% success rate
    
    @pytest.mark.asyncio
    async def test_track_tool_success_rate_partial_failure(self):
        """Test tracking tool calls with partial failures."""
        from core.agentpress.response_processor import ResponseProcessor
        
        # Mock dependencies
        tool_registry = Mock()
        add_message_callback = AsyncMock(return_value={"message_id": "test-id"})
        trace = Mock()
        
        processor = ResponseProcessor(tool_registry, add_message_callback, trace)
        
        # Create tool results map with one failure
        tool_results_map = {
            0: (
                {"function_name": "test_tool", "arguments": {}},
                ToolResult(success=True, output="Success"),
                Mock()
            ),
            1: (
                {"function_name": "test_tool2", "arguments": {}},
                ToolResult(success=False, output="Error"),
                Mock()
            )
        }
        
        with patch('core.optimizations.quality_monitor.get_quality_monitor') as mock_get_monitor, \
             patch.object(OptimizationConfig, 'OPTIMIZATION_MODE', OptimizationMode.OPTIMIZED):
            
            # Mock quality monitor
            mock_monitor = AsyncMock()
            mock_get_monitor.return_value = mock_monitor
            
            # Track success rate
            await processor._track_tool_success_rate(tool_results_map)
            
            # Verify metric was tracked
            mock_monitor.track_metric.assert_called_once()
            call_args = mock_monitor.track_metric.call_args
            # track_metric is called with: ("tool_success_rate", value=..., metadata=...)
            assert call_args[0][0] == "tool_success_rate"  # First positional arg
            assert call_args.kwargs["value"] == 0.5  # 50% success rate (1/2)


class TestRollbackMechanism:
    """Test rollback mechanism (AC #4)."""
    
    @pytest.mark.asyncio
    async def test_rollback_on_low_success_rate(self):
        """Test that rollback is triggered when success rate < threshold."""
        from core.agentpress.response_processor import ResponseProcessor
        
        # Mock dependencies
        tool_registry = Mock()
        add_message_callback = AsyncMock(return_value={"message_id": "test-id"})
        trace = Mock()
        
        processor = ResponseProcessor(tool_registry, add_message_callback, trace)
        
        # Create tool results map with all failures
        tool_results_map = {
            0: (
                {"function_name": "test_tool", "arguments": {}},
                ToolResult(success=False, output="Error"),
                Mock()
            ),
            1: (
                {"function_name": "test_tool2", "arguments": {}},
                ToolResult(success=False, output="Error"),
                Mock()
            )
        }
        
        with patch('core.optimizations.quality_monitor.get_quality_monitor') as mock_get_monitor, \
             patch.object(OptimizationConfig, 'OPTIMIZATION_MODE', OptimizationMode.OPTIMIZED), \
             patch.object(OptimizationConfig, 'auto_rollback_if_needed', new_callable=AsyncMock) as mock_rollback, \
             patch('core.utils.config.config') as mock_config_obj:
            
            # Mock rollback return value
            mock_rollback.return_value = True
            
            # Mock config values
            mock_config_obj.TOOL_SCHEMA_SUCCESS_RATE_THRESHOLD = 0.95
            mock_config_obj.TOOL_SCHEMA_AUTO_ROLLBACK_ENABLED = True
            
            # Mock quality monitor
            mock_monitor = AsyncMock()
            mock_get_monitor.return_value = mock_monitor
            
            # Track success rate (should trigger rollback)
            await processor._track_tool_success_rate(tool_results_map)
            
            # Verify rollback was called
            mock_rollback.assert_called_once_with(mock_monitor)


class TestQualityValidation:
    """Test quality validation (AC #6)."""
    
    @pytest.mark.asyncio
    async def test_minimal_format_preserves_essential_info(self):
        """Test that minimal format preserves essential information for tool selection."""
        openapi_schemas = [
            {
                "type": "function",
                "function": {
                    "name": "search_web",
                    "description": "Search the web for information",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "Search query"}
                        }
                    }
                }
            }
        ]
        
        minimal_result = PromptManager._format_tools(openapi_schemas, format_type="minimal")
        parsed = json.loads(minimal_result)
        
        # Essential information should be preserved
        assert parsed[0]["function"]["name"] == "search_web"
        assert "description" in parsed[0]["function"]
        assert len(parsed[0]["function"]["description"]) > 0
        
        # Tool name and description are sufficient for tool selection
        assert "search" in parsed[0]["function"]["description"].lower() or \
               "web" in parsed[0]["function"]["description"].lower()


class TestEdgeCases:
    """Test edge cases for tool schema formatting and success rate tracking."""
    
    def test_format_tools_empty_list(self):
        """Test formatting empty schemas list."""
        result = PromptManager._format_tools([], format_type="minimal")
        parsed = json.loads(result)
        
        assert isinstance(parsed, list)
        assert len(parsed) == 0
    
    def test_format_tools_invalid_schemas(self):
        """Test formatting with invalid schemas (non-dict, missing function key)."""
        openapi_schemas = [
            {"type": "invalid"},  # Missing "function" key
            "not a dict",  # Not a dict
            123,  # Not a dict
            {"type": "function", "function": {"name": "valid_tool", "description": "Valid tool"}},  # Valid
        ]
        
        result = PromptManager._format_tools(openapi_schemas, format_type="minimal")
        parsed = json.loads(result)
        
        # Should only include valid schema
        assert len(parsed) == 1
        assert parsed[0]["function"]["name"] == "valid_tool"
    
    def test_format_tools_missing_fields(self):
        """Test formatting schemas with missing name or description fields."""
        openapi_schemas = [
            {
                "type": "function",
                "function": {
                    "name": "tool_with_name",
                    "description": "Has name and description"
                }
            },
            {
                "type": "function",
                "function": {
                    # Missing name - should be skipped
                    "description": "Missing name"
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "tool_no_description",
                    # Missing description - should be included with empty description
                }
            }
        ]
        
        result = PromptManager._format_tools(openapi_schemas, format_type="minimal")
        parsed = json.loads(result)
        
        # Should only include schemas with name (required field)
        assert len(parsed) == 2
        assert parsed[0]["function"]["name"] == "tool_with_name"
        assert parsed[1]["function"]["name"] == "tool_no_description"
        assert parsed[1]["function"]["description"] == ""  # Empty description
    
    def test_format_tools_mixed_valid_invalid(self):
        """Test formatting with mixed valid and invalid schemas."""
        openapi_schemas = [
            {"type": "function", "function": {"name": "tool1", "description": "Tool 1"}},
            {"type": "invalid"},  # Invalid - no function key
            {"type": "function", "function": {}},  # Invalid - no name
            {"type": "function", "function": {"name": "tool2", "description": "Tool 2"}},
            "not a dict",  # Invalid - not a dict
        ]
        
        result = PromptManager._format_tools(openapi_schemas, format_type="minimal")
        parsed = json.loads(result)
        
        # Should only include valid schemas with names
        assert len(parsed) == 2
        assert parsed[0]["function"]["name"] == "tool1"
        assert parsed[1]["function"]["name"] == "tool2"
    
    @pytest.mark.asyncio
    async def test_track_tool_success_rate_empty_map(self):
        """Test tracking success rate with empty tool_results_map."""
        from core.agentpress.response_processor import ResponseProcessor
        
        # Mock dependencies
        tool_registry = Mock()
        add_message_callback = AsyncMock(return_value={"message_id": "test-id"})
        trace = Mock()
        
        processor = ResponseProcessor(tool_registry, add_message_callback, trace)
        
        # Empty tool results map
        tool_results_map = {}
        
        with patch('core.optimizations.quality_monitor.get_quality_monitor') as mock_get_monitor, \
             patch.object(OptimizationConfig, 'OPTIMIZATION_MODE', OptimizationMode.OPTIMIZED):
            
            # Mock quality monitor
            mock_monitor = AsyncMock()
            mock_get_monitor.return_value = mock_monitor
            
            # Track success rate (should return early)
            await processor._track_tool_success_rate(tool_results_map)
            
            # Should not track any metrics for empty map
            mock_monitor.track_metric.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_rollback_config_missing(self):
        """Test rollback behavior when config options are missing (should use defaults)."""
        from core.agentpress.response_processor import ResponseProcessor
        
        # Mock dependencies
        tool_registry = Mock()
        add_message_callback = AsyncMock(return_value={"message_id": "test-id"})
        trace = Mock()
        
        processor = ResponseProcessor(tool_registry, add_message_callback, trace)
        
        # Create tool results map with all failures (0% success rate)
        tool_results_map = {
            0: (
                {"function_name": "test_tool", "arguments": {}},
                ToolResult(success=False, output="Error"),
                Mock()
            )
        }
        
        with patch('core.optimizations.quality_monitor.get_quality_monitor') as mock_get_monitor, \
             patch.object(OptimizationConfig, 'OPTIMIZATION_MODE', OptimizationMode.OPTIMIZED), \
             patch.object(OptimizationConfig, 'auto_rollback_if_needed', new_callable=AsyncMock) as mock_rollback, \
             patch('core.utils.config.config') as mock_config_obj:
            
            # Mock rollback return value
            mock_rollback.return_value = True
            
            # Mock config with missing options (None values)
            mock_config_obj.TOOL_SCHEMA_SUCCESS_RATE_THRESHOLD = None
            mock_config_obj.TOOL_SCHEMA_AUTO_ROLLBACK_ENABLED = None
            
            # Mock quality monitor
            mock_monitor = AsyncMock()
            mock_get_monitor.return_value = mock_monitor
            
            # Track success rate (should use defaults: threshold=0.95, auto_rollback=True)
            await processor._track_tool_success_rate(tool_results_map)
            
            # Should trigger rollback (0% < 0.95 threshold, auto_rollback defaults to True)
            mock_rollback.assert_called_once_with(mock_monitor)
    
    @pytest.mark.asyncio
    async def test_rollback_config_disabled(self):
        """Test rollback behavior when auto-rollback is disabled."""
        from core.agentpress.response_processor import ResponseProcessor
        
        # Mock dependencies
        tool_registry = Mock()
        add_message_callback = AsyncMock(return_value={"message_id": "test-id"})
        trace = Mock()
        
        processor = ResponseProcessor(tool_registry, add_message_callback, trace)
        
        # Create tool results map with all failures (0% success rate)
        tool_results_map = {
            0: (
                {"function_name": "test_tool", "arguments": {}},
                ToolResult(success=False, output="Error"),
                Mock()
            )
        }
        
        with patch('core.optimizations.quality_monitor.get_quality_monitor') as mock_get_monitor, \
             patch.object(OptimizationConfig, 'OPTIMIZATION_MODE', OptimizationMode.OPTIMIZED), \
             patch.object(OptimizationConfig, 'auto_rollback_if_needed', new_callable=AsyncMock) as mock_rollback, \
             patch('core.utils.config.config') as mock_config_obj:
            
            # Mock config with auto-rollback disabled
            mock_config_obj.TOOL_SCHEMA_SUCCESS_RATE_THRESHOLD = 0.95
            mock_config_obj.TOOL_SCHEMA_AUTO_ROLLBACK_ENABLED = False
            
            # Mock quality monitor
            mock_monitor = AsyncMock()
            mock_get_monitor.return_value = mock_monitor
            
            # Track success rate
            await processor._track_tool_success_rate(tool_results_map)
            
            # Should NOT trigger rollback (auto-rollback disabled)
            mock_rollback.assert_not_called()
            
            # But should still track the metric
            mock_monitor.track_metric.assert_called_once()

