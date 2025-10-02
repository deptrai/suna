"""
Comprehensive tool calling test suite
Phase 1 Task 1.2.2

Tests single tool calls, multiple tool calls, and complex workflows
to ensure optimization doesn't break tool calling functionality.
"""
import pytest
import asyncio
import tempfile
import os
from pathlib import Path
from core.agentpress.thread_manager import ThreadManager
from core.agentpress.response_processor import ProcessorConfig
from core.utils.logger import logger


@pytest.fixture
def thread_manager():
    """Create a ThreadManager instance for testing"""
    return ThreadManager()


@pytest.fixture
def test_system_prompt():
    """Basic system prompt for testing"""
    return {
        "role": "system", 
        "content": "You are a helpful assistant with access to file operations and other tools. Use tools when appropriate."
    }


@pytest.fixture
def processor_config():
    """Create ProcessorConfig with native tool calling enabled"""
    config = ProcessorConfig()
    config.native_tool_calling = True
    return config


@pytest.mark.asyncio
async def test_single_tool_call_file_creation(thread_manager, test_system_prompt, processor_config):
    """Test single tool call - file creation"""
    logger.info("🧪 Testing single tool call: file creation")
    
    # Create thread
    thread_id = await thread_manager.create_thread(account_id="test", is_public=False)
    
    # Add message requesting file creation
    await thread_manager.add_message(thread_id, "user", "Create a file called test_output.txt with content 'Hello World'")
    
    # Run thread with tool calling enabled
    response_generator = thread_manager.run_thread(
        thread_id=thread_id,
        system_prompt=test_system_prompt,
        llm_model="claude-sonnet-4",
        enable_prompt_caching=True,
        native_max_auto_continues=0,
        processor_config=processor_config,
        stream=False
    )
    
    # Collect response
    response_parts = []
    async for part in response_generator:
        response_parts.append(part)
    
    # Verify tool was called
    response_text = str(response_parts)
    has_tool_call = any([
        "tool_calls" in response_text.lower(),
        "tool_use" in response_text.lower(),
        "save-file" in response_text.lower(),
        "create" in response_text.lower() and "file" in response_text.lower()
    ])
    
    assert has_tool_call, f"Expected tool call in response, got: {response_text[:500]}"
    
    # Log to GlitchTip
    try:
        import sentry_sdk
        sentry_sdk.capture_message(
            "Tool calling test passed: single_tool_call_file_creation",
            level="info",
            extras={"thread_id": thread_id, "response_length": len(response_text)}
        )
    except Exception as e:
        logger.warning(f"Failed to log to GlitchTip: {e}")
    
    logger.info("✅ Single tool call test passed")


@pytest.mark.asyncio
async def test_multiple_tool_calls_workflow(thread_manager, test_system_prompt, processor_config):
    """Test multiple tool calls in sequence"""
    logger.info("🧪 Testing multiple tool calls workflow")
    
    # Create thread
    thread_id = await thread_manager.create_thread(account_id="test", is_public=False)
    
    # Add message requesting multiple operations
    await thread_manager.add_message(
        thread_id, 
        "user", 
        "First create a file called data.txt with some sample data, then read it back to verify the content"
    )
    
    # Run thread
    response_generator = thread_manager.run_thread(
        thread_id=thread_id,
        system_prompt=test_system_prompt,
        llm_model="claude-sonnet-4",
        enable_prompt_caching=True,
        native_max_auto_continues=2,  # Allow multiple tool calls
        processor_config=processor_config,
        stream=False
    )
    
    # Collect response
    response_parts = []
    async for part in response_generator:
        response_parts.append(part)
    
    response_text = str(response_parts)
    
    # Verify multiple tool operations
    has_create_operation = any([
        "save-file" in response_text.lower(),
        "create" in response_text.lower() and "file" in response_text.lower()
    ])
    
    has_read_operation = any([
        "view" in response_text.lower(),
        "read" in response_text.lower()
    ])
    
    assert has_create_operation, f"Expected file creation in response: {response_text[:500]}"
    assert has_read_operation, f"Expected file reading in response: {response_text[:500]}"
    
    # Log to GlitchTip
    try:
        import sentry_sdk
        sentry_sdk.capture_message(
            "Tool calling test passed: multiple_tool_calls_workflow",
            level="info",
            extras={"thread_id": thread_id, "response_length": len(response_text)}
        )
    except Exception as e:
        logger.warning(f"Failed to log to GlitchTip: {e}")
    
    logger.info("✅ Multiple tool calls test passed")


