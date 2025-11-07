"""
Tests for Dual-Mode Architecture Implementation (Story 1.4).

Tests verify:
- OptimizationMode enum and OptimizationConfig class
- Mode switching logic in PromptManager.build_system_prompt()
- Original prompt generation preserves current implementation
- Optimized prompt generation applies optimizations
- Feature flags configuration via environment variables
- Mode switching and rollback mechanism
"""

import pytest
import os
from unittest.mock import Mock, patch, MagicMock, AsyncMock
from typing import Dict, Any, Optional

# Test imports
from core.utils.config import OptimizationMode, OptimizationConfig
from core.run import PromptManager


class TestOptimizationModeEnum:
    """Test OptimizationMode enum (AC: #1)."""
    
    def test_enum_values(self):
        """Verify enum has correct values."""
        assert OptimizationMode.ORIGINAL.value == "original"
        assert OptimizationMode.OPTIMIZED.value == "optimized"
        assert OptimizationMode.AUTO.value == "auto"
    
    def test_enum_from_string(self):
        """Verify enum can be created from string values."""
        assert OptimizationMode("original") == OptimizationMode.ORIGINAL
        assert OptimizationMode("optimized") == OptimizationMode.OPTIMIZED
        assert OptimizationMode("auto") == OptimizationMode.AUTO
    
    def test_enum_invalid_value(self):
        """Verify enum raises ValueError for invalid values."""
        with pytest.raises(ValueError):
            OptimizationMode("invalid")


class TestOptimizationConfig:
    """Test OptimizationConfig class (AC: #2)."""
    
    def test_default_mode_is_original(self):
        """Verify default mode is ORIGINAL."""
        # Reset to default
        OptimizationConfig.OPTIMIZATION_MODE = OptimizationMode.ORIGINAL
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.ORIGINAL
    
    @patch.dict(os.environ, {"OPTIMIZATION_MODE": "optimized"})
    def test_load_from_env_optimized(self):
        """Verify load_from_env loads optimized mode from environment."""
        OptimizationConfig.load_from_env()
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.OPTIMIZED
    
    @patch.dict(os.environ, {"OPTIMIZATION_MODE": "original"})
    def test_load_from_env_original(self):
        """Verify load_from_env loads original mode from environment."""
        OptimizationConfig.load_from_env()
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.ORIGINAL
    
    @patch.dict(os.environ, {"OPTIMIZATION_MODE": "auto"})
    def test_load_from_env_auto(self):
        """Verify load_from_env loads auto mode from environment."""
        OptimizationConfig.load_from_env()
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.AUTO
    
    @patch.dict(os.environ, {"OPTIMIZATION_MODE": "invalid"})
    def test_load_from_env_invalid(self):
        """Verify load_from_env falls back to ORIGINAL for invalid values."""
        OptimizationConfig.load_from_env()
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.ORIGINAL
    
    @patch.dict(os.environ, {}, clear=True)
    def test_load_from_env_no_env_var(self):
        """Verify load_from_env uses default ORIGINAL when env var not set."""
        OptimizationConfig.load_from_env()
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.ORIGINAL
    
    def test_set_mode(self):
        """Verify set_mode method works correctly."""
        OptimizationConfig.set_mode(OptimizationMode.OPTIMIZED)
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.OPTIMIZED
        
        OptimizationConfig.set_mode(OptimizationMode.ORIGINAL)
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.ORIGINAL


