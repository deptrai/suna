#!/usr/bin/env python3
"""
Debug context optimization impact on LLM calls
"""

import sys
import os
import asyncio
sys.path.append('backend')

# Set environment variables
os.environ['AUTO_MODEL_ENABLED'] = 'true'
os.environ['ENV_MODE'] = 'local'

async def test_with_large_context():
    """Test LLM call with large context like in production"""
    print("🧪 Testing with large context (simulating production)...")
    
    try:
        from backend.core.services.llm import make_llm_api_call
        from backend.core.agentpress.context_manager import ContextManager
        from backend.core.agentpress.tool_registry import ToolRegistry
        from backend.core.run import ToolManager
        from backend.core.agentpress.thread_manager import ThreadManager
        
        # Create managers like in production
        thread_manager = ThreadManager()
        tool_manager = ToolManager(thread_manager, "test-project", "test-thread")
        tool_manager.register_all_tools()
        
        context_manager = ContextManager()
        
        # Simulate large system prompt
        large_system_prompt = """You are Augment Agent developed by Augment Code, an agentic coding AI assistant with access to the developer's codebase through Augment's world-leading context engine and integrations.
        
        # Identity
        Here is some information about Augment Agent in case the person asks:
        The base model is Claude Sonnet 4 by Anthropic.
        
        # Preliminary tasks
        Before starting to execute a task, make sure you have a clear understanding of the task and the codebase.
        Call information-gathering tools to gather the necessary information.
        
        # Planning and Task Management
        You have access to task management tools that can help organize complex work.
        """ * 50  # Make it very large
        
        user_message = "Hello, can you help me with a simple task?"
        
        # Test with context optimization
        print(f"📊 Original system prompt: {len(large_system_prompt)} chars")
        
        optimized_prompt = context_manager.get_optimized_system_prompt(user_message, large_system_prompt)
        print(f"📊 Optimized system prompt: {len(optimized_prompt)} chars")
        print(f"📊 Reduction: {((len(large_system_prompt) - len(optimized_prompt)) / len(large_system_prompt) * 100):.1f}%")
        
        # Get filtered tools
        filtered_schemas = thread_manager.tool_registry.get_filtered_schemas(user_message)
        print(f"📊 Filtered tools: {len(filtered_schemas)}")
        
        # Prepare messages like in production
        messages = [
            {"role": "system", "content": optimized_prompt},
            {"role": "user", "content": user_message}
        ]
        
        print(f"\n🔍 Testing LLM call with optimized context...")
        print(f"📝 System message length: {len(messages[0]['content'])}")
        print(f"📝 User message: '{messages[1]['content']}'")
        
        # Test the actual LLM call
        response = await make_llm_api_call(
            messages=messages,
            model_name="openai-compatible/gpt-4o-mini",
            max_tokens=100,
            stream=False,
            tools=filtered_schemas[:10] if filtered_schemas else None  # Limit tools
        )
        
        print(f"✅ LLM call with optimized context successful!")
        print(f"📝 Response: {response.choices[0].message.content}")
        
    except Exception as e:
        print(f"❌ LLM call with optimized context failed: {e}")
        import traceback
        traceback.print_exc()

async def test_empty_content_issue():
    """Test if empty content causes issues"""
    print("\n🧪 Testing empty content scenarios...")
    
    try:
        from backend.core.services.llm import make_llm_api_call
        
        # Test scenarios that might cause empty content
        test_scenarios = [
            {
                "name": "Empty user message",
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": ""}
                ]
            },
            {
                "name": "Empty system message", 
                "messages": [
                    {"role": "system", "content": ""},
                    {"role": "user", "content": "Hello"}
                ]
            },
            {
                "name": "Only whitespace",
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": "   \n\t   "}
                ]
            }
        ]
        
        for scenario in test_scenarios:
            print(f"\n📝 Testing: {scenario['name']}")
            
            try:
                response = await make_llm_api_call(
                    messages=scenario['messages'],
                    model_name="openai-compatible/gpt-4o-mini",
                    max_tokens=50,
                    stream=False
                )
                print(f"✅ {scenario['name']}: Success")
                
            except Exception as e:
                print(f"❌ {scenario['name']}: Failed - {e}")
                
    except Exception as e:
        print(f"❌ Empty content test setup failed: {e}")

async def test_tool_calling_with_optimization():
    """Test tool calling with context optimization"""
    print("\n🧪 Testing tool calling with context optimization...")
    
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
        
        # Test query that should trigger tools
        user_message = "Search for information about Python optimization and create a task list"
        
        # Get optimized system prompt
        large_prompt = "You are a helpful AI assistant with many tools available." * 100
        optimized_prompt = context_manager.get_optimized_system_prompt(user_message, large_prompt)
        
        # Get filtered tools
        filtered_schemas = thread_manager.tool_registry.get_filtered_schemas(user_message)
        print(f"📊 Available tools for query: {len(filtered_schemas)}")
        
        # Show some tool names
        tool_names = [schema.get('function', {}).get('name', 'Unknown') for schema in filtered_schemas[:5]]
        print(f"📝 Sample tools: {tool_names}")
        
        messages = [
            {"role": "system", "content": optimized_prompt},
            {"role": "user", "content": user_message}
        ]
        
        # Test with tools
        response = await make_llm_api_call(
            messages=messages,
            model_name="openai-compatible/gpt-4o-mini",
            max_tokens=200,
            stream=False,
            tools=filtered_schemas[:15]  # Limit to 15 tools
        )
        
        print(f"✅ Tool calling with optimization successful!")
        print(f"📝 Response: {response.choices[0].message.content}")
        
        # Check if tools were called
        if hasattr(response.choices[0].message, 'tool_calls') and response.choices[0].message.tool_calls:
            print(f"🔧 Tools called: {len(response.choices[0].message.tool_calls)}")
        else:
            print(f"📝 No tools called (normal for this test)")
        
    except Exception as e:
        print(f"❌ Tool calling test failed: {e}")
        import traceback
        traceback.print_exc()

async def main():
    """Main debug function"""
    print("🔍 DEBUGGING CONTEXT OPTIMIZATION IMPACT ON LLM")
    print("=" * 60)
    
    await test_with_large_context()
    await test_empty_content_issue()
    await test_tool_calling_with_optimization()
    
    print("\n🏁 CONTEXT OPTIMIZATION DEBUG COMPLETE")

if __name__ == "__main__":
    asyncio.run(main())
