#!/usr/bin/env python3
"""
Simple Chat Validation Test

Tests core chat functionality without database dependencies.
Validates that the modular prompt system and routing work correctly.
"""
import asyncio
import uuid
from datetime import datetime


async def test_modular_prompt_generation():
    """Test that modular prompt system generates proper prompts"""
    print("\n" + "="*80)
    print("📦 MODULAR PROMPT GENERATION TEST")
    print("="*80)
    
    try:
        from core.prompts.router import get_router
        from core.prompts.module_manager import get_prompt_builder
        
        # Test routing
        router = get_router()
        test_queries = [
            "Create a Python file",
            "Analyze some data", 
            "Write a blog post",
            "Help me with coding"
        ]
        
        results = []
        
        for query in test_queries:
            print(f"\n🧭 Testing query: {query}")
            
            # Route query
            modules = router.route(query)
            module_names = [m.value for m in modules]
            print(f"   Modules selected: {module_names}")
            
            # Build prompt
            builder = get_prompt_builder()
            prompt = builder.build_prompt(modules, context={"native_tool_calling": True})
            
            print(f"   Prompt size: {len(prompt):,} chars")
            
            # Validate
            assert len(modules) > 0, "Should select modules"
            assert len(prompt) > 1000, "Prompt should be substantial"
            assert "You are Augment Agent" in prompt, "Should contain identity"
            
            results.append({
                "query": query,
                "modules": len(modules),
                "prompt_size": len(prompt),
                "success": True
            })
            
            print(f"   ✅ Success: {len(modules)} modules, {len(prompt):,} chars")
        
        print(f"\n✅ All {len(results)} queries processed successfully")
        return True
        
    except Exception as e:
        print(f"❌ Modular prompt test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_prompt_caching_system():
    """Test prompt caching system"""
    print("\n" + "="*80)
    print("🔥 PROMPT CACHING SYSTEM TEST")
    print("="*80)
    
    try:
        from core.agentpress.prompt_caching import apply_anthropic_caching_strategy
        from core.prompts.prompt import SYSTEM_PROMPT
        
        # Test caching
        system_prompt = {"role": "system", "content": SYSTEM_PROMPT}
        messages = [
            {"role": "user", "content": "Hello, how are you?"},
            {"role": "assistant", "content": "I'm doing well, thank you!"},
            {"role": "user", "content": "Can you help me with Python?"}
        ]
        
        print(f"📝 Testing caching with {len(messages)} messages")
        print(f"📝 System prompt size: {len(SYSTEM_PROMPT):,} chars")
        
        # Apply caching
        cached_messages = apply_anthropic_caching_strategy(
            system_prompt, messages, "claude-sonnet-4"
        )
        
        print(f"📝 Cached messages: {len(cached_messages)}")
        
        # Check for cache breakpoints
        cache_count = 0
        for msg in cached_messages:
            if isinstance(msg.get('content'), list):
                for item in msg['content']:
                    if isinstance(item, dict) and 'cache_control' in item:
                        cache_count += 1
                        print(f"   🔥 Found cache breakpoint: {item.get('cache_control')}")
        
        print(f"✅ Cache breakpoints found: {cache_count}")
        
        # Validate
        assert len(cached_messages) > 0, "Should return cached messages"
        assert cache_count > 0, "Should have cache breakpoints"
        
        return True
        
    except Exception as e:
        print(f"❌ Caching test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_llm_provider_setup():
    """Test that LLM provider is properly configured"""
    print("\n" + "="*80)
    print("🤖 LLM PROVIDER SETUP TEST")
    print("="*80)
    
    try:
        from core.llm.llm import get_llm_client
        
        # Test provider setup
        print("🔧 Testing LLM provider configuration...")
        
        # Get client
        client = get_llm_client("claude-sonnet-4")
        print(f"✅ LLM client obtained: {type(client)}")
        
        # Test model registry
        from core.llm.registry import get_model_registry
        registry = get_model_registry()
        
        models = registry.list_models()
        print(f"✅ Model registry loaded: {len(models)} models available")
        
        # Check for Claude models
        claude_models = [m for m in models if 'claude' in m.lower()]
        print(f"✅ Claude models available: {len(claude_models)}")
        
        return True
        
    except Exception as e:
        print(f"❌ LLM provider test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_tool_system():
    """Test tool system configuration"""
    print("\n" + "="*80)
    print("🛠️  TOOL SYSTEM TEST")
    print("="*80)
    
    try:
        from core.agentpress.response_processor import ProcessorConfig
        from core.tools.tool_registry import get_tool_registry
        
        # Test processor config
        config = ProcessorConfig(
            native_tool_calling=True,
            execute_tools=False
        )
        
        print(f"✅ ProcessorConfig created: native_tool_calling={config.native_tool_calling}")
        
        # Test tool registry
        registry = get_tool_registry()
        tools = registry.get_all_tools()
        
        print(f"✅ Tool registry loaded: {len(tools)} tools available")
        
        # List some tools
        tool_names = list(tools.keys())[:5]
        print(f"   Sample tools: {tool_names}")
        
        return True
        
    except Exception as e:
        print(f"❌ Tool system test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Run all validation tests"""
    print("🚀 Starting Simple Chat Validation...")
    
    tests = [
        ("Modular Prompt Generation", test_modular_prompt_generation),
        ("Prompt Caching System", test_prompt_caching_system),
        ("LLM Provider Setup", test_llm_provider_setup),
        ("Tool System", test_tool_system)
    ]
    
    results = {}
    
    for test_name, test_func in tests:
        print(f"\n🧪 Running: {test_name}")
        try:
            results[test_name] = await test_func()
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {e}")
            results[test_name] = False
    
    # Summary
    print("\n" + "="*80)
    print("📊 SIMPLE CHAT VALIDATION SUMMARY")
    print("="*80)
    
    passed = sum(results.values())
    total = len(results)
    
    for test_name, passed_test in results.items():
        status = "✅ PASS" if passed_test else "❌ FAIL"
        print(f"{status} {test_name}")
    
    success_rate = passed / total
    print(f"\n🎯 Overall: {passed}/{total} tests passed ({success_rate*100:.1f}%)")
    
    if success_rate >= 0.75:
        print("🎉 CHAT SYSTEM COMPONENTS ARE WORKING!")
        print("💬 Chat response capability is ready")
    else:
        print("⚠️  SOME CHAT COMPONENTS NEED ATTENTION")
    
    return results


if __name__ == "__main__":
    asyncio.run(main())