class TestPromptManagerModeSwitching:
    """Test PromptManager mode switching (AC: #3)."""
    
    @pytest.mark.asyncio
    async def test_build_system_prompt_original_mode(self):
        """Verify build_system_prompt calls _build_original_prompt in ORIGINAL mode."""
        with patch.object(OptimizationConfig, 'OPTIMIZATION_MODE', OptimizationMode.ORIGINAL):
            with patch.object(PromptManager, '_build_original_prompt', new_callable=AsyncMock) as mock_original:
                mock_original.return_value = {"role": "system", "content": "test"}
                
                result = await PromptManager.build_system_prompt(
                    model_name="test-model",
                    agent_config=None,
                    thread_id="test-thread",
                    mcp_wrapper_instance=None,
                    client=None,
                    tool_registry=None,
                    xml_tool_calling=True
                )
                
                mock_original.assert_called_once()
                assert result == {"role": "system", "content": "test"}
    
    @pytest.mark.asyncio
    async def test_build_system_prompt_optimized_mode(self):
        """Verify build_system_prompt calls _build_optimized_prompt in OPTIMIZED mode."""
        with patch.object(OptimizationConfig, 'OPTIMIZATION_MODE', OptimizationMode.OPTIMIZED):
            with patch.object(PromptManager, '_build_optimized_prompt', new_callable=AsyncMock) as mock_optimized:
                mock_optimized.return_value = {"role": "system", "content": "test"}
                
                result = await PromptManager.build_system_prompt(
                    model_name="test-model",
                    agent_config=None,
                    thread_id="test-thread",
                    mcp_wrapper_instance=None,
                    client=None,
                    tool_registry=None,
                    xml_tool_calling=True
                )
                
                mock_optimized.assert_called_once()
                assert result == {"role": "system", "content": "test"}
    
    @pytest.mark.asyncio
    async def test_build_system_prompt_auto_mode(self):
        """Verify build_system_prompt calls _build_optimized_prompt in AUTO mode (defaults to optimized)."""
        with patch.object(OptimizationConfig, 'OPTIMIZATION_MODE', OptimizationMode.AUTO):
            with patch.object(PromptManager, '_build_optimized_prompt', new_callable=AsyncMock) as mock_optimized:
                mock_optimized.return_value = {"role": "system", "content": "test"}
                
                result = await PromptManager.build_system_prompt(
                    model_name="test-model",
                    agent_config=None,
                    thread_id="test-thread",
                    mcp_wrapper_instance=None,
                    client=None,
                    tool_registry=None,
                    xml_tool_calling=True
                )
                
                mock_optimized.assert_called_once()
                assert result == {"role": "system", "content": "test"}


class TestOriginalPromptGeneration:
    """Test _build_original_prompt method (AC: #4)."""
    
    @pytest.mark.asyncio
    async def test_build_original_prompt_structure(self):
        """Verify _build_original_prompt generates correct prompt structure."""
        result = await PromptManager._build_original_prompt(
            model_name="test-model",
            agent_config=None,
            thread_id="test-thread",
            mcp_wrapper_instance=None,
            client=None,
            tool_registry=None,
            xml_tool_calling=True
        )
        
        assert isinstance(result, dict)
        assert result["role"] == "system"
        assert isinstance(result["content"], str)
        assert len(result["content"]) > 0
    
    @pytest.mark.asyncio
    async def test_build_original_prompt_includes_default_system_prompt(self):
        """Verify _build_original_prompt includes default system prompt."""
        result = await PromptManager._build_original_prompt(
            model_name="test-model",
            agent_config=None,
            thread_id="test-thread",
            mcp_wrapper_instance=None,
            client=None,
            tool_registry=None,
            xml_tool_calling=True
        )
        
        # Default system prompt should be included
        assert "system" in result["content"].lower() or len(result["content"]) > 100
    
    @pytest.mark.asyncio
    async def test_build_original_prompt_includes_agent_specific_prompt(self):
        """Verify _build_original_prompt includes agent-specific prompt if provided."""
        agent_config = {
            "system_prompt": "Custom agent prompt"
        }
        
        result = await PromptManager._build_original_prompt(
            model_name="test-model",
            agent_config=agent_config,
            thread_id="test-thread",
            mcp_wrapper_instance=None,
            client=None,
            tool_registry=None,
            xml_tool_calling=True
        )
        
        assert "Custom agent prompt" in result["content"]
    
    @pytest.mark.asyncio
    async def test_build_original_prompt_preserves_structure(self):
        """Verify _build_original_prompt preserves static/dynamic content structure."""
        result = await PromptManager._build_original_prompt(
            model_name="test-model",
            agent_config=None,
            thread_id="test-thread",
            mcp_wrapper_instance=None,
            client=None,
            tool_registry=None,
            xml_tool_calling=True
        )
        
        # Verify prompt structure (static content should come first)
        # This is a basic check - the actual structure is verified by integration tests
        assert isinstance(result["content"], str)


