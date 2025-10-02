#!/usr/bin/env python3
"""
COMPREHENSIVE CHAT RESPONSE DEBUG

Debug plan để fix "chat chưa response mà" issue:
1. Check Dramatiq worker status
2. Check Redis connection
3. Test run_agent() function directly
4. Debug agent background pipeline
5. Fix issues step by step
"""
import asyncio
import os
import json
import time
import requests
from dotenv import load_dotenv
from datetime import datetime

# Load environment
load_dotenv()


async def debug_chat_response():
    """Comprehensive debug of chat response pipeline"""
    print("🔧 COMPREHENSIVE CHAT RESPONSE DEBUG")
    print("="*80)
    
    results = {}
    
    # Phase 1: Environment & Dependencies
    print("\n🔍 PHASE 1: ENVIRONMENT & DEPENDENCIES")
    print("-" * 50)
    
    try:
        # Check Redis
        print("📊 Checking Redis connection...")
        from core.services import redis
        await redis.initialize_async()
        await redis.set("test_key", "test_value", ex=10)
        test_value = await redis.get("test_key")
        if test_value:
            print("✅ Redis: Connected and working")
            results["redis"] = "working"
        else:
            print("❌ Redis: Connection issues")
            results["redis"] = "failed"
    except Exception as e:
        print(f"❌ Redis: Error - {e}")
        results["redis"] = f"error: {e}"
    
    try:
        # Check Database
        print("📊 Checking Database connection...")
        from core.services.supabase import DBConnection
        db = DBConnection()
        await db.initialize()
        client = await db.client
        
        # Test query (use correct column name)
        result = await client.table("threads").select("thread_id").limit(1).execute()
        if result.data:
            print("✅ Database: Connected and working")
            results["database"] = "working"
        else:
            print("⚠️  Database: Connected but no data")
            results["database"] = "connected_no_data"
    except Exception as e:
        print(f"❌ Database: Error - {e}")
        results["database"] = f"error: {e}"
    
    try:
        # Check Dramatiq
        print("📊 Checking Dramatiq setup...")
        import dramatiq
        from dramatiq.brokers.redis import RedisBroker
        
        redis_host = os.getenv('REDIS_HOST', 'localhost')
        redis_port = int(os.getenv('REDIS_PORT', 6379))
        redis_broker = RedisBroker(host=redis_host, port=redis_port)
        
        print(f"✅ Dramatiq: Broker configured (Redis: {redis_host}:{redis_port})")
        results["dramatiq"] = "configured"
    except Exception as e:
        print(f"❌ Dramatiq: Error - {e}")
        results["dramatiq"] = f"error: {e}"
    
    # Phase 2: Core Agent Functions
    print("\n🤖 PHASE 2: CORE AGENT FUNCTIONS")
    print("-" * 50)
    
    try:
        # Test run_agent function directly
        print("📊 Testing run_agent() function...")
        from core.run import run_agent
        from core.services.langfuse import langfuse
        
        # Create test trace
        trace = langfuse.trace(name="debug_test", session_id="debug_session")
        
        # Use real test thread created in database
        test_thread_id = "5bf0095c-058a-44d0-b3d5-2e042c62e1f9"
        test_project_id = "8ee6a092-ccf3-4c34-b013-1783c5647449"
        
        print(f"🔄 Calling run_agent(thread_id={test_thread_id}, model=auto)...")
        
        response_count = 0
        async for response in run_agent(
            thread_id=test_thread_id,
            project_id=test_project_id,
            stream=True,
            model_name="auto",
            enable_thinking=False,
            enable_context_manager=True,
            enable_prompt_caching=True,
            trace=trace
        ):
            response_count += 1
            print(f"📨 Response {response_count}: {response.get('type', 'unknown')} - {str(response)[:100]}...")
            
            if response_count >= 5:  # Limit responses for debug
                break
        
        if response_count > 0:
            print(f"✅ run_agent(): Working - Generated {response_count} responses")
            results["run_agent"] = f"working - {response_count} responses"
        else:
            print("❌ run_agent(): No responses generated")
            results["run_agent"] = "no_responses"
            
    except Exception as e:
        print(f"❌ run_agent(): Error - {e}")
        import traceback
        traceback.print_exc()
        results["run_agent"] = f"error: {e}"
    
    # Phase 3: Background Task System
    print("\n⚙️  PHASE 3: BACKGROUND TASK SYSTEM")
    print("-" * 50)
    
    try:
        # Skip run_agent_background for now (Dramatiq middleware issue)
        print("📊 Skipping run_agent_background() - Dramatiq middleware issue")
        print("💡 This requires proper Dramatiq worker setup")
        results["run_agent_background"] = "skipped - dramatiq middleware issue"

    except Exception as e:
        print(f"❌ run_agent_background(): Error - {e}")
        import traceback
        traceback.print_exc()
        results["run_agent_background"] = f"error: {e}"
    
    # Phase 4: API Integration Test
    print("\n🌐 PHASE 4: API INTEGRATION TEST")
    print("-" * 50)
    
    try:
        # Test complete API flow
        print("📊 Testing complete API flow...")
        
        # Authentication
        auth_url = "http://localhost:8000/api/auth/login"
        auth_data = {
            "email": "admin@example.com",
            "password": "Admin@123"
        }
        
        auth_response = requests.post(auth_url, json=auth_data, timeout=10)
        if auth_response.status_code == 200:
            jwt_token = auth_response.json().get("access_token")
            print("✅ Authentication: Success")
            
            headers = {"Authorization": f"Bearer {jwt_token}"}
            
            # Get threads
            threads_url = "http://localhost:8000/api/threads"
            threads_response = requests.get(threads_url, headers=headers, timeout=10)
            
            if threads_response.status_code == 200:
                threads = threads_response.json()
                if threads:
                    thread_id = threads[0]["id"]
                    print(f"✅ Thread found: {thread_id}")
                    
                    # Send message
                    message_url = f"http://localhost:8000/api/threads/{thread_id}/messages/add"
                    message_params = {"message": "Hello! This is a debug test message."}
                    
                    message_response = requests.post(
                        message_url, 
                        headers=headers, 
                        params=message_params,
                        timeout=10
                    )
                    
                    if message_response.status_code == 200:
                        print("✅ Message sent successfully")
                        
                        # Start agent
                        agent_url = f"http://localhost:8000/api/thread/{thread_id}/agent/start"
                        agent_payload = {"model": "auto", "stream": False}
                        
                        agent_response = requests.post(
                            agent_url,
                            headers=headers,
                            json=agent_payload,
                            timeout=30
                        )
                        
                        if agent_response.status_code == 200:
                            agent_data = agent_response.json()
                            agent_run_id = agent_data.get("agent_run_id")
                            print(f"✅ Agent started: {agent_run_id}")
                            
                            # Wait and check for response
                            print("⏳ Waiting 10 seconds for agent response...")
                            time.sleep(10)
                            
                            # Check messages again
                            messages_url = f"http://localhost:8000/api/threads/{thread_id}/messages"
                            messages_response = requests.get(messages_url, headers=headers, timeout=10)
                            
                            if messages_response.status_code == 200:
                                messages = messages_response.json()
                                assistant_messages = [m for m in messages if m.get("role") == "assistant"]
                                
                                if assistant_messages:
                                    print(f"✅ Agent response found: {len(assistant_messages)} assistant messages")
                                    results["api_flow"] = "working"
                                else:
                                    print("❌ No assistant messages found - Agent didn't respond")
                                    results["api_flow"] = "agent_no_response"
                            else:
                                print(f"❌ Failed to get messages: {messages_response.status_code}")
                                results["api_flow"] = "messages_error"
                        else:
                            print(f"❌ Failed to start agent: {agent_response.status_code}")
                            results["api_flow"] = "agent_start_error"
                    else:
                        print(f"❌ Failed to send message: {message_response.status_code}")
                        results["api_flow"] = "message_error"
                else:
                    print("❌ No threads found")
                    results["api_flow"] = "no_threads"
            else:
                print(f"❌ Failed to get threads: {threads_response.status_code}")
                results["api_flow"] = "threads_error"
        else:
            print(f"❌ Authentication failed: {auth_response.status_code}")
            results["api_flow"] = "auth_error"
            
    except Exception as e:
        print(f"❌ API Integration: Error - {e}")
        results["api_flow"] = f"error: {e}"
    
    # Final Summary
    print("\n" + "="*80)
    print("📊 DEBUG SUMMARY")
    print("="*80)
    
    for component, status in results.items():
        status_icon = "✅" if "working" in status else "❌"
        print(f"{status_icon} {component.upper()}: {status}")
    
    # Diagnosis
    print("\n🎯 DIAGNOSIS:")
    
    working_components = [k for k, v in results.items() if "working" in v]
    failing_components = [k for k, v in results.items() if "working" not in v]
    
    print(f"✅ Working components: {len(working_components)}/{len(results)}")
    print(f"❌ Failing components: {len(failing_components)}/{len(results)}")
    
    if failing_components:
        print(f"\n🔧 ISSUES TO FIX:")
        for component in failing_components:
            print(f"   - {component}: {results[component]}")
    
    if len(working_components) == len(results):
        print("\n🎉 ALL COMPONENTS WORKING - Chat should respond!")
    elif "api_flow" in failing_components:
        print("\n⚠️  API FLOW ISSUES - Need to debug agent response pipeline")
    else:
        print("\n🔧 INFRASTRUCTURE ISSUES - Need to fix basic components first")
    
    return results


async def main():
    """Run comprehensive debug"""
    print("🚀 CHAT RESPONSE DEBUG PLAN")
    print("🔍 Debugging why 'chat chưa response mà'")
    print()
    
    results = await debug_chat_response()
    
    print(f"\n⏰ Debug completed at {datetime.now()}")
    return results


if __name__ == "__main__":
    asyncio.run(main())
