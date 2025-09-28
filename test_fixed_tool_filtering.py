#!/usr/bin/env python3
"""
Test the fixed tool filtering logic
"""

import sys
import os
sys.path.append('./backend')

def test_tool_filtering():
    """Test tool filtering with actual tool names"""
    print("🔍 TESTING FIXED TOOL FILTERING")
    print("=" * 60)
    
    try:
        from core.run import ToolManager
        from core.agentpress.thread_manager import ThreadManager
        
        # Create thread manager and tool manager
        thread_manager = ThreadManager()
        tool_manager = ToolManager(thread_manager, project_id="test-project", thread_id="test-thread")
        
        print("🔧 Registering tools...")
        tool_manager.register_all_tools()
        
        registry = thread_manager.tool_registry
        
        print(f"📊 Total tools registered: {len(registry.tools)}")
        
        # Test different queries
        test_queries = [
            "Help me edit a file",
            "Search the web for information", 
            "Create a task list",
            "Show me browser tools",
            "I need to run a command",
            "Help with memory and knowledge",
            "Create a presentation",
            "Work with spreadsheets",
            "General question"
        ]
        
        print("\n🎯 TESTING TOOL FILTERING:")
        print("-" * 60)
        
        for query in test_queries:
            print(f"\n📝 Query: '{query}'")
            
            # Test get_filtered_schemas
            filtered_schemas = registry.get_filtered_schemas(query)
            print(f"   Filtered tools: {len(filtered_schemas)}")
            
            # Extract tool names from schemas
            tool_names = []
            for schema in filtered_schemas:
                if 'function' in schema and 'name' in schema['function']:
                    tool_names.append(schema['function']['name'])
            
            print(f"   Tools: {', '.join(sorted(tool_names)[:10])}{'...' if len(tool_names) > 10 else ''}")
            
            # Check if essential tools are included
            essential_count = 0
            essential_tools = ['web_search', 'create_tasks', 'str_replace', 'ask', 'complete']
            for essential in essential_tools:
                if essential in tool_names:
                    essential_count += 1
            
            print(f"   Essential tools included: {essential_count}/{len(essential_tools)}")
        
        print("\n🔧 TESTING EMPTY QUERY (should return all tools):")
        print("-" * 60)
        all_schemas = registry.get_filtered_schemas("")
        print(f"Empty query tools: {len(all_schemas)}")
        
        print("\n✅ TOOL FILTERING TEST COMPLETE")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_essential_tools_always_available():
    """Test that essential tools are always available regardless of query"""
    print("\n🔍 TESTING ESSENTIAL TOOLS AVAILABILITY")
    print("=" * 60)
    
    try:
        from core.run import ToolManager
        from core.agentpress.thread_manager import ThreadManager
        
        # Create thread manager and tool manager
        thread_manager = ThreadManager()
        tool_manager = ToolManager(thread_manager, project_id="test-project", thread_id="test-thread")
        tool_manager.register_all_tools()
        
        registry = thread_manager.tool_registry
        
        # Essential tools that should ALWAYS be available
        essential_tools = [
            'ask', 'complete',  # Communication
            'web_search', 'scrape_webpage',  # Web research
            'create_tasks', 'update_tasks', 'view_tasks',  # Task management
            'str_replace', 'create_file', 'edit_file',  # File operations
        ]
        
        # Test with various queries
        test_queries = [
            "Random unrelated query about cooking",
            "Tell me about quantum physics",
            "What is the weather like?",
            "Explain machine learning",
            "Help me with my homework"
        ]
        
        print("Testing essential tools availability across different queries:")
        
        all_passed = True
        for query in test_queries:
            print(f"\n📝 Query: '{query[:30]}...'")
            
            filtered_schemas = registry.get_filtered_schemas(query)
            tool_names = []
            for schema in filtered_schemas:
                if 'function' in schema and 'name' in schema['function']:
                    tool_names.append(schema['function']['name'])
            
            missing_essential = []
            for essential in essential_tools:
                if essential not in tool_names:
                    missing_essential.append(essential)
            
            if missing_essential:
                print(f"   ❌ Missing essential tools: {missing_essential}")
                all_passed = False
            else:
                print(f"   ✅ All essential tools available ({len(essential_tools)} tools)")
        
        if all_passed:
            print(f"\n✅ SUCCESS: All essential tools are always available!")
        else:
            print(f"\n❌ FAILURE: Some essential tools are missing in certain queries")
        
        return all_passed
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success1 = test_tool_filtering()
    success2 = test_essential_tools_always_available()
    
    print(f"\n🏁 FINAL RESULTS:")
    print(f"Tool filtering test: {'✅ PASS' if success1 else '❌ FAIL'}")
    print(f"Essential tools test: {'✅ PASS' if success2 else '❌ FAIL'}")
    
    if success1 and success2:
        print(f"\n🎉 ALL TESTS PASSED! Tool filtering is working correctly.")
    else:
        print(f"\n⚠️ SOME TESTS FAILED. Tool filtering needs more work.")
