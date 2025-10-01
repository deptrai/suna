#!/usr/bin/env python3
"""
Debug why enabling tools causes v98store API to fail.
"""

import asyncio
import sys
import os
import json

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from core.services.llm import make_llm_api_call
from core.agentpress.tool_registry import ToolRegistry
from core.utils.logger import logger
import litellm


async def test_direct_v98store_with_tools():
    """Test v98store API directly with tools to see the exact error."""
    
    print("🧪 Testing v98store API with Tools")
    print("=" * 60)
    
    # Get API credentials from environment
    import os
    api_key = os.getenv('OPENAI_COMPATIBLE_API_KEY', 'sk-Righ5E8wjF9WMrNITGhjBZlgS17vzdvbxYK4S1IjaJu4soIi')
    api_base = os.getenv('OPENAI_COMPATIBLE_API_BASE', 'https://v98store.com/v1')
    
    print(f"API Base: {api_base}")
    print(f"API Key: {api_key[:20]}...")
    
    # Simple test messages
    messages = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Search for information about Python"}
    ]
    
    # Simple tool schema
    tools = [
        {
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "Search the web for information",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The search query"
                        }
                    },
                    "required": ["query"]
                }
            }
        }
    ]
    
    print(f"\n📝 Messages: {len(messages)}")
    print(f"🔧 Tools: {len(tools)}")
    
    # Test 1: Without tools (baseline)
    print("\n" + "=" * 60)
    print("TEST 1: Without Tools (Baseline)")
    print("=" * 60)
    
    try:
        response = await litellm.acompletion(
            model="gpt-4o",  # Actual model name for v98store
            messages=messages,
            api_key=api_key,
            api_base=api_base,
            custom_llm_provider="openai",
            max_tokens=100,
            temperature=0.7
        )
        
        print("✅ SUCCESS without tools!")
        print(f"Response: {response.choices[0].message.content[:100]}...")
        
    except Exception as e:
        print(f"❌ FAILED without tools: {e}")
        import traceback
        traceback.print_exc()
    
    # Test 2: With tools
    print("\n" + "=" * 60)
    print("TEST 2: With Tools")
    print("=" * 60)
    
    try:
        response = await litellm.acompletion(
            model="gpt-4o",
            messages=messages,
            api_key=api_key,
            api_base=api_base,
            custom_llm_provider="openai",
            max_tokens=100,
            temperature=0.7,
            tools=tools  # Add tools
        )
        
        print("✅ SUCCESS with tools!")

        # Check response structure
        message = response.choices[0].message
        print(f"Message role: {message.role}")
        print(f"Message content: {message.content[:100] if message.content else 'None'}...")
        print(f"Has tool_calls attr: {hasattr(message, 'tool_calls')}")

        if hasattr(message, 'tool_calls') and message.tool_calls:
            print(f"🔧 Tool calls: {len(message.tool_calls)}")
            for tc in message.tool_calls:
                print(f"  - {tc.function.name}: {tc.function.arguments[:50]}...")
        else:
            print(f"📝 No tool calls (LLM responded directly)")
        
    except Exception as e:
        print(f"❌ FAILED with tools!")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        
        # Try to extract more details
        if hasattr(e, 'response'):
            print(f"Response status: {e.response.status_code if hasattr(e.response, 'status_code') else 'N/A'}")
            print(f"Response text: {e.response.text if hasattr(e.response, 'text') else 'N/A'}")
        
        import traceback
        traceback.print_exc()
    
    # Test 3: With different tool format
    print("\n" + "=" * 60)
    print("TEST 3: With Minimal Tool Schema")
    print("=" * 60)
    
    minimal_tools = [
        {
            "type": "function",
            "function": {
                "name": "test_tool",
                "description": "A test tool",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            }
        }
    ]
    
    try:
        response = await litellm.acompletion(
            model="gpt-4o",
            messages=messages,
            api_key=api_key,
            api_base=api_base,
            custom_llm_provider="openai",
            max_tokens=100,
            temperature=0.7,
            tools=minimal_tools
        )
        
        print("✅ SUCCESS with minimal tools!")
        print(f"Response: {response.choices[0].message.content[:100]}...")
        
    except Exception as e:
        print(f"❌ FAILED with minimal tools!")
        print(f"Error: {str(e)}")


async def test_with_router():
    """Test using Router (like production code)."""

    print("\n\n🧪 Testing with Router (Production Code Path)")
    print("=" * 60)
    print("Skipping router test - focus on direct API test results above")
    return

    # from core.services.llm import router
    
    messages = [
        {"role": "user", "content": "Search for Python information"}
    ]
    
    tools = [
        {
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "Search the web",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"}
                    },
                    "required": ["query"]
                }
            }
        }
    ]
    
    # Test without tools
    print("\nTest 1: Router without tools")
    try:
        response = await router.acompletion(
            model="openai-compatible/gpt-4o",
            messages=messages,
            max_tokens=100
        )
        print("✅ Router without tools: SUCCESS")
    except Exception as e:
        print(f"❌ Router without tools: FAILED - {e}")
    
    # Test with tools
    print("\nTest 2: Router with tools")
    try:
        response = await router.acompletion(
            model="openai-compatible/gpt-4o",
            messages=messages,
            max_tokens=100,
            tools=tools
        )
        print("✅ Router with tools: SUCCESS")
    except Exception as e:
        print(f"❌ Router with tools: FAILED")
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()


async def main():
    """Run all debug tests."""
    
    print("\n🚀 TOOL CALLING DEBUG SUITE")
    print("=" * 60)
    print("Debugging why v98store API fails with tools enabled")
    print("=" * 60)
    
    # Test direct API calls
    await test_direct_v98store_with_tools()
    
    # Test with Router
    await test_with_router()
    
    print("\n\n📊 SUMMARY")
    print("=" * 60)
    print("Check the output above to see:")
    print("1. Does v98store API accept tools parameter?")
    print("2. What error does it return when tools are provided?")
    print("3. Does Router transform the request correctly?")


if __name__ == "__main__":
    asyncio.run(main())

