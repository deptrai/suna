#!/usr/bin/env python3
"""
Debug script to investigate LLM calling issue after commit b09d6d11
"""

import sys
import os
import asyncio
import json
sys.path.append('backend')

# Set environment variables
os.environ['AUTO_MODEL_ENABLED'] = 'true'
os.environ['ENV_MODE'] = 'local'

async def test_v98store_direct():
    """Test v98store API directly"""
    print("🧪 Testing v98store API directly...")
    
    try:
        import requests
        
        api_key = "sk-Righ5E8wjF9WMrNITGhjBZlgS17vzdvbxYK4S1IjaJu4soIi"
        api_base = "https://v98store.com/v1"
        
        response = requests.post(
            f"{api_base}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": "Hello test"}],
                "max_tokens": 50
            },
            timeout=30
        )
        
        print(f"📊 Status: {response.status_code}")
        if response.status_code == 200:
            print(f"✅ v98store API working!")
            print(f"📝 Response: {response.json()}")
        else:
            print(f"❌ v98store API error: {response.text}")
            
    except Exception as e:
        print(f"❌ v98store test failed: {e}")

async def test_litellm_direct():
    """Test LiteLLM direct call"""
    print("\n🧪 Testing LiteLLM direct call...")
    
    try:
        import litellm
        
        response = await litellm.acompletion(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": "Hello test"}],
            api_key="sk-Righ5E8wjF9WMrNITGhjBZlgS17vzdvbxYK4S1IjaJu4soIi",
            api_base="https://v98store.com/v1",
            max_tokens=50
        )
        
        print(f"✅ LiteLLM direct call working!")
        print(f"📝 Response: {response}")
        
    except Exception as e:
        print(f"❌ LiteLLM direct call failed: {e}")
        import traceback
        traceback.print_exc()

async def test_router_setup():
    """Test Router setup"""
    print("\n🧪 Testing Router setup...")
    
    try:
        from backend.core.services.llm import setup_provider_router, provider_router
        from litellm import Router
        
        # Test router setup
        setup_provider_router()
        
        if provider_router:
            print(f"✅ Router setup successful!")
            print(f"📊 Router model list: {len(provider_router.model_list)} models")
            
            # Test router call
            response = await provider_router.acompletion(
                model="openai-compatible/gpt-4o-mini",
                messages=[{"role": "user", "content": "Hello test"}],
                max_tokens=50
            )
            
            print(f"✅ Router call working!")
            print(f"📝 Response: {response}")
            
        else:
            print(f"❌ Router not initialized")
            
    except Exception as e:
        print(f"❌ Router test failed: {e}")
        import traceback
        traceback.print_exc()

async def test_chainlens_llm_service():
    """Test ChainLens LLM service"""
    print("\n🧪 Testing ChainLens LLM service...")
    
    try:
        from backend.core.services.llm import make_llm_api_call
        
        response = await make_llm_api_call(
            messages=[{"role": "user", "content": "Hello test"}],
            model_name="openai-compatible/gpt-4o-mini",
            max_tokens=50,
            stream=False
        )
        
        print(f"✅ ChainLens LLM service working!")
        print(f"📝 Response: {response}")
        
    except Exception as e:
        print(f"❌ ChainLens LLM service failed: {e}")
        import traceback
        traceback.print_exc()

async def test_model_resolution():
    """Test model resolution"""
    print("\n🧪 Testing model resolution...")
    
    try:
        from backend.core.ai_models import model_manager
        
        test_models = [
            "openai-compatible/gpt-4o-mini",
            "gpt-4o-mini",
            "GPT-4o Mini (v98store)"
        ]
        
        for model in test_models:
            resolved = model_manager.resolve_model_id(model)
            print(f"📝 {model} -> {resolved}")
            
    except Exception as e:
        print(f"❌ Model resolution failed: {e}")
        import traceback
        traceback.print_exc()

async def main():
    """Main debug function"""
    print("🔍 DEBUGGING LLM ISSUE AFTER COMMIT b09d6d11")
    print("=" * 60)
    
    await test_v98store_direct()
    await test_litellm_direct()
    await test_router_setup()
    await test_model_resolution()
    await test_chainlens_llm_service()
    
    print("\n🏁 DEBUG COMPLETE")

if __name__ == "__main__":
    asyncio.run(main())
