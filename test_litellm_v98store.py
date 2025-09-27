#!/usr/bin/env python3
"""
Test LiteLLM with v98store directly.
"""

import os
import sys
import asyncio
sys.path.append('backend')

# Set environment variables
os.environ['AUTO_MODEL_ENABLED'] = 'true'
os.environ['ENV_MODE'] = 'local'

import litellm
from backend.core.utils.config import config

async def test_litellm_v98store():
    """Test LiteLLM with v98store directly."""
    
    print("🧪 Testing LiteLLM with v98store...")
    
    # Test configuration
    api_key = config.OPENAI_COMPATIBLE_API_KEY
    api_base = config.OPENAI_COMPATIBLE_API_BASE
    
    print(f"📝 API Key: {api_key[:10]}..." if api_key else "❌ No API Key")
    print(f"📝 API Base: {api_base}")
    
    if not api_key or not api_base:
        print("❌ Missing v98store credentials")
        return
    
    # Test 1: Direct LiteLLM call with openai-compatible format
    print("\n🔍 Test 1: Direct LiteLLM call...")
    
    try:
        response = await litellm.acompletion(
            model="openai-compatible/gpt-4o-mini",
            messages=[
                {"role": "user", "content": "Hello! This is a test message."}
            ],
            api_key=api_key,
            api_base=api_base,
            custom_llm_provider="openai",
            max_tokens=100,
            temperature=0.7
        )
        
        print(f"✅ Success: {response.choices[0].message.content}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    
    # Test 2: Direct LiteLLM call with transformed model name
    print("\n🔍 Test 2: Direct LiteLLM call with transformed model name...")
    
    try:
        response = await litellm.acompletion(
            model="gpt-4o-mini",  # Without prefix
            messages=[
                {"role": "user", "content": "Hello! This is a test message."}
            ],
            api_key=api_key,
            api_base=api_base,
            custom_llm_provider="openai",
            max_tokens=100,
            temperature=0.7
        )
        
        print(f"✅ Success: {response.choices[0].message.content}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

    # Test 3: Using Router (like in our system)
    print("\n🔍 Test 3: Using Router...")
    
    try:
        from litellm.router import Router
        
        model_list = [
            {
                "model_name": "openai-compatible/*",
                "litellm_params": {
                    "model": "openai/*",
                    "api_key": api_key,
                    "api_base": api_base,
                    "custom_llm_provider": "openai",
                },
            }
        ]
        
        router = Router(model_list=model_list)
        
        response = await router.acompletion(
            model="openai-compatible/gpt-4o-mini",
            messages=[
                {"role": "user", "content": "Hello! This is a router test."}
            ],
            max_tokens=100,
            temperature=0.7
        )
        
        print(f"✅ Router Success: {response.choices[0].message.content}")
        
    except Exception as e:
        print(f"❌ Router Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("🚀 LiteLLM v98store Test")
    print("=" * 60)
    
    asyncio.run(test_litellm_v98store())
    
    print("\n✅ Test completed!")
