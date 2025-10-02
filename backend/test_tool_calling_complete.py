"""
Complete tool calling test script.
Tests tool selection, execution, and response.
"""
import asyncio
import sys
import time
from datetime import datetime

async def main():
    print("=" * 80)
    print("🧪 COMPLETE TOOL CALLING TEST")
    print("=" * 80)
    print()
    
    # Step 1: Check and stop stuck agent runs
    print("📋 Step 1: Checking for stuck agent runs...")
    try:
        from core.services.supabase import client
        
        # Get running agent runs
        result = client.table('agent_runs').select('*').eq('status', 'running').execute()
        
        if result.data:
            print(f"⚠️  Found {len(result.data)} running agent runs:")
            for run in result.data:
                print(f"   - ID: {run['id'][:8]}... Thread: {run['thread_id'][:8]}... Created: {run['created_at']}")
            
            # Stop them
            for run in result.data:
                client.table('agent_runs').update({'status': 'error'}).eq('id', run['id']).execute()
                print(f"   ✅ Stopped agent run {run['id'][:8]}...")
        else:
            print("✅ No stuck agent runs found")
    except Exception as e:
        print(f"❌ Error checking agent runs: {e}")
    
    print()
    
    # Step 2: Get test thread
    print("📋 Step 2: Getting test thread...")
    try:
        # Get most recent thread
        result = client.table('threads').select('*').order('created_at', desc=True).limit(1).execute()
        
        if result.data:
            thread_id = result.data[0]['id']
            print(f"✅ Using thread: {thread_id[:8]}...")
        else:
            print("❌ No threads found. Please create a thread in the UI first.")
            return
    except Exception as e:
        print(f"❌ Error getting thread: {e}")
        return
    
    print()
    
    # Step 3: Send test message
    print("📋 Step 3: Sending test message...")
    test_message = "Use web_search tool to find information about PancakeSwap"
    
    try:
        from core.run import run_agent
        from core.agentpress.response_processor import ProcessorConfig
        import uuid
        
        # Create agent run
        agent_run_id = str(uuid.uuid4())
        
        # Insert agent run
        client.table('agent_runs').insert({
            'id': agent_run_id,
            'thread_id': thread_id,
            'agent_id': '0176cb7d-e0e8-7e0f-8000-c3290ab6296c',  # Default agent
            'status': 'running',
            'created_at': datetime.utcnow().isoformat()
        }).execute()
        
        print(f"✅ Created agent run: {agent_run_id[:8]}...")
        print(f"📝 Message: {test_message}")
        print()
        
        # Create config
        config = ProcessorConfig(
            native_tool_calling=True,
            enable_prompt_caching=True
        )
        
        # Run agent
        print("🚀 Running agent...")
        print("⏳ This may take 10-30 seconds...")
        print()
        
        result = await run_agent(
            thread_id=thread_id,
            agent_run_id=agent_run_id,
            temporary_message={
                "role": "user",
                "content": test_message
            },
            processor_config=config,
            stream=False
        )
        
        print("=" * 80)
        print("✅ AGENT RUN COMPLETE!")
        print("=" * 80)
        print()
        
        # Analyze result
        print("📊 RESULT ANALYSIS:")
        print()
        
        if isinstance(result, dict):
            # Check for tool calls
            if 'choices' in result and len(result['choices']) > 0:
                choice = result['choices'][0]
                message = choice.get('message', {})
                
                print(f"🔍 Finish Reason: {choice.get('finish_reason', 'unknown')}")
                print(f"🔍 Tool Calls: {message.get('tool_calls', 'None')}")
                print()
                
                content = message.get('content', '')
                if content:
                    print("📝 Response Content:")
                    print("-" * 80)
                    print(content[:500])  # First 500 chars
                    if len(content) > 500:
                        print(f"... ({len(content) - 500} more chars)")
                    print("-" * 80)
                    print()
                    
                    # Check for "can't use" message
                    if "can't" in content.lower() or "không thể" in content.lower():
                        print("❌ LLM says it can't use tools!")
                        print("   This means tool was NOT in the available tools list")
                    elif "pancakeswap" in content.lower():
                        print("✅ Response mentions PancakeSwap!")
                        if "http" in content or "source" in content.lower():
                            print("✅ Looks like web search results!")
                        else:
                            print("⚠️  No sources/links - might be from training data")
            
            # Check usage
            if 'usage' in result:
                usage = result['usage']
                print(f"📊 Token Usage:")
                print(f"   - Prompt: {usage.get('prompt_tokens', 0)}")
                print(f"   - Completion: {usage.get('completion_tokens', 0)}")
                print(f"   - Total: {usage.get('total_tokens', 0)}")
        else:
            print(f"⚠️  Unexpected result type: {type(result)}")
            print(f"Result: {result}")
        
    except Exception as e:
        print(f"❌ Error running agent: {e}")
        import traceback
        traceback.print_exc()
    
    print()
    print("=" * 80)
    print("🏁 TEST COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(main())