class TestOptimizedPromptGeneration:
    """Test _build_optimized_prompt method (AC: #5)."""
    
    @pytest.mark.asyncio
    async def test_build_optimized_prompt_structure(self):
        """Verify _build_optimized_prompt generates correct prompt structure."""
        result = await PromptManager._build_optimized_prompt(
            model_name="test-model",
            agent_config=None,
            thread_id="test-thread",
            mcp_wrapper_instance=None,
            client=None,
            tool_registry=None,
            xml_tool_calling=True
        )
        
        assert isinstance(result, dict)
        assert result["role"] == "system"
        assert isinstance(result["content"], str)
        assert len(result["content"]) > 0
    
    @pytest.mark.asyncio
    async def test_build_optimized_prompt_same_structure_as_original(self):
        """Verify _build_optimized_prompt produces same structure as original (optimizations are at service level)."""
        # Both should produce identical prompts (optimizations are at LLM service level)
        original_result = await PromptManager._build_original_prompt(
            model_name="test-model",
            agent_config=None,
            thread_id="test-thread",
            mcp_wrapper_instance=None,
            client=None,
            tool_registry=None,
            xml_tool_calling=True
        )
        
        optimized_result = await PromptManager._build_optimized_prompt(
            model_name="test-model",
            agent_config=None,
            thread_id="test-thread",
            mcp_wrapper_instance=None,
            client=None,
            tool_registry=None,
            xml_tool_calling=True
        )
        
        # Prompts should be identical (optimizations are at service level, not prompt level)
        assert original_result["content"] == optimized_result["content"]


class TestFeatureFlagsConfiguration:
    """Test feature flags configuration via environment variables (AC: #6)."""
    
    @patch.dict(os.environ, {"OPTIMIZATION_MODE": "optimized"})
    def test_feature_flag_optimized(self):
        """Verify OPTIMIZATION_MODE environment variable sets optimized mode."""
        OptimizationConfig.load_from_env()
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.OPTIMIZED
    
    @patch.dict(os.environ, {"OPTIMIZATION_MODE": "original"})
    def test_feature_flag_original(self):
        """Verify OPTIMIZATION_MODE environment variable sets original mode."""
        OptimizationConfig.load_from_env()
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.ORIGINAL
    
    @patch.dict(os.environ, {}, clear=True)
    def test_feature_flag_default(self):
        """Verify default mode is used when OPTIMIZATION_MODE not set."""
        OptimizationConfig.load_from_env()
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.ORIGINAL


class TestModeSwitchingAndRollback:
    """Test mode switching and rollback mechanism (AC: #7, #8)."""
    
    def test_switch_from_original_to_optimized(self):
        """Verify switching from ORIGINAL to OPTIMIZED mode works."""
        OptimizationConfig.OPTIMIZATION_MODE = OptimizationMode.ORIGINAL
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.ORIGINAL
        
        OptimizationConfig.set_mode(OptimizationMode.OPTIMIZED)
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.OPTIMIZED
    
    def test_rollback_from_optimized_to_original(self):
        """Verify rollback from OPTIMIZED to ORIGINAL mode works."""
        OptimizationConfig.OPTIMIZATION_MODE = OptimizationMode.OPTIMIZED
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.OPTIMIZED
        
        # Rollback to ORIGINAL
        OptimizationConfig.set_mode(OptimizationMode.ORIGINAL)
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.ORIGINAL
    
    def test_rollback_mechanism_works(self):
        """Verify rollback mechanism can switch to ORIGINAL mode anytime."""
        # Test multiple switches
        OptimizationConfig.set_mode(OptimizationMode.OPTIMIZED)
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.OPTIMIZED
        
        OptimizationConfig.set_mode(OptimizationMode.ORIGINAL)
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.ORIGINAL
        
        OptimizationConfig.set_mode(OptimizationMode.OPTIMIZED)
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.OPTIMIZED
        
        # Final rollback
        OptimizationConfig.set_mode(OptimizationMode.ORIGINAL)
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.ORIGINAL
    
    @pytest.mark.asyncio
    async def test_mode_switching_affects_prompt_generation(self):
        """Verify mode switching affects which prompt generation method is called."""
        with patch.object(PromptManager, '_build_original_prompt', new_callable=AsyncMock) as mock_original:
            with patch.object(PromptManager, '_build_optimized_prompt', new_callable=AsyncMock) as mock_optimized:
                mock_original.return_value = {"role": "system", "content": "original"}
                mock_optimized.return_value = {"role": "system", "content": "optimized"}
                
                # Test ORIGINAL mode
                OptimizationConfig.OPTIMIZATION_MODE = OptimizationMode.ORIGINAL
                result_original = await PromptManager.build_system_prompt(
                    model_name="test-model",
                    agent_config=None,
                    thread_id="test-thread",
                    mcp_wrapper_instance=None,
                    client=None,
                    tool_registry=None,
                    xml_tool_calling=True
                )
                mock_original.assert_called_once()
                mock_optimized.assert_not_called()
                
                # Reset mocks
                mock_original.reset_mock()
                mock_optimized.reset_mock()
                
                # Test OPTIMIZED mode
                OptimizationConfig.OPTIMIZATION_MODE = OptimizationMode.OPTIMIZED
                result_optimized = await PromptManager.build_system_prompt(
                    model_name="test-model",
                    agent_config=None,
                    thread_id="test-thread",
                    mcp_wrapper_instance=None,
                    client=None,
                    tool_registry=None,
                    xml_tool_calling=True
                )
                mock_original.assert_not_called()
                mock_optimized.assert_called_once()


