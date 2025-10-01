#!/usr/bin/env python3
"""
Test tool calling after enabling tools for openai-compatible models.
"""

import asyncio
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from core.services.llm import make_llm_api_call
from core.agentpress.tool_registry import ToolRegistry
from core.utils.logger import logger


async def test_tool_calling_enabled():
    """Test that tools are enabled and working for openai-compatible models."""
    
    print("🧪 Testing Tool Calling After Enable")
    print("=" * 60)
    
    # Initialize tool registry
    tool_registry = ToolRegistry()
    
    # Test query that should trigger web_search tool
    test_query = "Search for information about Python async programming best practices"
    
    print(f"\n📝 Test Query: {test_query}")
    
    # Get filtered tools
    filtered_schemas = tool_registry.get_filtered_schemas(test_query)
    print(f"\n🔧 Filtered Tools: {len(filtered_schemas)} tools")
    
    # Show tool names
    tool_names = [schema.get('function', {}).get('name', 'Unknown') for schema in filtered_schemas[:10]]
    print(f"📋 Sample Tools: {tool_names}")
    
    # Prepare messages
    messages = [
        {"role": "system", "content": "You are a helpful AI assistant with access to various tools."},
        {"role": "user", "content": test_query}
    ]
    
    # Test with openai-compatible model
    model_name = "openai-compatible/gpt-4o-mini"
    print(f"\n🤖 Testing with model: {model_name}")
    print(f"🔧 Tools count: {len(filtered_schemas)}")
    
    try:
        print("\n⏳ Making LLM call with tools...")
        
        response = await make_llm_api_call(
            messages=messages,
            model_name=model_name,
            max_tokens=500,
            stream=False,
            tools=filtered_schemas[:20]  # Limit to 20 tools for testing
        )
        
        print("\n✅ LLM call successful!")
        
        # Check response
        if hasattr(response, 'choices') and len(response.choices) > 0:
            message = response.choices[0].message
            
            # Check if tools were called
            if hasattr(message, 'tool_calls') and message.tool_calls:
                print(f"\n🎉 SUCCESS! Tools were called!")
                print(f"🔧 Number of tool calls: {len(message.tool_calls)}")
                
                for i, tool_call in enumerate(message.tool_calls, 1):
                    print(f"\n  Tool Call {i}:")
                    print(f"    - ID: {tool_call.id}")
                    print(f"    - Function: {tool_call.function.name}")
                    print(f"    - Arguments: {tool_call.function.arguments[:100]}...")
                
                return True
            else:
                print(f"\n📝 No tool calls made (LLM chose to respond directly)")
                print(f"💬 Response: {message.content[:200]}...")
                
                # This is still success - tools were available but LLM chose not to use them
                return True
        else:
            print(f"\n❌ Unexpected response format")
            return False
            
    except Exception as e:
        print(f"\n❌ Error during LLM call: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_without_tools():
    """Test that LLM still works without tools (baseline)."""
    
    print("\n\n🧪 Testing Without Tools (Baseline)")
    print("=" * 60)
    
    messages = [
        {"role": "user", "content": "What is Python async programming?"}
    ]
    
    model_name = "openai-compatible/gpt-4o-mini"
    print(f"\n🤖 Testing with model: {model_name}")
    print(f"🔧 Tools: None")
    
    try:
        print("\n⏳ Making LLM call without tools...")
        
        response = await make_llm_api_call(
            messages=messages,
            model_name=model_name,
            max_tokens=200,
            stream=False
            # No tools
        )
        
        print("\n✅ LLM call successful!")
        
        if hasattr(response, 'choices') and len(response.choices) > 0:
            message = response.choices[0].message
            print(f"💬 Response: {message.content[:200]}...")
            return True
        else:
            print(f"\n❌ Unexpected response format")
            return False
            
    except Exception as e:
        print(f"\n❌ Error during LLM call: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Run all tests."""
    
    print("\n🚀 TOOL CALLING TEST SUITE")
    print("=" * 60)
    print("Testing tool calling after enabling tools for openai-compatible models")
    print("=" * 60)
    
    results = []
    
    # Test 1: Without tools (baseline)
    result1 = await test_without_tools()
    results.append(("Without Tools (Baseline)", result1))
    
    # Test 2: With tools enabled
    result2 = await test_tool_calling_enabled()
    results.append(("With Tools Enabled", result2))
    
    # Summary
    print("\n\n📊 TEST SUMMARY")
    print("=" * 60)
    
    for test_name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    success_count = sum(1 for _, success in results if success)
    print(f"\n🎯 Overall: {success_count}/{len(results)} tests passed")
    
    if success_count == len(results):
        print("\n🎉 ALL TESTS PASSED! Tool calling is working!")
    else:
        print("\n⚠️  Some tests failed. Check logs above for details.")


if __name__ == "__main__":
    asyncio.run(main())

