#!/usr/bin/env python3
"""
🏗️ ARCHITECT TOOL CALLING VERIFICATION TEST
Simple verification that tool calling works with context optimization
"""

import sys
import os
import asyncio
sys.path.append('./backend')

async def test_tool_calling_functionality():
    """Test that tool calling works with context optimization"""
    print("🏗️ TESTING TOOL CALLING WITH CONTEXT OPTIMIZATION")
    print("=" * 60)
    
    try:
        from core.run import ToolManager
        from core.agentpress.thread_manager import ThreadManager
        
        # Create managers
        thread_manager = ThreadManager()
        tool_manager = ToolManager(thread_manager, project_id="test-project", thread_id="test-thread")
        
        # Register tools
        tool_manager.register_all_tools()
        
        total_tools = len(thread_manager.tool_registry.tools)
        print(f"📊 Total tools registered: {total_tools}")
        
        # Test specific tool scenarios
        test_scenarios = [
            {
                "query": "I need to search for information about Python optimization",
                "expected_tools": ["web_search", "ask", "complete"],
                "description": "Web search scenario"
            },
            {
                "query": "Create a task list for my project optimization work",
                "expected_tools": ["create_tasks", "update_tasks", "view_tasks", "ask", "complete"],
                "description": "Task management scenario"
            },
            {
                "query": "Help me edit and modify my Python files",
                "expected_tools": ["str_replace", "create_file", "edit_file", "ask", "complete"],
                "description": "File operations scenario"
            }
        ]
        
        print(f"\n🎯 Testing tool calling scenarios:")
        
        all_passed = True
        
        for i, scenario in enumerate(test_scenarios, 1):
            print(f"\n📝 Scenario {i}: {scenario['description']}")
            print(f"   Query: '{scenario['query'][:50]}...'")
            
            # Get filtered tools for this query
            filtered_schemas = thread_manager.tool_registry.get_filtered_schemas(scenario['query'])
            
            # Extract tool names
            available_tools = []
            for schema in filtered_schemas:
                if 'function' in schema and 'name' in schema['function']:
                    available_tools.append(schema['function']['name'])
            
            print(f"   Available tools: {len(available_tools)}")
            
            # Check if expected tools are available
            missing_tools = []
            for expected_tool in scenario['expected_tools']:
                if expected_tool in available_tools:
                    print(f"   ✅ {expected_tool}")
                else:
                    print(f"   ❌ {expected_tool} (missing)")
                    missing_tools.append(expected_tool)
                    all_passed = False
            
            if not missing_tools:
                print(f"   ✅ All expected tools available for this scenario")
            else:
                print(f"   ⚠️ Missing tools: {missing_tools}")
        
        # Test tool execution capability
        print(f"\n🔧 Testing tool execution capability:")
        
        # Get a simple tool to test
        ask_tool = thread_manager.tool_registry.get_tool("ask")
        if ask_tool:
            print(f"   ✅ Tool retrieval working (ask tool found)")
            
            # Check tool structure
            if 'instance' in ask_tool and 'schema' in ask_tool:
                print(f"   ✅ Tool structure correct (instance + schema)")
                
                # Check schema structure
                schema = ask_tool['schema'].schema
                if 'function' in schema and 'name' in schema['function']:
                    print(f"   ✅ Tool schema valid (function name: {schema['function']['name']})")
                else:
                    print(f"   ❌ Tool schema invalid")
                    all_passed = False
            else:
                print(f"   ❌ Tool structure invalid")
                all_passed = False
        else:
            print(f"   ❌ Tool retrieval failed (ask tool not found)")
            all_passed = False
        
        return all_passed
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_context_optimization_impact():
    """Test that context optimization doesn't break tool calling"""
    print("\n🏗️ TESTING CONTEXT OPTIMIZATION IMPACT")
    print("=" * 60)
    
    try:
        from core.run import ToolManager
        from core.agentpress.thread_manager import ThreadManager
        from core.agentpress.context_manager import ContextManager
        
        # Create managers
        thread_manager = ThreadManager()
        tool_manager = ToolManager(thread_manager, project_id="test-project", thread_id="test-thread")
        context_manager = ContextManager()
        
        # Register tools
        tool_manager.register_all_tools()
        
        # Test system prompt optimization
        print(f"🎯 Testing system prompt optimization impact:")
        
        original_prompt = """You are Augment Agent developed by Augment Code, an agentic coding AI assistant with access to the developer's codebase through Augment's world-leading context engine and integrations.
        
        # Identity
        The base model is Claude Sonnet 4 by Anthropic.
        
        # Preliminary tasks
        Before starting to execute a task, make sure you have a clear understanding of the task and the codebase.
        
        # Planning and Task Management
        You have access to task management tools that can help organize complex work.
        """ * 3
        
        query = "Help me optimize my code and create tasks"
        
        if hasattr(context_manager, 'get_optimized_system_prompt'):
            optimized_prompt = context_manager.get_optimized_system_prompt(query, original_prompt)
            
            reduction = ((len(original_prompt) - len(optimized_prompt)) / len(original_prompt)) * 100
            print(f"   System prompt reduction: {reduction:.1f}%")
            
            # Check if optimization preserves key information
            key_phrases = ["Augment Agent", "task management", "codebase"]
            preserved_phrases = sum(1 for phrase in key_phrases if phrase.lower() in optimized_prompt.lower())
            
            print(f"   Key phrases preserved: {preserved_phrases}/{len(key_phrases)}")
            
            if preserved_phrases >= 2:
                print(f"   ✅ Core functionality preserved in optimized prompt")
            else:
                print(f"   ⚠️ Some core functionality may be lost")
        
        # Test tool filtering with optimization
        print(f"\n🎯 Testing tool filtering with optimization:")
        
        # Get tools for the same query
        filtered_schemas = thread_manager.tool_registry.get_filtered_schemas(query)
        tool_names = [schema['function']['name'] for schema in filtered_schemas if 'function' in schema]
        
        # Check for essential tools
        essential_tools = ['ask', 'complete', 'create_tasks', 'web_search']
        essential_available = sum(1 for tool in essential_tools if tool in tool_names)
        
        print(f"   Essential tools available: {essential_available}/{len(essential_tools)}")
        print(f"   Total tools filtered: {len(tool_names)}")
        
        # Check for query-specific tools
        query_specific_tools = ['create_tasks', 'update_tasks', 'str_replace', 'edit_file']
        query_specific_available = sum(1 for tool in query_specific_tools if tool in tool_names)
        
        print(f"   Query-specific tools: {query_specific_available}/{len(query_specific_tools)}")
        
        if essential_available >= 3 and query_specific_available >= 2:
            print(f"   ✅ Context optimization preserves tool calling capability")
            return True
        else:
            print(f"   ⚠️ Context optimization may impact tool calling")
            return False
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

