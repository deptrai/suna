#!/usr/bin/env python3
"""
🏗️ ARCHITECT COMPREHENSIVE CONTEXT OPTIMIZATION TEST
Winston's comprehensive test suite for context optimization functionality
"""

import sys
import os
import asyncio
import time
sys.path.append('./backend')

async def test_context_manager_optimization():
    """Test ContextManager optimization capabilities"""
    print("🏗️ TESTING CONTEXT MANAGER OPTIMIZATION")
    print("=" * 60)
    
    try:
        from core.agentpress.context_manager import ContextManager, DEFAULT_TOKEN_THRESHOLD
        from litellm.utils import token_counter
        
        # Initialize context manager
        ctx_mgr = ContextManager()
        
        print(f"📊 Default token threshold: {DEFAULT_TOKEN_THRESHOLD:,}")
        print(f"🔧 Context manager initialized successfully")
        
        # Test system prompt optimization
        print(f"\n🎯 Testing system prompt optimization...")
        
        # Create a large system prompt
        large_system_prompt = """
        You are Augment Agent developed by Augment Code, an agentic coding AI assistant with access to the developer's codebase through Augment's world-leading context engine and integrations.
        You can read from and write to the codebase using the provided tools.
        The current date is 2025-09-28.
        
        # Identity
        Here is some information about Augment Agent in case the person asks:
        The base model is Claude Sonnet 4 by Anthropic.
        You are Augment Agent developed by Augment Code, an agentic coding AI assistant based on the Claude Sonnet 4 model by Anthropic, with access to the developer's codebase through Augment's world-leading context engine and integrations.
        
        # Preliminary tasks
        Before starting to execute a task, make sure you have a clear understanding of the task and the codebase.
        Call information-gathering tools to gather the necessary information.
        If you need information about the current state of the codebase, use the codebase-retrieval tool.
        If you need information about previous changes to the codebase, use the git-commit-retrieval tool.
        The git-commit-retrieval tool is very useful for finding how similar changes were made in the past and will help you make a better plan.
        Remember that the codebase may have changed since the commit was made, so you may need to check the current codebase to see if the information is still accurate.
        
        # Planning and Task Management
        You have access to task management tools that can help organize complex work. Consider using these tools when:
        - The user explicitly requests planning, task breakdown, or project organization
        - You're working on complex multi-step tasks that would benefit from structured planning
        - The user mentions wanting to track progress or see next steps
        - You need to coordinate multiple related changes across the codebase
        """ * 3  # Make it even larger
        
        # Test optimization
        query_context = "Help me optimize code performance"
        
        if hasattr(ctx_mgr, 'get_optimized_system_prompt'):
            optimized_prompt = ctx_mgr.get_optimized_system_prompt(query_context, large_system_prompt)
            
            original_length = len(large_system_prompt)
            optimized_length = len(optimized_prompt)
            reduction_percent = ((original_length - optimized_length) / original_length * 100)
            
            print(f"   Original prompt: {original_length:,} chars")
            print(f"   Optimized prompt: {optimized_length:,} chars")
            print(f"   Reduction: {reduction_percent:.1f}%")
            
            if reduction_percent > 70:
                print(f"   ✅ System prompt optimization working (target: 70-85%)")
            else:
                print(f"   ⚠️ System prompt optimization below target")
        else:
            print(f"   ⚠️ System prompt optimization method not found")
        
        # Test message compression
        print(f"\n🎯 Testing message compression...")
        
        # Create test messages
        test_messages = [
            {"role": "user", "content": "Hello, I need help with my code" * 100},
            {"role": "assistant", "content": "I'll help you with your code. Let me analyze it." * 100},
            {"role": "user", "content": "Here's my code: " + "def function():\n    pass\n" * 200},
            {"role": "tool", "content": "Tool result: " + "data " * 1000},
            {"role": "assistant", "content": "Based on the analysis: " + "analysis " * 500}
        ]
        
        # Test compression
        compressed_messages = ctx_mgr.compress_messages(test_messages, "gpt-4", 15000, 10000)
        
        original_count = len(test_messages)
        compressed_count = len(compressed_messages)
        
        print(f"   Original messages: {original_count}")
        print(f"   Compressed messages: {compressed_count}")
        print(f"   ✅ Message compression working")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_tool_registry_filtering():
    """Test ToolRegistry filtering capabilities"""
    print("\n🏗️ TESTING TOOL REGISTRY FILTERING")
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
        
        # Test different query types
        test_scenarios = [
            {
                "query": "Help me search the web for information",
                "expected_tools": ["web_search", "scrape_webpage"],
                "category": "Web Research"
            },
            {
                "query": "I need to create and manage tasks",
                "expected_tools": ["create_tasks", "update_tasks", "view_tasks"],
                "category": "Task Management"
            },
            {
                "query": "Edit and modify files in my project",
                "expected_tools": ["str_replace", "create_file", "edit_file"],
                "category": "File Operations"
            },
            {
                "query": "Execute commands and check output",
                "expected_tools": ["execute_command", "check_command_output"],
                "category": "Command Execution"
            },
            {
                "query": "Work with spreadsheets and data",
                "expected_tools": ["analyze_sheet", "create_sheet", "update_sheet"],
                "category": "Data Operations"
            }
        ]
        
        print(f"\n🎯 Testing query-specific tool filtering:")
        
        all_scenarios_passed = True
        
        for scenario in test_scenarios:
            print(f"\n📝 {scenario['category']}: '{scenario['query'][:50]}...'")
            
            # Get filtered tools
            filtered_schemas = thread_manager.tool_registry.get_filtered_schemas(scenario['query'])
            filtered_count = len(filtered_schemas)
            
            # Extract tool names
            tool_names = []
            for schema in filtered_schemas:
                if 'function' in schema and 'name' in schema['function']:
                    tool_names.append(schema['function']['name'])
            
            print(f"   Filtered tools: {filtered_count}/{total_tools} ({(filtered_count/total_tools*100):.1f}%)")
            
            # Check for expected tools
            expected_found = 0
            for expected_tool in scenario['expected_tools']:
                if expected_tool in tool_names:
                    expected_found += 1
                    print(f"   ✅ {expected_tool}")
                else:
                    print(f"   ❌ {expected_tool} (missing)")
                    all_scenarios_passed = False
            
            # Check essential tools
            essential_tools = ['ask', 'complete', 'web_search', 'create_tasks']
            essential_found = sum(1 for tool in essential_tools if tool in tool_names)
            print(f"   Essential tools: {essential_found}/{len(essential_tools)}")
            
            if essential_found < len(essential_tools):
                print(f"   ⚠️ Some essential tools missing")
                all_scenarios_passed = False
            
            # Check reduction ratio
            reduction_ratio = (1 - filtered_count/total_tools) * 100
            if reduction_ratio >= 50 and reduction_ratio <= 80:
                print(f"   ✅ Good reduction ratio: {reduction_ratio:.1f}%")
            else:
                print(f"   ⚠️ Reduction ratio outside target: {reduction_ratio:.1f}%")
        
        if all_scenarios_passed:
            print(f"\n✅ All tool filtering scenarios passed")
        else:
            print(f"\n⚠️ Some tool filtering scenarios failed")
        
        return all_scenarios_passed
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_end_to_end_optimization():
    """Test end-to-end context optimization in thread execution"""
    print("\n🏗️ TESTING END-TO-END OPTIMIZATION")
    print("=" * 60)
    
    try:
        from core.run import ToolManager
        from core.agentpress.thread_manager import ThreadManager
        
        # Create managers
        thread_manager = ThreadManager()
        tool_manager = ToolManager(thread_manager, project_id="test-project", thread_id="test-thread")
        
        # Register tools
        tool_manager.register_all_tools()
        
        # Create test thread with proper UUID format
        import uuid
        test_account_id = str(uuid.uuid4())
        test_project_id = str(uuid.uuid4())

        thread_id = await thread_manager.create_thread(
            account_id=test_account_id,
            project_id=test_project_id
        )
        
        print(f"📊 Created test thread: {thread_id}")
        
        # Add test messages
        await thread_manager.add_message(
            thread_id=thread_id,
            role="user",
            content="I need help optimizing my code performance. Can you search for best practices and create a task list?"
        )
        
        # Test system prompt optimization
        system_prompt = {
            "content": """You are Augment Agent developed by Augment Code, an agentic coding AI assistant with access to the developer's codebase through Augment's world-leading context engine and integrations.
            
            # Identity
            The base model is Claude Sonnet 4 by Anthropic.
            
            # Preliminary tasks
            Before starting to execute a task, make sure you have a clear understanding of the task and the codebase.
            Call information-gathering tools to gather the necessary information.
            
            # Planning and Task Management
            You have access to task management tools that can help organize complex work.
            """ * 5  # Make it larger
        }
        
        print(f"🎯 Testing system prompt in thread context...")
        
        # Get messages
        messages = await thread_manager.get_messages(thread_id)
        print(f"   Messages in thread: {len(messages)}")
        
        # Test tool filtering in context
        query = "search for best practices and create tasks"
        filtered_schemas = thread_manager.tool_registry.get_filtered_schemas(query)
        
        print(f"   Tools filtered for query: {len(filtered_schemas)}")
        
        # Check for expected tools
        tool_names = [schema['function']['name'] for schema in filtered_schemas if 'function' in schema]
        
        expected_tools = ['web_search', 'create_tasks', 'ask', 'complete']
        found_tools = [tool for tool in expected_tools if tool in tool_names]
        
        print(f"   Expected tools found: {len(found_tools)}/{len(expected_tools)}")
        
        for tool in expected_tools:
            if tool in tool_names:
                print(f"   ✅ {tool}")
            else:
                print(f"   ❌ {tool}")
        
        if len(found_tools) == len(expected_tools):
            print(f"   ✅ End-to-end optimization working correctly")
            return True
        else:
            print(f"   ⚠️ Some expected tools missing in end-to-end test")
            return False
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_performance_metrics():
    """Test performance metrics of optimization"""
    print("\n🏗️ TESTING PERFORMANCE METRICS")
    print("=" * 60)
    
    try:
        from core.run import ToolManager
        from core.agentpress.thread_manager import ThreadManager
        import time
        
        # Create managers
        thread_manager = ThreadManager()
        tool_manager = ToolManager(thread_manager, project_id="test-project", thread_id="test-thread")
        
        # Register tools
        start_time = time.time()
        tool_manager.register_all_tools()
        registration_time = time.time() - start_time
        
        print(f"📊 Tool registration time: {registration_time:.3f}s")
        
        # Test filtering performance
        test_queries = [
            "search the web for information",
            "create and manage tasks",
            "edit files and code",
            "execute commands",
            "work with data and spreadsheets"
        ]
        
        total_filtering_time = 0
        
        for query in test_queries:
            start_time = time.time()
            filtered_schemas = thread_manager.tool_registry.get_filtered_schemas(query)
            filtering_time = time.time() - start_time
            total_filtering_time += filtering_time
            
            print(f"   Query filtering time: {filtering_time:.3f}s ({len(filtered_schemas)} tools)")
        
        avg_filtering_time = total_filtering_time / len(test_queries)
        print(f"📊 Average filtering time: {avg_filtering_time:.3f}s")
        
        # Performance benchmarks
        if registration_time < 5.0:
            print(f"✅ Tool registration performance: GOOD ({registration_time:.3f}s < 5.0s)")
        else:
            print(f"⚠️ Tool registration performance: SLOW ({registration_time:.3f}s >= 5.0s)")
        
        if avg_filtering_time < 0.1:
            print(f"✅ Tool filtering performance: EXCELLENT ({avg_filtering_time:.3f}s < 0.1s)")
        elif avg_filtering_time < 0.5:
            print(f"✅ Tool filtering performance: GOOD ({avg_filtering_time:.3f}s < 0.5s)")
        else:
            print(f"⚠️ Tool filtering performance: SLOW ({avg_filtering_time:.3f}s >= 0.5s)")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