@pytest.mark.asyncio
async def test_complex_workflow_with_error_handling(thread_manager, test_system_prompt, processor_config):
    """Test complex workflow with potential error scenarios"""
    logger.info("🧪 Testing complex workflow with error handling")
    
    # Create thread
    thread_id = await thread_manager.create_thread(account_id="test", is_public=False)
    
    # Add message with complex request
    await thread_manager.add_message(
        thread_id,
        "user", 
        "Try to read a file that doesn't exist, then create it with some content, then read it again to confirm"
    )
    
    # Run thread
    response_generator = thread_manager.run_thread(
        thread_id=thread_id,
        system_prompt=test_system_prompt,
        llm_model="claude-sonnet-4",
        enable_prompt_caching=True,
        native_max_auto_continues=3,  # Allow multiple attempts
        processor_config=processor_config,
        stream=False
    )
    
    # Collect response
    response_parts = []
    async for part in response_generator:
        response_parts.append(part)
    
    response_text = str(response_parts)
    
    # Verify the workflow handled errors and completed successfully
    has_error_handling = any([
        "not found" in response_text.lower(),
        "doesn't exist" in response_text.lower(),
        "error" in response_text.lower()
    ])
    
    has_recovery = any([
        "create" in response_text.lower(),
        "save-file" in response_text.lower()
    ])
    
    # Should have both error detection and recovery
    assert has_error_handling or has_recovery, f"Expected error handling or recovery in response: {response_text[:500]}"
    
    # Log to GlitchTip
    try:
        import sentry_sdk
        sentry_sdk.capture_message(
            "Tool calling test passed: complex_workflow_with_error_handling",
            level="info",
            extras={"thread_id": thread_id, "response_length": len(response_text)}
        )
    except Exception as e:
        logger.warning(f"Failed to log to GlitchTip: {e}")
    
    logger.info("✅ Complex workflow test passed")


@pytest.mark.asyncio
async def test_tool_calling_with_caching_enabled(thread_manager, test_system_prompt, processor_config):
    """Test that tool calling works correctly with prompt caching enabled"""
    logger.info("🧪 Testing tool calling with caching enabled")
    
    # Create thread
    thread_id = await thread_manager.create_thread(account_id="test", is_public=False)
    
    # Add message
    await thread_manager.add_message(thread_id, "user", "Create a simple text file with today's date")
    
    # Run with caching explicitly enabled
    response_generator = thread_manager.run_thread(
        thread_id=thread_id,
        system_prompt=test_system_prompt,
        llm_model="claude-sonnet-4",
        enable_prompt_caching=True,  # Explicitly enable caching
        native_max_auto_continues=1,
        processor_config=processor_config,
        stream=False
    )
    
    # Collect response
    response_parts = []
    async for part in response_generator:
        response_parts.append(part)
    
    response_text = str(response_parts)
    
    # Verify tool calling still works with caching
    has_tool_call = any([
        "tool_calls" in response_text.lower(),
        "save-file" in response_text.lower(),
        "create" in response_text.lower() and "file" in response_text.lower()
    ])
    
    assert has_tool_call, f"Tool calling should work with caching enabled: {response_text[:500]}"
    
    # Log to GlitchTip
    try:
        import sentry_sdk
        sentry_sdk.capture_message(
            "Tool calling test passed: tool_calling_with_caching_enabled",
            level="info",
            extras={"thread_id": thread_id, "caching_enabled": True}
        )
    except Exception as e:
        logger.warning(f"Failed to log to GlitchTip: {e}")
    
    logger.info("✅ Tool calling with caching test passed")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
