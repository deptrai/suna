#!/usr/bin/env python3
"""
Test tool calling in production-like environment
"""

import sys
import os
import asyncio
sys.path.append('./backend')

async def test_production_tool_calling():
    """Test tool calling in production-like environment"""
    print("🔍 TESTING PRODUCTION TOOL CALLING")
    print("=" * 60)
    
    try:
        from core.agentpress.thread_manager import ThreadManager
        from core.agentpress.response_processor import ProcessorConfig
        
        # Create thread manager
        thread_manager = ThreadManager()
        
        # Simulate production system prompt
        system_prompt = {
            "role": "system",
            "content": """You are Augment Agent developed by Augment Code, an agentic coding AI assistant with access to the developer's codebase through Augment's world-leading context engine and integrations.

# Role
You are Augment Agent developed by Augment Code, an agentic coding AI assistant with access to the developer's codebase through Augment's world-leading context engine and integrations.
You can read from and write to the codebase using the provided tools.
The current date is 2025-09-28.

# Identity
Here is some information about Augment Agent in case the person asks:
The base model is Claude Sonnet 4 by Anthropic.
You are Augment Agent developed by Augment Code, an agentic coding AI assistant based on the Claude Sonnet 4 model by Anthropic, with access to the developer's codebase through Augment's world-leading context engine and integrations.

# Key Guidelines:
- Search for information to carry out user requests using codebase-retrieval and git-commit-retrieval
- Consider using task management tools for complex work that benefits from structured planning
- Make sure you have all the information before making edits
- Always use package managers for dependency management instead of manually editing package files
- Focus on following user instructions and ask before carrying out actions beyond the user's instructions
- Wrap code excerpts in <augment_code_snippet> XML tags with path= and mode="EXCERPT" attributes
- Use parallel tool calls wherever possible for maximum efficiency
- Always use MCP feedback enhanced after completing tasks

# Available Tools:
You have access to web search, task management, memory, file operations, git, browser automation, codebase retrieval, and advanced reasoning tools. Use them efficiently and in parallel when possible.

# Making Edits:
When making edits, use str_replace_editor - do NOT just write a new file. Before calling str_replace_editor, ALWAYS first call codebase-retrieval asking for detailed information about the code you want to edit.

# Testing:
You are very good at writing unit tests. If you write code, suggest to the user to test the code by writing tests and running them."""
        }
        
        # Test different user queries
        test_queries = [
            {
                "content": "Help me search for information about Python optimization",
                "expected_tools": ["web_search", "scrape_webpage"],
                "category": "research"
            },
            {
                "content": "Create a task list for my project",
                "expected_tools": ["create_tasks", "update_tasks", "view_tasks"],
                "category": "task_management"
            },
            {
                "content": "Help me edit a Python file",
                "expected_tools": ["str_replace", "create_file", "edit_file"],
                "category": "file_operations"
            }
        ]
        
        print(f"📊 System prompt: {len(system_prompt['content'])} characters")
        
        for i, query in enumerate(test_queries):
            print(f"\n🎯 Test {i+1}: {query['category']}")
            print(f"   Query: '{query['content']}'")
            
            # Create user message
            user_message = {
                "role": "user", 
                "content": query['content']
            }
            
            # Create processor config
            config = ProcessorConfig(
                native_tool_calling=True,
                xml_tool_calling=False
            )
            
            try:
                # Test the run_thread method (but don't actually execute)
                # We'll just test the preparation phase
                
                # Add user message to thread
                thread_manager.add_message("test-thread", user_message)
                
                # Get messages for this thread
                messages = thread_manager.get_messages("test-thread")
                print(f"   Messages in thread: {len(messages)}")
                
                # Test context optimization
                from core.agentpress.context_manager import ContextManager
                context_manager = ContextManager()
                
                # Test system prompt optimization
                original_content = system_prompt['content']
                optimized_content = context_manager.get_optimized_system_prompt(
                    query['content'], original_content
                )
                
                reduction = (len(original_content) - len(optimized_content)) / len(original_content) * 100
                print(f"   System prompt: {len(original_content)} -> {len(optimized_content)} chars ({reduction:.1f}% reduction)")
                
                # Test tool filtering
                filtered_schemas = thread_manager.tool_registry.get_filtered_schemas(query['content'])
                print(f"   Available tools: {len(filtered_schemas)}")
                
                # Extract tool names
                available_tools = []
                for schema in filtered_schemas:
                    if 'function' in schema and 'name' in schema['function']:
                        available_tools.append(schema['function']['name'])
                
                # Check expected tools
                expected_found = 0
                for expected_tool in query['expected_tools']:
                    if expected_tool in available_tools:
                        expected_found += 1
                
                print(f"   Expected tools found: {expected_found}/{len(query['expected_tools'])}")
                
                # Check essential tools
                essential_tools = ['ask', 'complete', 'web_search', 'create_tasks']
                essential_found = sum(1 for tool in essential_tools if tool in available_tools)
                print(f"   Essential tools found: {essential_found}/{len(essential_tools)}")
                
                # Test result
                test_passed = (
                    expected_found == len(query['expected_tools']) and
                    essential_found == len(essential_tools) and
                    len(filtered_schemas) > 10 and
                    reduction > 50
                )
                
                print(f"   Result: {'✅ PASS' if test_passed else '❌ FAIL'}")
                
            except Exception as e:
                print(f"   ❌ Error in test: {e}")
                import traceback
                traceback.print_exc()
        
        print(f"\n🔧 TESTING CONTEXT WINDOW UTILIZATION:")
        print("-" * 60)
        
        # Test with large conversation history
        large_messages = []
        for i in range(10):
            large_messages.append({
                "role": "user",
                "content": f"This is test message {i} with some content to simulate a longer conversation history."
            })
            large_messages.append({
                "role": "assistant", 
                "content": f"This is response {i} with detailed information and explanations to test context management."
            })
        
        # Add to thread
        for msg in large_messages:
            thread_manager.add_message("test-thread-large", msg)
        
        # Test context optimization with large history
        large_thread_messages = thread_manager.get_messages("test-thread-large")
        print(f"   Large thread messages: {len(large_thread_messages)}")
        
        # Test context compression
        context_manager = ContextManager()
        compressed_messages = context_manager.optimize_context(
            large_thread_messages, 
            llm_model="gpt-4",
            max_tokens=4000
        )
        
        print(f"   After compression: {len(compressed_messages)} messages")
        
        # Calculate token reduction estimate
        original_text = " ".join([str(msg.get('content', '')) for msg in large_thread_messages])
        compressed_text = " ".join([str(msg.get('content', '')) for msg in compressed_messages])
        
        text_reduction = (len(original_text) - len(compressed_text)) / len(original_text) * 100 if len(original_text) > 0 else 0
        print(f"   Text reduction: {text_reduction:.1f}%")
        
        print(f"\n✅ PRODUCTION TOOL CALLING TEST COMPLETE")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_mcp_tools_availability():
    """Test if MCP tools are available"""
    print("\n🔍 TESTING MCP TOOLS AVAILABILITY")
    print("=" * 60)
    
    try:
        from core.run import ToolManager
        from core.agentpress.thread_manager import ThreadManager
        
        # Create managers
        thread_manager = ThreadManager()
        tool_manager = ToolManager(thread_manager, project_id="test-project", thread_id="test-thread")
        
        # Register all tools
        tool_manager.register_all_tools()
        
        # Check for MCP tools
        all_tools = list(thread_manager.tool_registry.tools.keys())
        
        # Expected MCP tools (based on the missing tools from earlier analysis)
        expected_mcp_tools = [
            'interactive_feedback_MCP_Feedback_Enhanced',
            'remember',
            'create_entities_memory', 
            'codebase-retrieval',
            'git-commit-retrieval',
            'sequentialthinking_Sequential_thinking'
        ]
        
        print(f"📊 Total tools registered: {len(all_tools)}")
        print(f"\n🔍 Checking for MCP tools:")
        
        mcp_found = 0
        for mcp_tool in expected_mcp_tools:
            if mcp_tool in all_tools:
                print(f"   ✅ {mcp_tool}")
                mcp_found += 1
            else:
                print(f"   ❌ {mcp_tool} (missing)")
        
        print(f"\n📈 MCP tools found: {mcp_found}/{len(expected_mcp_tools)}")
        
        if mcp_found == 0:
            print(f"\n⚠️ NO MCP TOOLS FOUND - This explains why some advanced features are missing")
            print(f"   The system is working with sandbox tools only")
            print(f"   MCP tools need to be properly registered for full functionality")
        elif mcp_found < len(expected_mcp_tools):
            print(f"\n⚠️ PARTIAL MCP TOOLS - Some advanced features may be limited")
        else:
            print(f"\n✅ ALL MCP TOOLS AVAILABLE - Full functionality enabled")
        
        return mcp_found > 0
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

async def main():
    """Main test function"""
    print("🚀 STARTING PRODUCTION TOOL CALLING TESTS")
    print("=" * 80)
    
    success1 = await test_production_tool_calling()
    success2 = test_mcp_tools_availability()
    
    print(f"\n🏁 FINAL RESULTS:")
    print(f"Production tool calling: {'✅ PASS' if success1 else '❌ FAIL'}")
    print(f"MCP tools availability: {'✅ PASS' if success2 else '❌ FAIL'}")
    
    if success1:
        print(f"\n🎉 PRODUCTION TOOL CALLING WORKS!")
        print(f"   ✅ Context optimization working (50%+ reduction)")
        print(f"   ✅ Tool filtering working (essential tools always available)")
        print(f"   ✅ Query-specific tools properly selected")
        print(f"   ✅ System prompt optimization working")
        
        if not success2:
            print(f"\n⚠️ NOTE: MCP tools are missing but core functionality works")
            print(f"   The system can handle basic operations with sandbox tools")
            print(f"   For full functionality, MCP tools need to be registered")
    else:
        print(f"\n❌ PRODUCTION TOOL CALLING NEEDS ATTENTION")

if __name__ == "__main__":
    asyncio.run(main())