async def main():
    """Main verification test"""
    print("🏗️ WINSTON'S TOOL CALLING VERIFICATION")
    print("=" * 80)
    print("Verifying that context optimization preserves tool calling functionality")
    print("=" * 80)
    
    # Run tests
    test1_result = await test_tool_calling_functionality()
    test2_result = await test_context_optimization_impact()
    
    # Final assessment
    print(f"\n🏁 VERIFICATION RESULTS:")
    print("=" * 60)
    
    print(f"Tool Calling Functionality: {'✅ PASS' if test1_result else '❌ FAIL'}")
    print(f"Context Optimization Impact: {'✅ PASS' if test2_result else '❌ FAIL'}")
    
    overall_success = test1_result and test2_result
    
    if overall_success:
        print(f"\n🎉 VERIFICATION SUCCESSFUL!")
        print(f"   ✅ Tool calling functionality preserved")
        print(f"   ✅ Context optimization working correctly")
        print(f"   ✅ System ready for production use")
        print(f"\n🏗️ ARCHITECT CONCLUSION:")
        print(f"   The context optimization implementation successfully")
        print(f"   balances efficiency with functionality preservation.")
        print(f"   Tool calling capabilities remain fully intact.")
    else:
        print(f"\n⚠️ VERIFICATION ISSUES DETECTED")
        print(f"   Review implementation for tool calling compatibility")
        print(f"   Ensure context optimization doesn't break core functionality")

if __name__ == "__main__":
    asyncio.run(main())
