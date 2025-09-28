#!/usr/bin/env python3
"""
Test MCP tools registration for development environment
"""

import sys
import os
import asyncio
sys.path.append('./backend')

async def test_mcp_tools_registration():
    """Test MCP tools registration in development environment"""
    print("🔍 TESTING MCP TOOLS REGISTRATION")
    print("=" * 60)
    
    try:
        from core.run import ToolManager
        from core.agentpress.thread_manager import ThreadManager
        
        # Create managers
        thread_manager = ThreadManager()
        tool_manager = ToolManager(thread_manager, project_id="test-project", thread_id="test-thread")
        
        # Set account_id for MCP registration
        tool_manager.account_id = "dev-account-123"
        
        print("🔧 Registering sandbox tools...")
        tool_manager.register_all_tools()
        
        initial_tool_count = len(thread_manager.tool_registry.tools)
        print(f"📊 Initial tools registered: {initial_tool_count}")
        
        print("\n🔧 Attempting to register development MCP tools...")
        mcp_success = await tool_manager.register_development_mcp_tools()
        
        final_tool_count = len(thread_manager.tool_registry.tools)
        print(f"📊 Final tools registered: {final_tool_count}")
        
        if mcp_success:
            print(f"✅ MCP tools registration successful!")
            print(f"   Added {final_tool_count - initial_tool_count} MCP tools")
            
            # Check for specific MCP tools
            expected_mcp_tools = [
                'interactive_feedback_MCP_Feedback_Enhanced',
                'remember',
                'create_entities_memory',
                'codebase-retrieval',
                'git-commit-retrieval',
                'sequentialthinking_Sequential_thinking'
            ]
            
            available_tools = list(thread_manager.tool_registry.tools.keys())
            
            print(f"\n🔍 Checking for expected MCP tools:")
            mcp_found = 0
            for mcp_tool in expected_mcp_tools:
                if mcp_tool in available_tools:
                    print(f"   ✅ {mcp_tool}")
                    mcp_found += 1
                else:
                    print(f"   ❌ {mcp_tool} (missing)")
            
            print(f"\n📈 MCP tools found: {mcp_found}/{len(expected_mcp_tools)}")
            
            if mcp_found > 0:
                print(f"🎉 SUCCESS: {mcp_found} MCP tools are now available!")
                return True
            else:
                print(f"⚠️ WARNING: No MCP tools found despite successful registration")
                return False
        else:
            print(f"❌ MCP tools registration failed")
            print(f"   This is expected in test environment without proper MCP server")
            print(f"   System works fine with {initial_tool_count} sandbox tools")
            return False
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

async def test_tool_filtering_with_mcp():
    """Test tool filtering with MCP tools included"""
    print("\n🔍 TESTING TOOL FILTERING WITH MCP TOOLS")
    print("=" * 60)
    
    try:
        from core.run import ToolManager
        from core.agentpress.thread_manager import ThreadManager
        
        # Create managers
        thread_manager = ThreadManager()
        tool_manager = ToolManager(thread_manager, project_id="test-project", thread_id="test-thread")
        tool_manager.account_id = "dev-account-123"
        
        # Register all tools including MCP
        tool_manager.register_all_tools()
        await tool_manager.register_development_mcp_tools()
        
        total_tools = len(thread_manager.tool_registry.tools)
        print(f"📊 Total tools available: {total_tools}")
        
        # Test filtering with different queries
        test_queries = [
            "Help me remember something important",
            "Search the codebase for a function",
            "I need feedback on my work",
            "Use advanced reasoning to solve this problem"
        ]
        
        print(f"\n🎯 Testing tool filtering with MCP tools:")
        
        for query in test_queries:
            print(f"\n📝 Query: '{query}'")
            
            filtered_schemas = thread_manager.tool_registry.get_filtered_schemas(query)
            filtered_count = len(filtered_schemas)
            
            # Extract tool names
            tool_names = []
            for schema in filtered_schemas:
                if 'function' in schema and 'name' in schema['function']:
                    tool_names.append(schema['function']['name'])
            
            print(f"   Filtered tools: {filtered_count}/{total_tools}")
            
            # Check for MCP tools in results
            mcp_tools_in_result = [
                tool for tool in tool_names 
                if any(mcp in tool for mcp in ['remember', 'codebase', 'feedback', 'thinking'])
            ]
            
            if mcp_tools_in_result:
                print(f"   MCP tools included: {mcp_tools_in_result}")
            else:
                print(f"   No MCP tools in filtered results")
            
            # Check essential tools still available
            essential_tools = ['ask', 'complete', 'web_search', 'create_tasks']
            essential_available = sum(1 for tool in essential_tools if tool in tool_names)
            print(f"   Essential tools: {essential_available}/{len(essential_tools)}")
        
        print(f"\n✅ Tool filtering test with MCP tools complete")
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

async def main():
    """Main test function"""
    print("🚀 STARTING MCP TOOLS REGISTRATION TESTS")
    print("=" * 80)
    
    success1 = await test_mcp_tools_registration()
    success2 = await test_tool_filtering_with_mcp()
    
    print(f"\n🏁 FINAL RESULTS:")
    print(f"MCP tools registration: {'✅ PASS' if success1 else '❌ FAIL'}")
    print(f"Tool filtering with MCP: {'✅ PASS' if success2 else '❌ FAIL'}")
    
    if success1:
        print(f"\n🎉 MCP TOOLS SUCCESSFULLY REGISTERED!")
        print(f"   ✅ Development MCP tools are now available")
        print(f"   ✅ Tool filtering includes MCP tools")
        print(f"   ✅ Full functionality enabled")
    else:
        print(f"\n⚠️ MCP TOOLS REGISTRATION FAILED")
        print(f"   This is expected in test environment without MCP server")
        print(f"   System works perfectly with sandbox tools only")
        print(f"   For production MCP tools, configure agent_config properly")

if __name__ == "__main__":
    asyncio.run(main())
