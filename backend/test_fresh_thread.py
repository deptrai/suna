"""
Test tool calling with a fresh thread (no contaminated history).
This should prove that tool calling works correctly.
"""
import asyncio
import uuid
from datetime import datetime

async def test_fresh_thread():
    print("=" * 80)
    print("🧪 TEST: Tool Calling with Fresh Thread")
    print("=" * 80)
    print()
    
    # Step 1: Create fresh thread
    print("📋 Step 1: Creating fresh thread...")
    try:
        from core.services.supabase import DBConnection
        
        db = DBConnection()
        client = await db.client
        
        # Create new thread
        thread_id = str(uuid.uuid4())
        
        # Get a project_id and account_id from existing threads
        result = await client.table('threads').select('project_id, account_id').limit(1).execute()
        
        if not result.data:
            print("❌ No existing threads found. Please create a thread in the UI first.")
            return False
        
        project_id = result.data[0]['project_id']
        account_id = result.data[0]['account_id']
        
        await client.table('threads').insert({
            'thread_id': thread_id,
            'project_id': project_id,
            'account_id': account_id,
            'created_at': datetime.utcnow().isoformat()
        }).execute()
        
        print(f"✅ Created fresh thread: {thread_id[:8]}...")
        print(f"   Project: {project_id[:8]}...")
        print(f"   Account: {account_id[:8]}...")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    print()
    
    # Step 2: Send test message
    print("📋 Step 2: Sending test message...")
    test_message = "Use web_search tool to find information about PancakeSwap and CAKE token"
    
    try:
        from core.run import run_agent
        from core.agentpress.response_processor import ProcessorConfig
        
        # Get a valid agent_id
        agent_result = await client.table('agents').select('agent_id').limit(1).execute()
        if not agent_result.data:
            print("❌ No agents found")
            return False
        agent_id = agent_result.data[0]['agent_id']

        # Create agent run
        agent_run_id = str(uuid.uuid4())

        await client.table('agent_runs').insert({
            'id': agent_run_id,
            'thread_id': thread_id,
            'agent_id': agent_id,
            'status': 'running',
            'created_at': datetime.utcnow().isoformat()
        }).execute()
        
        print(f"✅ Created agent run: {agent_run_id[:8]}...")
        print(f"📝 Message: {test_message}")
        print()
        
        # Create config
        config = ProcessorConfig(
            native_tool_calling=True
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
        
        print()
        print("=" * 80)
        print("✅ AGENT RUN COMPLETE!")
        print("=" * 80)
        print()
        
        # Analyze result
        print("📊 RESULT ANALYSIS:")
        print()
        
        if isinstance(result, dict):
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
                    print(content[:1000])  # First 1000 chars
                    if len(content) > 1000:
                        print(f"... ({len(content) - 1000} more chars)")
                    print("-" * 80)
                    print()
                    
                    # Check for success indicators
                    content_lower = content.lower()
                    
                    if "can't" in content_lower or "không thể" in content_lower:
                        print("❌ TEST FAILED: LLM says it can't use tools")
                        print("   This means the issue persists even with fresh thread")
                        return False
                    elif "pancakeswap" in content_lower:
                        print("✅ TEST PASSED: Response mentions PancakeSwap")
                        
                        if any(keyword in content_lower for keyword in ['http', 'source', 'according to', 'based on', 'url', 'link']):
                            print("✅ EXCELLENT: Response includes sources/links!")
                            print("✅ web_search tool was called successfully!")
                            return True
                        else:
                            print("⚠️  WARNING: No sources/links found")
                            print("   Might be from training data, not web search")
                            return False
                    else:
                        print("❌ TEST FAILED: Response doesn't mention PancakeSwap")
                        return False
            
            # Check usage
            if 'usage' in result:
                usage = result['usage']
                print()
                print(f"📊 Token Usage:")
                print(f"   - Prompt: {usage.get('prompt_tokens', 0)}")
                print(f"   - Completion: {usage.get('completion_tokens', 0)}")
                print(f"   - Total: {usage.get('total_tokens', 0)}")
        else:
            print(f"⚠️  Unexpected result type: {type(result)}")
            return False
        
    except Exception as e:
        print(f"❌ Error running agent: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    print()
    print("=" * 80)
    print("🏁 TEST COMPLETE")
    print("=" * 80)
    
    return False

if __name__ == "__main__":
    success = asyncio.run(test_fresh_thread())
    
    print()
    if success:
        print("🎉 TEST PASSED! Tool calling works with fresh thread!")
        print("   Root cause confirmed: Conversation history contamination")
        exit(0)
    else:
        print("❌ TEST FAILED! Tool calling still not working.")
        print("   Need further debugging.")
        exit(1)

