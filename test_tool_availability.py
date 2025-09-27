#!/usr/bin/env python3
"""
Test script to debug tool availability in balanced optimization
"""
import sys
import os
import asyncio
sys.path.append('backend')

from backend.core.agentpress.tool_registry import ToolRegistry
from backend.core.agentpress.context_manager import ContextManager
from backend.core.agentpress.thread_manager import ThreadManager
from backend.core.run import ToolManager

async def test_tool_filtering():
    """Test tool filtering with different queries"""

    print("🔧 TESTING TOOL AVAILABILITY")
    print("=" * 50)

    # Initialize ThreadManager and ToolManager to get properly registered tools
    thread_manager = ThreadManager()
    tool_manager = ToolManager(thread_manager, "test_project", "test_thread")
    tool_manager.register_all_tools()

    registry = thread_manager.tool_registry

    # Debug: Show all available tools
    print(f"\n🔍 DEBUG: All registered tools ({len(registry.tools)}):")
    for tool_name in sorted(registry.tools.keys()):
        print(f"  - {tool_name}")

    # Test queries
    test_queries = [
        "search for latest AI news",
        "create a file",
        "help me with git",
        "run a command",
        "remember this information",
        "simple question"
    ]

    for query in test_queries:
        print(f"\n📝 Query: '{query}'")
        print("-" * 30)

        # Get filtered schemas
        schemas = registry.get_filtered_schemas(query)
        tool_names = [schema.get('function', {}).get('name', 'Unknown') for schema in schemas]

        print(f"🔧 Available tools ({len(tool_names)}):")
        for tool in sorted(tool_names):
            print(f"  - {tool}")

        # Check essential tools
        essential_tools = [
            'web-search', 'add_tasks', 'remember',
            'str-replace-editor', 'codebase-retrieval'
        ]

        missing_essential = [tool for tool in essential_tools if tool not in tool_names]
        if missing_essential:
            print(f"❌ Missing essential tools: {missing_essential}")
        else:
            print("✅ All essential tools present")

def test_context_optimization():
    """Test context optimization"""
    
    print("\n\n🎯 TESTING CONTEXT OPTIMIZATION")
    print("=" * 50)
    
    # Initialize context manager
    context_manager = ContextManager()
    
    # Test message
    test_message = "search for latest AI news"
    
    # Test system prompt optimization
    base_prompt = "You are an AI assistant" * 1000  # Large prompt
    optimized_prompt = context_manager.get_optimized_system_prompt(test_message, base_prompt)
    
    print(f"📊 Base prompt length: {len(base_prompt)} chars")
    print(f"📊 Optimized prompt length: {len(optimized_prompt)} chars")
    print(f"📊 Reduction: {((len(base_prompt) - len(optimized_prompt)) / len(base_prompt) * 100):.1f}%")
    
    print(f"\n📝 Optimized prompt preview:")
    print(optimized_prompt[:500] + "..." if len(optimized_prompt) > 500 else optimized_prompt)

if __name__ == "__main__":
    asyncio.run(test_tool_filtering())
    test_context_optimization()

    print("\n\n🎉 TESTING COMPLETE")
