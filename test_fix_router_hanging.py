#!/usr/bin/env python3
"""
Test the fix for Router hanging issue with openai-compatible models
"""

import sys
import os
import asyncio
sys.path.append('backend')

# Set environment variables
os.environ['AUTO_MODEL_ENABLED'] = 'true'
os.environ['ENV_MODE'] = 'local'

async def test_openai_compatible_with_tools():
    """Test openai-compatible model with tools after fix"""
    print("🧪 Testing openai-compatible model with tools (after fix)...")
    
    try:
        from backend.core.services.llm import make_llm_api_call
        from backend.core.agentpress.context_manager import ContextManager
        from backend.core.agentpress.tool_registry import ToolRegistry
        from backend.core.run import ToolManager
        from backend.core.agentpress.thread_manager import ThreadManager
        
        # Setup like production
        thread_manager = ThreadManager()
        tool_manager = ToolManager(thread_manager, "test-project", "test-thread")
        tool_manager.register_all_tools()
        
        context_manager = ContextManager()
        
        # Test query
        user_message = "Hello, can you help me search for information?"
        
        # Get optimized system prompt
        large_prompt = "You are a helpful AI assistant." * 100
        optimized_prompt = context_manager.get_optimized_system_prompt(user_message, large_prompt)
        
        # Get filtered tools
        filtered_schemas = thread_manager.tool_registry.get_filtered_schemas(user_message)
        print(f"📊 Available tools: {len(filtered_schemas)}")
        
        messages = [
            {"role": "system", "content": optimized_prompt},
            {"role": "user", "content": user_message}
        ]
        
        print(f"🔍 Testing LLM call with {len(filtered_schemas[:10])} tools...")
        
        # Test with timeout to detect hanging
        import asyncio
        
        try:
            response = await asyncio.wait_for(
                make_llm_api_call(
                    messages=messages,
                    model_name="openai-compatible/gpt-4o-mini",
                    max_tokens=100,
                    stream=False,
                    tools=filtered_schemas[:10]  # Limit to 10 tools
                ),
                timeout=30.0  # 30 second timeout
            )
            
            print(f"✅ SUCCESS! LLM call with tools completed!")
            print(f"📝 Response: {response.choices[0].message.content}")
            
            # Check strategy used
            print(f"🔧 Strategy should be DirectLiteLLM for openai-compatible")
            
            return True
            
        except asyncio.TimeoutError:
            print(f"❌ TIMEOUT! LLM call still hanging after 30 seconds")
            return False
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_standard_model_with_router():
    """Test that standard models still use Router strategy"""
    print("\n🧪 Testing standard model with Router strategy...")
    
    try:
        from backend.core.ai_models.llm_strategies import LLMStrategyFactory
        from litellm import Router
        
        # Test strategy selection
        router = Router(model_list=[])
        
        # Test openai-compatible model
        strategy1 = LLMStrategyFactory.get_strategy("openai-compatible/gpt-4o-mini", router)
        print(f"📝 openai-compatible strategy: {strategy1.get_strategy_name()}")
        
        # Test standard model
        strategy2 = LLMStrategyFactory.get_strategy("claude-3-5-sonnet-20241022", router)
        print(f"📝 standard model strategy: {strategy2.get_strategy_name()}")
        
        # Verify correct strategies
        if strategy1.get_strategy_name() == "DirectLiteLLM":
            print(f"✅ openai-compatible uses DirectLiteLLM (correct)")
        else:
            print(f"❌ openai-compatible uses {strategy1.get_strategy_name()} (wrong)")
            return False
            
        if strategy2.get_strategy_name() == "Router":
            print(f"✅ standard model uses Router (correct)")
        else:
            print(f"❌ standard model uses {strategy2.get_strategy_name()} (wrong)")
            return False
            
        return True
        
    except Exception as e:
        print(f"❌ Strategy test failed: {e}")
        return False

async def test_without_tools():
    """Test openai-compatible without tools (should still work)"""
    print("\n🧪 Testing openai-compatible without tools...")
    
    try:
        from backend.core.services.llm import make_llm_api_call
        
        response = await make_llm_api_call(
            messages=[{"role": "user", "content": "Hello test"}],
            model_name="openai-compatible/gpt-4o-mini",
            max_tokens=50,
            stream=False
            # No tools
        )
        
        print(f"✅ openai-compatible without tools works!")
        print(f"📝 Response: {response.choices[0].message.content}")
        return True
        
    except Exception as e:
        print(f"❌ Test without tools failed: {e}")
        return False

async def main():
    """Main test function"""
    print("🔧 TESTING FIX FOR ROUTER HANGING ISSUE")
    print("=" * 60)
    
    # Run tests
    test1 = await test_standard_model_with_router()
    test2 = await test_without_tools()
    test3 = await test_openai_compatible_with_tools()
    
    # Results
    print(f"\n🏁 TEST RESULTS:")
    print(f"Strategy selection: {'✅ PASS' if test1 else '❌ FAIL'}")
    print(f"Without tools: {'✅ PASS' if test2 else '❌ FAIL'}")
    print(f"With tools (main fix): {'✅ PASS' if test3 else '❌ FAIL'}")
    
    overall_success = test1 and test2 and test3
    
    if overall_success:
        print(f"\n🎉 ALL TESTS PASSED!")
        print(f"   ✅ Router hanging issue fixed")
        print(f"   ✅ openai-compatible models work with tools")
        print(f"   ✅ Standard models still use Router")
        print(f"   ✅ Ready for production deployment")
    else:
        print(f"\n⚠️ SOME TESTS FAILED")
        print(f"   Fix needs more work")
    
    return overall_success

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
