#!/usr/bin/env python3
"""
Final test to verify context optimization is working
"""

import asyncio
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from core.agentpress.context_manager import ContextManager
from core.agentpress.tool_registry import ToolRegistry
from core.agentpress.thread_manager import ThreadManager
from core.services.supabase import DBConnection

async def test_final_optimization():
    """Test that optimization is working with correct default values"""
    
    print("🧪 FINAL CONTEXT OPTIMIZATION TEST")
    print("=" * 50)
    
    # 1. Test ContextManager optimization
    print("1️⃣ Testing ContextManager optimization...")
    
    context_manager = ContextManager()
    
    # Create test messages
    test_messages = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello"},
        {"role": "assistant", "content": "Hi there!"},
        {"role": "user", "content": "What is 2+2?"},
        {"role": "assistant", "content": "2+2 equals 4."},
        {"role": "user", "content": "Thanks"},
        {"role": "assistant", "content": "You're welcome!"},
        {"role": "user", "content": "Can you help me with math?"},
        {"role": "assistant", "content": "Of course!"},
        {"role": "user", "content": "What is 5+5?"},  # This should be the latest
    ]
    
    # Test message limiting
    limited_messages = context_manager.limit_recent_messages(test_messages)
    print(f"   📊 Original messages: {len(test_messages)}")
    print(f"   📊 Limited messages: {len(limited_messages)}")
    print(f"   ✅ Reduction: {len(test_messages) - len(limited_messages)} messages")
    
    # Test system prompt optimization
    long_prompt = "You are a helpful AI assistant. " * 100  # Make it long
    query = "What is 2+2?"
    optimized_prompt = context_manager.get_optimized_system_prompt(query, long_prompt)
    
    print(f"   📊 Original prompt: {len(long_prompt)} chars")
    print(f"   📊 Optimized prompt: {len(optimized_prompt)} chars")
    print(f"   ✅ Reduction: {len(long_prompt) - len(optimized_prompt)} chars")
    
    # 2. Test ToolRegistry optimization
    print("\n2️⃣ Testing ToolRegistry optimization...")
    
    tool_registry = ToolRegistry()
    
    # Test tool filtering
    query = "help me with code"
    filtered_schemas = tool_registry.get_filtered_schemas(query)
    minimal_schemas = tool_registry.get_minimal_schemas(query)
    
    print(f"   📊 Filtered schemas: {len(filtered_schemas)}")
    print(f"   📊 Minimal schemas: {len(minimal_schemas)}")
    
    if minimal_schemas:
        original_desc = "This is a very long description that explains what this tool does in great detail with many words and explanations."
        compressed_desc = tool_registry.compress_description(original_desc)
        print(f"   📊 Original description: {len(original_desc)} chars")
        print(f"   📊 Compressed description: {len(compressed_desc)} chars")
        print(f"   ✅ Reduction: {len(original_desc) - len(compressed_desc)} chars")
    
    # 3. Test default values
    print("\n3️⃣ Testing default values...")
    
    # Import and check AgentConfig default
    from core.run import AgentConfig
    config = AgentConfig(
        thread_id="test",
        project_id="test", 
        stream=True
    )
    print(f"   📊 AgentConfig.enable_context_manager default: {config.enable_context_manager}")
    
    # Check run_agent function default
    import inspect
    from core.run import run_agent
    sig = inspect.signature(run_agent)
    enable_context_manager_default = sig.parameters['enable_context_manager'].default
    print(f"   📊 run_agent.enable_context_manager default: {enable_context_manager_default}")
    
    # 4. Summary
    print("\n" + "=" * 50)
    print("🎯 OPTIMIZATION TEST SUMMARY")
    print("=" * 50)
    
    if enable_context_manager_default:
        print("✅ Context manager is enabled by default")
    else:
        print("❌ Context manager is disabled by default")
    
    if len(limited_messages) < len(test_messages):
        print("✅ Message limiting is working")
    else:
        print("❌ Message limiting is not working")
    
    if len(optimized_prompt) < len(long_prompt):
        print("✅ System prompt optimization is working")
    else:
        print("❌ System prompt optimization is not working")
    
    if len(minimal_schemas) > 0:
        print("✅ Tool schema optimization is working")
    else:
        print("❌ Tool schema optimization is not working")
    
    print("\n🚀 Next step: Test with real API call to see optimization logs!")
    print("   Check server console for debug messages when making API calls.")

if __name__ == "__main__":
    asyncio.run(test_final_optimization())