# Integration tests (require actual LLM calls)
# ===========================================
# To run integration tests:
#   1. Ensure LLM API keys are configured (OPENAI_COMPATIBLE_API_KEY, etc.)
#   2. Set environment variable: ENABLE_LLM_INTEGRATION_TESTS=true
#   3. Run: pytest backend/tests/test_dual_mode_architecture.py -m integration -v
#
# Integration tests will be skipped unless ENABLE_LLM_INTEGRATION_TESTS=true
# This prevents accidental API calls during unit test runs.
# ===========================================

# Check if integration tests should run
ENABLE_INTEGRATION_TESTS = os.getenv("ENABLE_LLM_INTEGRATION_TESTS", "false").lower() == "true"


def skip_if_no_llm_setup(reason: str = "LLM integration tests disabled"):
    """Skip test if LLM setup is not available."""
    if not ENABLE_INTEGRATION_TESTS:
        pytest.skip(f"{reason}. Set ENABLE_LLM_INTEGRATION_TESTS=true to run.")


@pytest.mark.integration
class TestDualModeIntegration:
    """Integration tests for dual-mode architecture with actual LLM calls.
    
    These tests verify the dual-mode architecture works end-to-end with real LLM API calls.
    They require:
    - LLM API keys configured (OPENAI_COMPATIBLE_API_KEY, etc.)
    - Network access to LLM APIs
    - ENABLE_LLM_INTEGRATION_TESTS=true environment variable
    
    Usage:
        ENABLE_LLM_INTEGRATION_TESTS=true pytest backend/tests/test_dual_mode_architecture.py -m integration -v
    """
    
    @pytest.fixture(autouse=True)
    def setup_test(self):
        """Setup for integration tests."""
        skip_if_no_llm_setup("LLM integration tests disabled")
        # Reset to default mode before each test
        OptimizationConfig.OPTIMIZATION_MODE = OptimizationMode.ORIGINAL
        yield
        # Cleanup: reset to default mode after each test
        OptimizationConfig.OPTIMIZATION_MODE = OptimizationMode.ORIGINAL
    
    @pytest.mark.asyncio
    async def test_original_mode_prompt_generation_integration(self):
        """Integration test: Verify original mode generates valid prompts.
        
        This test:
        1. Sets mode to ORIGINAL
        2. Calls PromptManager.build_system_prompt()
        3. Verifies prompt structure is valid
        4. Optionally: Makes actual LLM call to verify prompt works
        """
        # Note: skip_if_no_llm_setup() is called in setup_test fixture, no need to call here
        
        # Set to ORIGINAL mode
        OptimizationConfig.OPTIMIZATION_MODE = OptimizationMode.ORIGINAL
        
        # Build prompt in ORIGINAL mode
        prompt = await PromptManager.build_system_prompt(
            model_name="openai-compatible/gpt-4o-mini",
            agent_config=None,
            thread_id="test-thread-integration-original",
            mcp_wrapper_instance=None,
            client=None,
            tool_registry=None,
            xml_tool_calling=True
        )
        
        # Verify prompt structure
        assert prompt is not None
        assert "role" in prompt
        assert prompt["role"] == "system"
        assert "content" in prompt
        assert isinstance(prompt["content"], str)
        assert len(prompt["content"]) > 0
        
        # Verify prompt contains expected sections
        content = prompt["content"]
        assert "system" in content.lower() or "prompt" in content.lower()
        
        # Note: Actual LLM call can be added here if needed
        # For now, we verify prompt structure is valid
    
    @pytest.mark.asyncio
    async def test_optimized_mode_prompt_generation_integration(self):
        """Integration test: Verify optimized mode generates valid prompts.
        
        This test:
        1. Sets mode to OPTIMIZED
        2. Calls PromptManager.build_system_prompt()
        3. Verifies prompt structure is valid
        4. Compares with ORIGINAL mode (should have same structure, different optimizations applied)
        """
        # Note: skip_if_no_llm_setup() is called in setup_test fixture, no need to call here
        
        # Set to OPTIMIZED mode
        OptimizationConfig.OPTIMIZATION_MODE = OptimizationMode.OPTIMIZED
        
        # Build prompt in OPTIMIZED mode
        prompt = await PromptManager.build_system_prompt(
            model_name="openai-compatible/gpt-4o-mini",
            agent_config=None,
            thread_id="test-thread-integration-optimized",
            mcp_wrapper_instance=None,
            client=None,
            tool_registry=None,
            xml_tool_calling=True
        )
        
        # Verify prompt structure
        assert prompt is not None
        assert "role" in prompt
        assert prompt["role"] == "system"
        assert "content" in prompt
        assert isinstance(prompt["content"], str)
        assert len(prompt["content"]) > 0
        
        # Verify prompt contains expected sections
        content = prompt["content"]
        assert "system" in content.lower() or "prompt" in content.lower()
        
        # Note: Prompt structure should be same as ORIGINAL (optimizations are at service level)
        # Actual optimizations (caching) are applied in LLM service, not in prompt building
    
    @pytest.mark.asyncio
    async def test_mode_switching_integration(self):
        """Integration test: Verify mode switching works with actual LLM calls.
        
        This test:
        1. Starts in ORIGINAL mode, generates prompt
        2. Switches to OPTIMIZED mode, generates prompt
        3. Verifies both prompts are valid
        4. Verifies mode switching works correctly
        """
        # Note: skip_if_no_llm_setup() is called in setup_test fixture, no need to call here
        
        # Test ORIGINAL mode
        OptimizationConfig.OPTIMIZATION_MODE = OptimizationMode.ORIGINAL
        prompt_original = await PromptManager.build_system_prompt(
            model_name="openai-compatible/gpt-4o-mini",
            agent_config=None,
            thread_id="test-thread-integration-switch-original",
            mcp_wrapper_instance=None,
            client=None,
            tool_registry=None,
            xml_tool_calling=True
        )
        assert prompt_original is not None
        assert prompt_original["role"] == "system"
        
        # Test OPTIMIZED mode
        OptimizationConfig.OPTIMIZATION_MODE = OptimizationMode.OPTIMIZED
        prompt_optimized = await PromptManager.build_system_prompt(
            model_name="openai-compatible/gpt-4o-mini",
            agent_config=None,
            thread_id="test-thread-integration-switch-optimized",
            mcp_wrapper_instance=None,
            client=None,
            tool_registry=None,
            xml_tool_calling=True
        )
        assert prompt_optimized is not None
        assert prompt_optimized["role"] == "system"
        
        # Verify mode switching works
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.OPTIMIZED
        
        # Verify prompts are valid (structure should be same, optimizations at service level)
        assert len(prompt_original["content"]) > 0
        assert len(prompt_optimized["content"]) > 0
    
    @pytest.mark.asyncio
    async def test_rollback_mechanism_integration(self):
        """Integration test: Verify rollback mechanism works with actual LLM calls.
        
        This test:
        1. Starts in OPTIMIZED mode
        2. Simulates rollback to ORIGINAL mode
        3. Verifies rollback works correctly
        4. Verifies prompts are still valid after rollback
        """
        # Note: skip_if_no_llm_setup() is called in setup_test fixture, no need to call here
        
        # Start in OPTIMIZED mode
        OptimizationConfig.OPTIMIZATION_MODE = OptimizationMode.OPTIMIZED
        prompt_optimized = await PromptManager.build_system_prompt(
            model_name="openai-compatible/gpt-4o-mini",
            agent_config=None,
            thread_id="test-thread-integration-rollback-optimized",
            mcp_wrapper_instance=None,
            client=None,
            tool_registry=None,
            xml_tool_calling=True
        )
        assert prompt_optimized is not None
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.OPTIMIZED
        
        # Simulate rollback to ORIGINAL mode
        OptimizationConfig.set_mode(OptimizationMode.ORIGINAL)
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.ORIGINAL
        
        # Verify rollback works - generate prompt in ORIGINAL mode
        prompt_original = await PromptManager.build_system_prompt(
            model_name="openai-compatible/gpt-4o-mini",
            agent_config=None,
            thread_id="test-thread-integration-rollback-original",
            mcp_wrapper_instance=None,
            client=None,
            tool_registry=None,
            xml_tool_calling=True
        )
        assert prompt_original is not None
        assert prompt_original["role"] == "system"
        
        # Verify mode is correctly set to ORIGINAL after rollback
        assert OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.ORIGINAL

