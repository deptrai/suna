#!/usr/bin/env python3
"""
Test tool calling functionality with optimized context
"""

import sys
import os
sys.path.append('./backend')

def test_tool_calling_functionality():
    """Test that tool calling works with optimized context"""
    print("🔍 TESTING TOOL CALLING FUNCTIONALITY")
    print("=" * 60)
    
    try:
        from core.run import ToolManager
        from core.agentpress.thread_manager import ThreadManager
        from core.agentpress.context_manager import ContextManager
        
        # Create managers
        thread_manager = ThreadManager()
        tool_manager = ToolManager(thread_manager, project_id="test-project", thread_id="test-thread")
        context_manager = ContextManager()
        
        print("🔧 Registering tools...")
        tool_manager.register_all_tools()
        
        registry = thread_manager.tool_registry
        
        print(f"📊 Total tools registered: {len(registry.tools)}")
        
        # Test different scenarios
        test_scenarios = [
            {
                "name": "File Operations",
                "query": "Help me edit a Python file",
                "expected_tools": ["str_replace", "create_file", "edit_file", "search_files"],
                "essential_tools": ["ask", "complete", "web_search", "create_tasks"]
            },
            {
                "name": "Web Research", 
                "query": "Search for information about machine learning",
                "expected_tools": ["web_search", "scrape_webpage"],
                "essential_tools": ["ask", "complete", "str_replace", "create_tasks"]
            },
            {
                "name": "Task Management",
                "query": "Create a project plan with tasks",
                "expected_tools": ["create_tasks", "update_tasks", "view_tasks"],
                "essential_tools": ["ask", "complete", "web_search", "str_replace"]
            },
            {
                "name": "Browser Operations",
                "query": "Navigate to a website and extract content",
                "expected_tools": ["browser_navigate_to", "browser_extract_content", "browser_act"],
                "essential_tools": ["ask", "complete", "web_search", "create_tasks"]
            }
        ]
        
        print("\n🎯 TESTING TOOL CALLING SCENARIOS:")
        print("-" * 60)
        
        all_passed = True
        
        for scenario in test_scenarios:
            print(f"\n📝 Scenario: {scenario['name']}")
            print(f"   Query: '{scenario['query']}'")
            
            # Get filtered schemas
            filtered_schemas = registry.get_filtered_schemas(scenario['query'])
            
            # Extract tool names
            available_tools = []
            for schema in filtered_schemas:
                if 'function' in schema and 'name' in schema['function']:
                    available_tools.append(schema['function']['name'])
            
            print(f"   Available tools: {len(available_tools)}")
            
            # Check expected tools
            expected_found = 0
            for expected_tool in scenario['expected_tools']:
                if expected_tool in available_tools:
                    expected_found += 1
                else:
                    print(f"   ❌ Missing expected tool: {expected_tool}")
                    all_passed = False
            
            print(f"   Expected tools found: {expected_found}/{len(scenario['expected_tools'])}")
            
            # Check essential tools
            essential_found = 0
            for essential_tool in scenario['essential_tools']:
                if essential_tool in available_tools:
                    essential_found += 1
                else:
                    print(f"   ❌ Missing essential tool: {essential_tool}")
                    all_passed = False
            
            print(f"   Essential tools found: {essential_found}/{len(scenario['essential_tools'])}")
            
            # Test system prompt optimization
            large_prompt = "You are a helpful AI assistant. " * 100  # Simulate large prompt
            optimized_prompt = context_manager.get_optimized_system_prompt(scenario['query'], large_prompt)
            
            original_length = len(large_prompt)
            optimized_length = len(optimized_prompt)
            reduction = (original_length - optimized_length) / original_length * 100 if original_length > 0 else 0
            
            print(f"   System prompt: {original_length} -> {optimized_length} chars ({reduction:.1f}% reduction)")
            
            # Overall scenario result
            scenario_passed = (expected_found == len(scenario['expected_tools']) and 
                             essential_found == len(scenario['essential_tools']))
            print(f"   Result: {'✅ PASS' if scenario_passed else '❌ FAIL'}")
        
        print(f"\n🔧 TESTING TOOL SCHEMA STRUCTURE:")
        print("-" * 60)
        
        # Test that schemas have correct structure
        sample_schemas = registry.get_filtered_schemas("test query")[:5]  # Test first 5 schemas
        
        schema_structure_valid = True
        for i, schema in enumerate(sample_schemas):
            print(f"\n   Schema {i+1}:")
            
            # Check required fields
            if 'type' not in schema:
                print(f"     ❌ Missing 'type' field")
                schema_structure_valid = False
            elif schema['type'] != 'function':
                print(f"     ❌ Invalid type: {schema['type']}")
                schema_structure_valid = False
            else:
                print(f"     ✅ Type: {schema['type']}")
            
            if 'function' not in schema:
                print(f"     ❌ Missing 'function' field")
                schema_structure_valid = False
            else:
                function = schema['function']
                if 'name' not in function:
                    print(f"     ❌ Missing function name")
                    schema_structure_valid = False
                else:
                    print(f"     ✅ Name: {function['name']}")
                
                if 'description' not in function:
                    print(f"     ❌ Missing function description")
                    schema_structure_valid = False
                else:
                    print(f"     ✅ Description: {len(function['description'])} chars")
                
                if 'parameters' not in function:
                    print(f"     ❌ Missing function parameters")
                    schema_structure_valid = False
                else:
                    print(f"     ✅ Parameters: present")
        
        print(f"\n   Schema structure valid: {'✅' if schema_structure_valid else '❌'}")
        
        # Final result
        overall_success = all_passed and schema_structure_valid
        
        print(f"\n✅ TOOL CALLING FUNCTIONALITY TEST COMPLETE")
        print(f"   Scenario tests: {'✅ PASS' if all_passed else '❌ FAIL'}")
        print(f"   Schema structure: {'✅ PASS' if schema_structure_valid else '❌ FAIL'}")
        print(f"   Overall: {'✅ PASS' if overall_success else '❌ FAIL'}")
        
        return overall_success
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_integration_with_context_optimization():
    """Test that tool calling works with context optimization enabled"""
    print("\n🔍 TESTING INTEGRATION WITH CONTEXT OPTIMIZATION")
    print("=" * 60)

    try:
        from core.run import ToolManager
        from core.agentpress.thread_manager import ThreadManager
        from core.agentpress.context_manager import ContextManager

        # Simulate a thread manager scenario with tools registered
        thread_manager = ThreadManager()
        tool_manager = ToolManager(thread_manager, project_id="test-project", thread_id="test-thread")
        context_manager = ContextManager()

        # Register tools first
        tool_manager.register_all_tools()
        
        # Test context optimization with tool filtering
        test_query = "Help me debug a Python script with web search"
        
        # Test system prompt optimization
        large_prompt = """You are a helpful AI assistant with many capabilities. 
        You can help with coding, research, task management, and more. 
        Always be helpful and accurate in your responses. 
        Use the available tools to assist users effectively.""" * 20
        
        optimized_prompt = context_manager.get_optimized_system_prompt(test_query, large_prompt)
        
        # Test tool filtering
        filtered_schemas = thread_manager.tool_registry.get_filtered_schemas(test_query)
        
        print(f"📊 Integration test results:")
        print(f"   Original prompt: {len(large_prompt)} chars")
        print(f"   Optimized prompt: {len(optimized_prompt)} chars")
        print(f"   Reduction: {(len(large_prompt) - len(optimized_prompt)) / len(large_prompt) * 100:.1f}%")
        print(f"   Available tools: {len(filtered_schemas)}")
        
        # Check that essential tools are still available
        tool_names = []
        for schema in filtered_schemas:
            if 'function' in schema and 'name' in schema['function']:
                tool_names.append(schema['function']['name'])
        
        essential_tools = ['ask', 'complete', 'web_search', 'str_replace']
        essential_available = sum(1 for tool in essential_tools if tool in tool_names)
        
        print(f"   Essential tools available: {essential_available}/{len(essential_tools)}")
        
        # Check for query-specific tools
        debug_tools = ['execute_command', 'check_command_output']
        web_tools = ['web_search', 'scrape_webpage']
        
        debug_available = sum(1 for tool in debug_tools if tool in tool_names)
        web_available = sum(1 for tool in web_tools if tool in tool_names)
        
        print(f"   Debug tools available: {debug_available}/{len(debug_tools)}")
        print(f"   Web tools available: {web_available}/{len(web_tools)}")
        
        # Success criteria
        success = (
            len(optimized_prompt) < len(large_prompt) * 0.5 and  # At least 50% reduction
            essential_available == len(essential_tools) and      # All essential tools available
            web_available >= 1 and                               # At least 1 web tool
            len(filtered_schemas) > 10                           # Reasonable number of tools
        )
        
        print(f"\n   Integration test: {'✅ PASS' if success else '❌ FAIL'}")
        
        return success
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success1 = test_tool_calling_functionality()
    success2 = test_integration_with_context_optimization()
    
    print(f"\n🏁 FINAL RESULTS:")
    print(f"Tool calling functionality: {'✅ PASS' if success1 else '❌ FAIL'}")
    print(f"Integration with optimization: {'✅ PASS' if success2 else '❌ FAIL'}")
    
    if success1 and success2:
        print(f"\n🎉 ALL TESTS PASSED! Tool calling works correctly with optimization.")
        print(f"   ✅ Essential tools always available")
        print(f"   ✅ Query-specific tools properly filtered")
        print(f"   ✅ System prompt optimization working")
        print(f"   ✅ Schema structure valid")
        print(f"   ✅ Integration between components working")
    else:
        print(f"\n⚠️ SOME TESTS FAILED. Tool calling needs attention.")
