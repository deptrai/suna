#!/usr/bin/env python3
"""
Debug full flow from auto selection to LiteLLM call.
"""

import os
import sys
import asyncio
sys.path.append('backend')

# Set environment variables
os.environ['AUTO_MODEL_ENABLED'] = 'true'
os.environ['ENV_MODE'] = 'local'

from backend.core.ai_models.manager import model_manager
from backend.core.services.llm import make_llm_api_call, prepare_params
from backend.core.utils.config import config

async def debug_full_flow():
    """Debug the complete flow."""
    
    print("🔍 DEBUGGING FULL FLOW")
    print("=" * 80)
    
    # Step 1: Test auto selection
    print("\n📝 STEP 1: Auto Selection")
    query = "Test with Router strategy for v98store"
    
    try:
        selected_model = model_manager.resolve_model_id("auto", query)
        print(f"✅ Auto selected model: {selected_model}")
    except Exception as e:
        print(f"❌ Auto selection failed: {e}")
        return
    
    # Step 2: Test prepare_params
    print("\n📝 STEP 2: Prepare Params")
    
    try:
        messages = [{"role": "user", "content": query}]
        params = prepare_params(
            messages=messages,
            model_name=selected_model,
            temperature=0.7,
            max_tokens=100,
            stream=False
        )
        
        print(f"✅ Prepared params:")
        for key, value in params.items():
            if key == 'api_key':
                print(f"   {key}: {value[:10]}...{value[-4:] if value else 'None'}")
            elif key == 'messages':
                print(f"   {key}: [message with {len(value)} items]")
            else:
                print(f"   {key}: {value}")
                
    except Exception as e:
        print(f"❌ Prepare params failed: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # Step 3: Test strategy selection
    print("\n📝 STEP 3: Strategy Selection")
    
    try:
        from backend.core.ai_models.llm_strategies import LLMCallContext
        from backend.core.services.llm import provider_router
        
        call_context = LLMCallContext(selected_model, provider_router)
        strategy_info = call_context.get_strategy_info()
        print(f"✅ Strategy: {strategy_info}")
        
    except Exception as e:
        print(f"❌ Strategy selection failed: {e}")
        import traceback
        traceback.print_exc()
    
    # Step 4: Test router configuration
    print("\n📝 STEP 4: Router Configuration")
    
    try:
        from backend.core.services.llm import provider_router
        
        if provider_router:
            print(f"✅ Router exists: {type(provider_router)}")
            
            # Check router model list
            if hasattr(provider_router, 'model_list'):
                print(f"✅ Router model list:")
                for i, model_config in enumerate(provider_router.model_list):
                    print(f"   Model {i+1}: {model_config}")
            else:
                print("❌ Router has no model_list")
        else:
            print("❌ Router is None")
            
    except Exception as e:
        print(f"❌ Router check failed: {e}")
        import traceback
        traceback.print_exc()
    
    # Step 5: Test actual LLM call
    print("\n📝 STEP 5: Actual LLM Call")
    
    try:
        print(f"🚀 Making LLM call with model: {selected_model}")
        
        response = await make_llm_api_call(
            messages=messages,
            model_name=selected_model,
            temperature=0.7,
            max_tokens=100,
            stream=False
        )
        
        print(f"✅ LLM call successful!")
        if hasattr(response, 'choices') and response.choices:
            content = response.choices[0].message.content
            print(f"📝 Response: {content[:100]}...")
        else:
            print(f"📝 Response type: {type(response)}")
            
    except Exception as e:
        print(f"❌ LLM call failed: {e}")
        import traceback
        traceback.print_exc()
    
    # Step 6: Test direct router call
    print("\n📝 STEP 6: Direct Router Call")
    
    try:
        from backend.core.services.llm import provider_router
        
        if provider_router:
            print(f"🚀 Testing direct router call...")
            
            # Test with original model name
            test_params = {
                "model": selected_model,  # Use original model name
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 100
            }
            
            print(f"📝 Router test params: {test_params}")
            
            response = await provider_router.acompletion(**test_params)
            
            print(f"✅ Direct router call successful!")
            if hasattr(response, 'choices') and response.choices:
                content = response.choices[0].message.content
                print(f"📝 Response: {content[:100]}...")
                
        else:
            print("❌ Router is None, cannot test direct call")
            
    except Exception as e:
        print(f"❌ Direct router call failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("🚀 Full Flow Debug")
    print("=" * 60)
    
    asyncio.run(debug_full_flow())
    
    print("\n✅ Debug completed!")
