"""
E2E test for smart tool selection using Playwright.
Tests that web_search tool is prioritized when query contains search keywords.
"""
import asyncio
import time
import re
from datetime import datetime

async def test_smart_tool_selection():
    print("=" * 80)
    print("🧪 E2E TEST: Smart Tool Selection")
    print("=" * 80)
    print()
    
    # Step 1: Clean up stuck agent runs
    print("📋 Step 1: Cleaning up stuck agent runs...")
    try:
        from core.services.supabase import DBConnection
        
        db = DBConnection()
        client = await db.client
        
        result = await client.table('agent_runs').select('*').eq('status', 'running').execute()
        
        if result.data:
            print(f"⚠️  Found {len(result.data)} running agent runs, stopping them...")
            for run in result.data:
                await client.table('agent_runs').update({'status': 'error'}).eq('id', run['id']).execute()
            print(f"✅ Stopped {len(result.data)} agent runs")
        else:
            print("✅ No stuck agent runs")
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    
    print()
    
    # Step 2: Get or create test thread
    print("📋 Step 2: Getting test thread...")
    try:
        # Get most recent thread
        result = await client.table('threads').select('thread_id, created_at').order('created_at', desc=True).limit(1).execute()

        if result.data and len(result.data) > 0:
            thread_id = result.data[0]['thread_id']
            print(f"✅ Using thread: {thread_id[:8]}...")
        else:
            print("❌ No threads found")
            return False
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    print()
    
    # Step 3: Monitor logs in background
    print("📋 Step 3: Starting log monitor...")
    import subprocess
    import threading
    
    log_output = []
    log_process = None
    
    def monitor_logs():
        nonlocal log_process
        try:
            log_process = subprocess.Popen(
                ['tail', '-f', '../logs/worker.log'],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1
            )
            
            for line in log_process.stdout:
                log_output.append(line.strip())
                if any(keyword in line for keyword in ['🎯 Priority', '🔧 Tools enabled', 'finish_reason', 'web_search']):
                    print(f"   📝 {line.strip()}")
        except Exception as e:
            print(f"   ⚠️  Log monitor error: {e}")
    
    log_thread = threading.Thread(target=monitor_logs, daemon=True)
    log_thread.start()
    
    print("✅ Log monitor started")
    print()
    
    # Step 4: Send test message
    print("📋 Step 4: Sending test message...")
    test_message = "Use web_search tool to find information about PancakeSwap and CAKE token"
    
    try:
        from core.run import run_agent
        from core.agentpress.response_processor import ProcessorConfig
        import uuid
        
        # Create agent run
        agent_run_id = str(uuid.uuid4())
        
        await client.table('agent_runs').insert({
            'id': agent_run_id,
            'thread_id': thread_id,
            'agent_id': '0176cb7d-e0e8-7e0f-8000-c3290ab6296c',
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
        
        start_time = time.time()
        
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
        
        elapsed_time = time.time() - start_time
        
        print()
        print("=" * 80)
        print(f"✅ AGENT RUN COMPLETE! (took {elapsed_time:.1f}s)")
        print("=" * 80)
        print()
        
        # Step 5: Analyze logs
        print("📊 STEP 5: Analyzing logs...")
        print()
        
        # Wait a bit for logs to flush
        time.sleep(2)
        
        # Stop log monitor
        if log_process:
            log_process.terminate()
        
        # Check for priority tool selection
        priority_logs = [line for line in log_output if '🎯 Priority tool added: web_search' in line]
        tools_enabled_logs = [line for line in log_output if '🔧 Tools enabled' in line]
        finish_reason_logs = [line for line in log_output if 'finish_reason' in line]
        
        print("🔍 Log Analysis:")
        print()
        
        # Check 1: Priority tool selection
        if priority_logs:
            print("✅ CHECK 1: web_search was prioritized")
            print(f"   {priority_logs[-1]}")
        else:
            print("❌ CHECK 1: web_search was NOT prioritized")
            print("   (No '🎯 Priority tool added: web_search' found in logs)")
        
        print()
        
        # Check 2: Tools enabled
        if tools_enabled_logs:
            last_tools_log = tools_enabled_logs[-1]
            print("✅ CHECK 2: Tools were enabled")
            print(f"   {last_tools_log}")
            
            # Extract tool names
            if 'web_search' in last_tools_log:
                print("   ✅ web_search is in the enabled tools!")
            else:
                print("   ❌ web_search is NOT in the enabled tools!")
        else:
            print("❌ CHECK 2: No tools enabled log found")
        
        print()
        
        # Check 3: Tool calling
        if finish_reason_logs:
            last_finish_log = finish_reason_logs[-1]
            print("✅ CHECK 3: Finish reason detected")
            print(f"   {last_finish_log}")
            
            if 'tool_calls' in last_finish_log:
                print("   ✅ LLM decided to call tools!")
            else:
                print("   ⚠️  LLM did not call tools")
        else:
            print("❌ CHECK 3: No finish reason log found")
        
        print()
        
        # Step 6: Analyze response
        print("📊 STEP 6: Analyzing response...")
        print()
        
        if isinstance(result, dict):
            if 'choices' in result and len(result['choices']) > 0:
                choice = result['choices'][0]
                message = choice.get('message', {})
                content = message.get('content', '')
                
                print(f"🔍 Finish Reason: {choice.get('finish_reason', 'unknown')}")
                print(f"🔍 Tool Calls: {message.get('tool_calls', 'None')}")
                print()
                
                if content:
                    print("📝 Response Content (first 500 chars):")
                    print("-" * 80)
                    print(content[:500])
                    if len(content) > 500:
                        print(f"... ({len(content) - 500} more chars)")
                    print("-" * 80)
                    print()
                    
                    # Check 4: Response quality
                    content_lower = content.lower()
                    
                    if "can't" in content_lower or "không thể" in content_lower:
                        print("❌ CHECK 4: LLM says it can't use tools")
                        print("   This means tool was NOT available or execution failed")
                        return False
                    elif "pancakeswap" in content_lower:
                        print("✅ CHECK 4: Response mentions PancakeSwap")
                        
                        if any(keyword in content_lower for keyword in ['http', 'source', 'according to', 'based on']):
                            print("   ✅ Response includes sources/links!")
                            print("   ✅ web_search tool was called successfully!")
                            return True
                        else:
                            print("   ⚠️  No sources/links found")
                            print("   ⚠️  Might be from training data, not web search")
                            return False
                    else:
                        print("❌ CHECK 4: Response doesn't mention PancakeSwap")
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
    success = asyncio.run(test_smart_tool_selection())
    
    print()
    if success:
        print("🎉 TEST PASSED! Smart tool selection is working!")
        exit(0)
    else:
        print("❌ TEST FAILED! Smart tool selection needs debugging.")
        exit(1)

