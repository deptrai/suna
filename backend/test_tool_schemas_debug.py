"""
Debug tool schemas to see what's being sent to v98store API
"""
import asyncio
import json
from core.agentpress.tool_registry import ToolRegistry
from core.services.supabase import DBConnection

async def debug_tool_schemas():
    """Debug tool schemas for create_tasks query"""
    
    # Initialize tool registry
    registry = ToolRegistry()
    
    # Test query
    user_query = "call tool create_tasks để tạo 3 tasks về search token cake"
    
    print("=" * 80)
    print("🔍 DEBUGGING TOOL SCHEMAS")
    print("=" * 80)
    
    # 1. Get ALL tools
    all_tools = registry.get_openapi_schemas()
    print(f"\n1️⃣ ALL TOOLS: {len(all_tools)} tools")
    for i, tool in enumerate(all_tools[:5], 1):
        func = tool.get('function', {})
        print(f"   {i}. {func.get('name', 'Unknown')}")
    
    # 2. Get filtered tools
    filtered_tools = registry.get_filtered_schemas(user_query)
    print(f"\n2️⃣ FILTERED TOOLS: {len(filtered_tools)} tools")
    for i, tool in enumerate(filtered_tools[:10], 1):
        func = tool.get('function', {})
        print(f"   {i}. {func.get('name', 'Unknown')}")
    
    # 3. Apply 3-tool limit with smart selection (same logic as thread_manager.py)
    query_lower = user_query.lower()
    priority_tools = []
    
    # Priority 1: Search-related queries
    if any(keyword in query_lower for keyword in ['search', 'tìm kiếm', 'find', 'research', 'look up', 'tra cứu']):
        web_search = next((t for t in filtered_tools if t.get("function", {}).get("name") == "web_search"), None)
        if web_search and web_search not in priority_tools:
            priority_tools.append(web_search)
            print(f"\n🎯 Priority tool added: web_search (search query detected)")
    
    # Priority 2: Task management queries
    if any(keyword in query_lower for keyword in ['task', 'todo', 'create', 'tạo', 'add', 'thêm']):
        create_tasks = next((t for t in filtered_tools if t.get("function", {}).get("name") == "create_tasks"), None)
        if create_tasks and create_tasks not in priority_tools:
            priority_tools.append(create_tasks)
            print(f"🎯 Priority tool added: create_tasks (task query detected)")
    
    # Priority 3: Command execution queries
    if any(keyword in query_lower for keyword in ['run', 'execute', 'command', 'chạy', 'thực thi']):
        execute_command = next((t for t in filtered_tools if t.get("function", {}).get("name") == "execute_command"), None)
        if execute_command and execute_command not in priority_tools:
            priority_tools.append(execute_command)
            print(f"🎯 Priority tool added: execute_command (command query detected)")
    
    # Fill remaining slots with top filtered tools
    for tool in filtered_tools:
        if tool not in priority_tools and len(priority_tools) < 3:
            priority_tools.append(tool)
    
    final_tools = priority_tools[:3]
    
    print(f"\n3️⃣ FINAL 3 TOOLS (after smart selection):")
    for i, tool in enumerate(final_tools, 1):
        func = tool.get('function', {})
        print(f"   {i}. {func.get('name', 'Unknown')}")
    
    # 4. Check tool schema structure
    print(f"\n4️⃣ TOOL SCHEMA STRUCTURE CHECK:")
    for i, tool in enumerate(final_tools, 1):
        print(f"\n   Tool {i}: {tool.get('function', {}).get('name', 'Unknown')}")
        print(f"   - Type: {tool.get('type')}")
        print(f"   - Has function: {bool(tool.get('function'))}")
        print(f"   - Has parameters: {bool(tool.get('function', {}).get('parameters'))}")
        
        # Check if schema is valid OpenAI format
        if tool.get('type') != 'function':
            print(f"   ❌ ERROR: type should be 'function', got '{tool.get('type')}'")
        if not tool.get('function'):
            print(f"   ❌ ERROR: missing 'function' field")
        if not tool.get('function', {}).get('name'):
            print(f"   ❌ ERROR: missing 'function.name' field")
        if not tool.get('function', {}).get('parameters'):
            print(f"   ❌ ERROR: missing 'function.parameters' field")
    
    # 5. Save to file for inspection
    output = {
        "query": user_query,
        "all_tools_count": len(all_tools),
        "filtered_tools_count": len(filtered_tools),
        "final_tools_count": len(final_tools),
        "final_tools": final_tools
    }
    
    with open('logs/tool_schemas_debug.json', 'w') as f:
        json.dump(output, f, indent=2)
    
    print(f"\n5️⃣ Saved full schemas to: logs/tool_schemas_debug.json")
    
    # 6. Compare with working request
    print(f"\n6️⃣ COMPARING WITH WORKING REQUEST:")
    try:
        with open('logs/litellm_request_debug.json', 'r') as f:
            working_request = json.load(f)
            working_tools = working_request.get('tools', [])
            print(f"   Working request had {len(working_tools)} tools:")
            for i, tool in enumerate(working_tools, 1):
                func = tool.get('function', {})
                print(f"   {i}. {func.get('name', 'Unknown')}")
            
            # Check if schemas match
            print(f"\n   Schema comparison:")
            for i, (final_tool, working_tool) in enumerate(zip(final_tools, working_tools), 1):
                final_name = final_tool.get('function', {}).get('name')
                working_name = working_tool.get('function', {}).get('name')
                match = "✅" if final_name == working_name else "❌"
                print(f"   {i}. {match} Final: {final_name}, Working: {working_name}")
    except Exception as e:
        print(f"   ⚠️  Could not load working request: {e}")
    
    print("\n" + "=" * 80)
    print("✅ DEBUG COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(debug_tool_schemas())

