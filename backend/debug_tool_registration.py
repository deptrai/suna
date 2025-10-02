#!/usr/bin/env python3
"""
DEBUG TOOL REGISTRATION

Check if tools are being registered during agent run
"""
import asyncio
from core.run import AgentRunner, AgentConfig
from core.agentpress.thread_manager import ThreadManager


async def debug_tool_registration():
    """Debug tool registration in agent run"""
    print("🔍 DEBUGGING TOOL REGISTRATION")
    print("="*80)

    # Get a real thread ID from database
    from core.services.supabase import DBConnection
    db = DBConnection()
    client = await db.client

    # Get latest thread
    threads_result = await client.table('threads').select('thread_id, project_id').order('created_at', desc=True).limit(1).execute()

    if not threads_result.data:
        print("❌ No threads found in database")
        return

    thread_data = threads_result.data[0]
    thread_id = thread_data['thread_id']
    project_id = thread_data['project_id']

    print(f"Using thread: {thread_id}")
    print(f"Using project: {project_id}")

    # Create agent config
    config = AgentConfig(
        thread_id=thread_id,
        project_id=project_id,
        model_name="openai-compatible/gpt-4o-mini",
        stream=False
    )

    # Create agent runner
    runner = AgentRunner(config)

    print("\n🔧 STEP 1: Call setup()")
    print("-"*60)
    await runner.setup()

    print("\n📊 STEP 2: Check tools BEFORE setup_tools()")
    print("-"*60)
    tool_count_before = len(runner.thread_manager.tool_registry.tools)
    print(f"Tools registered: {tool_count_before}")

    print("\n🔧 STEP 3: Call setup_tools()")
    print("-"*60)
    await runner.setup_tools()

    print("\n📊 STEP 4: Check tools AFTER setup_tools()")
    print("-"*60)
    tool_count_after = len(runner.thread_manager.tool_registry.tools)
    print(f"Tools registered: {tool_count_after}")
    
    if tool_count_after > 0:
        print(f"\n✅ SUCCESS: {tool_count_after} tools registered!")

        # Show some tool names
        tool_names = list(runner.thread_manager.tool_registry.tools.keys())
        print(f"\n📋 Sample tools (first 10):")
        for i, name in enumerate(tool_names[:10], 1):
            print(f"   {i}. {name}")

        # Check for specific tools
        print(f"\n🔍 Checking for specific tools:")
        check_tools = ['create_tasks', 'web_search', 'ask', 'complete']
        for tool_name in check_tools:
            exists = tool_name in runner.thread_manager.tool_registry.tools
            status = "✅" if exists else "❌"
            print(f"   {status} {tool_name}")
    else:
        print(f"\n❌ FAILURE: No tools registered!")
        print("This is the root cause of the issue!")
    
    print("\n" + "="*80)
    print("🎯 CONCLUSION:")
    if tool_count_after > 0:
        print("✅ Tool registration is working correctly")
        print("⚠️  Issue must be elsewhere in the pipeline")
    else:
        print("❌ Tool registration is NOT working")
        print("🔧 Need to debug ToolManager.register_all_tools()")


if __name__ == "__main__":
    asyncio.run(debug_tool_registration())

