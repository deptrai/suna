"""
Debug script to check tool registry and filtering logic.
"""

import asyncio
from core.agentpress.thread_manager import ThreadManager
from core.run import ToolManager

async def main():
    print("=" * 80)
    print("TOOL REGISTRY DEBUG")
    print("=" * 80)

    # Initialize ThreadManager (like in real app)
    thread_manager = ThreadManager()

    # Register tools (like in real app)
    tool_manager = ToolManager(thread_manager, project_id="test-project", thread_id="test-thread")
    tool_manager.register_all_tools()

    # Get registry
    registry = thread_manager.tool_registry
    
    # Get all tools
    all_schemas = registry.get_openapi_schemas()
    print(f"\n📊 Total tools registered: {len(all_schemas)}")
    print("\nAll tools:")
    for i, schema in enumerate(all_schemas, 1):
        tool_name = schema.get("function", {}).get("name", "unknown")
        tool_desc = schema.get("function", {}).get("description", "")[:100]
        print(f"  {i}. {tool_name}")
        print(f"     {tool_desc}...")
    
    # Test queries
    test_queries = [
        "hãy lập kế hoạch tuần tự để research về dự án pancakeswap",
        "Create a file called test.txt",
        "Parse this CSV data",
        "Write a blog post",
        "Search the web for information",
        "Execute a shell command",
    ]
    
    print("\n" + "=" * 80)
    print("FILTERING LOGIC TEST")
    print("=" * 80)
    
    for query in test_queries:
        print(f"\n🔍 Query: '{query}'")
        filtered = registry.get_filtered_schemas(query)
        print(f"   Filtered tools: {len(filtered)}")
        
        if filtered:
            for schema in filtered:
                tool_name = schema.get("function", {}).get("name", "unknown")
                print(f"     - {tool_name}")
        else:
            print("     ❌ NO TOOLS MATCHED!")
    
    print("\n" + "=" * 80)
    print("ESSENTIAL TOOLS TEST")
    print("=" * 80)
    
    # Check if there are essential tools
    essential = registry.get_essential_schemas()
    print(f"\n📌 Essential tools: {len(essential)}")
    for schema in essential:
        tool_name = schema.get("function", {}).get("name", "unknown")
        print(f"  - {tool_name}")
    
    print("\n" + "=" * 80)
    print("DONE")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(main())