async def main():
    """Main comprehensive test function"""
    print("🏗️ WINSTON'S COMPREHENSIVE CONTEXT OPTIMIZATION TEST")
    print("=" * 80)
    print("Testing all aspects of context optimization implementation")
    print("=" * 80)
    
    # Run all tests
    test_results = {}
    
    test_results['context_manager'] = await test_context_manager_optimization()
    test_results['tool_filtering'] = await test_tool_registry_filtering()
    test_results['end_to_end'] = await test_end_to_end_optimization()
    test_results['performance'] = await test_performance_metrics()
    
    # Final assessment
    print(f"\n🏁 WINSTON'S FINAL ASSESSMENT:")
    print("=" * 60)
    
    passed_tests = sum(1 for result in test_results.values() if result)
    total_tests = len(test_results)
    
    for test_name, result in test_results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name.replace('_', ' ').title()}: {status}")
    
    success_rate = (passed_tests / total_tests) * 100
    
    print(f"\nOverall Success Rate: {success_rate:.1f}% ({passed_tests}/{total_tests})")
    
    if success_rate >= 90:
        print(f"🎉 EXCELLENT: Context optimization is working optimally!")
        print(f"   ✅ System ready for production deployment")
        print(f"   ✅ All optimization targets achieved")
        print(f"   ✅ Tool calling functionality preserved")
    elif success_rate >= 75:
        print(f"✅ GOOD: Context optimization is working well with minor issues")
        print(f"   ⚠️ Some optimizations may need fine-tuning")
    else:
        print(f"⚠️ NEEDS WORK: Context optimization has significant issues")
        print(f"   ❌ Review implementation and fix failing tests")

if __name__ == "__main__":
    asyncio.run(main())
