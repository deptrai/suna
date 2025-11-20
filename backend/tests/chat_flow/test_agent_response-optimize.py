#!/usr/bin/env python3
"""
CHAT RESPONSE TEST

Tests if chat can actually respond (not just receive messages):
1. Send message to thread
2. Start agent to generate response
3. Check if response was generated
4. Verify complete chat flow with LLM response

This answers: "chat chưa response mà"
"""
import requests
import json
import time
import uuid


def test_chat_response():
    """Test if chat can generate responses"""
    print("💬 CHAT RESPONSE TEST")
    print("="*60)
    
    try:
        # Step 1: Authentication
        print("🔐 STEP 1: AUTHENTICATION")
        print("-" * 40)
        
        admin_email = "admin@example.com"
        admin_password = "Admin@123"
        
        supabase_url = "http://localhost:54321"
        auth_endpoint = f"{supabase_url}/auth/v1/token?grant_type=password"
        
        auth_headers = {
            "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOuoJuXMiQTTdk0Tz_w_Yz_Yz_Yz_Yz_Yz_Y",
            "Content-Type": "application/json"
        }
        
        auth_payload = {
            "email": admin_email,
            "password": admin_password
        }
        
        auth_response = requests.post(
            auth_endpoint,
            headers=auth_headers,
            json=auth_payload,
            timeout=10
        )
        
        if auth_response.status_code != 200:
            print(f"❌ Auth failed: {auth_response.text}")
            return {"success": False, "error": "Authentication failed"}
        
        auth_data = auth_response.json()
        access_token = auth_data.get("access_token")
        user_id = auth_data.get("user", {}).get("id")
        
        print(f"✅ Authenticated: {user_id}")
        
        # Step 2: Create account and agent using RPC function
        print(f"\n📦 STEP 2: CREATE ACCOUNT AND AGENT")
        print("-" * 40)
        
        backend_url = "http://localhost:8000"
        backend_headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
        }
        
        # Use Supabase RPC to create account
        supabase_url = "http://localhost:54321"
        create_account_rpc = f"{supabase_url}/rest/v1/rpc/create_account_for_user"
        
        try:
            account_response = requests.post(
                create_account_rpc,
                headers=backend_headers,
                json={
                    "user_id": user_id,
                    "account_name": "Test User",
                    "account_slug": None
                },
                timeout=30
            )
            
            if account_response.status_code in [200, 201]:
                account_data = account_response.json()
                account_id = account_data.get('id') if isinstance(account_data, dict) else account_data[0].get('id') if isinstance(account_data, list) else user_id
                print(f"✅ Account created/verified: {account_id}")
            else:
                print(f"⚠️  Account creation returned {account_response.status_code}: {account_response.text}")
                account_id = user_id  # Fallback to user_id
        except Exception as e:
            print(f"⚠️  Account creation failed: {e}")
            account_id = user_id  # Fallback to user_id
        
        # Step 3: Start agent with prompt (backend will auto-create agent if needed)
        print(f"\n🚀 STEP 3: START AGENT WITH OPTIMIZATION MODE")
        print("-" * 40)
        
        agent_start_endpoint = f"{backend_url}/api/agent/start"
        
        chat_message = "Hello! Please respond with a simple greeting and tell me what you can help with."
        
        # Use FormData for agent start (supports optimization_mode)
        # When prompt is provided without thread_id, it creates a new thread
        # IMPORTANT: Don't set Content-Type header - let requests set it automatically for FormData
        form_data = {
            "prompt": chat_message,
            "model_name": "openai-compatible/gpt-4o-mini",  # Use specific model instead of "auto"
            "optimization_mode": "optimized"  # Use optimized mode
        }
        
        print(f"🔗 Agent Endpoint: {agent_start_endpoint}")
        print(f"💬 Message: {chat_message}")
        print(f"📦 Agent FormData: {form_data}")
        print(f"🚀 Optimization Mode: optimized")
        
        # Remove Content-Type from headers to let requests set it automatically for FormData
        agent_headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json"
        }
        
        agent_response = requests.post(
            agent_start_endpoint,
            headers=agent_headers,
            data=form_data,  # Use data= for FormData (requests will set Content-Type automatically)
            timeout=60  # Longer timeout for LLM response
        )
        
        print(f"📊 Agent Start Status: {agent_response.status_code}")
        
        if agent_response.status_code == 200:
            agent_result = agent_response.json()
            thread_id = agent_result.get("thread_id")
            agent_run_id = agent_result.get("agent_run_id")
            
            print(f"✅ Agent started: {agent_run_id}")
            print(f"✅ Thread created: {thread_id}")
            
            # Step 4: Wait and check for response
            print(f"\n⏳ STEP 4: WAIT FOR RESPONSE")
            print("-" * 40)
            
            print("🔄 Waiting for agent to generate response...")
            
            # Wait longer for processing (agent might take time)
            print("⏳ Waiting 20 seconds for agent to process...")
            time.sleep(20)
            
            # Check messages again to see if response was added
            get_messages_endpoint = f"{backend_url}/api/threads/{thread_id}/messages"
            
            messages_response = requests.get(
                get_messages_endpoint,
                headers=backend_headers,
                timeout=30
            )
            
            if messages_response.status_code == 200:
                messages_data = messages_response.json()
                messages = messages_data.get("messages", [])
                
                print(f"📊 Total messages now: {len(messages)}")
                
                # Look for assistant response
                assistant_messages = [msg for msg in messages if msg.get('content', {}).get('role') == 'assistant']
                
                if assistant_messages:
                    latest_response = assistant_messages[0]  # Most recent
                    response_content = latest_response.get('content', {}).get('content', '')
                    
                    print(f"✅ Chat response generated!")
                    print(f"🤖 Response: {response_content[:100]}...")
                    print(f"📝 Response ID: {latest_response.get('message_id')}")
                    
                    return {
                        "success": True,
                        "chat_responds": True,
                        "message_sent": True,
                        "response_generated": True,
                        "thread_id": thread_id,
                        "response_message_id": latest_response.get('message_id'),
                        "response_content": response_content,
                        "agent_run_id": agent_run_id,
                        "optimization_mode": "optimized",
                        "total_messages": len(messages)
                    }
                else:
                    print("⚠️  No assistant response found yet")
                    print("💡 Agent might still be processing or failed")
                    
                    return {
                        "success": False,
                        "chat_responds": False,
                        "message_sent": True,
                        "response_generated": False,
                        "error": "No response generated",
                        "agent_run_id": agent_run_id,
                        "thread_id": thread_id,
                        "optimization_mode": "optimized"
                    }
            else:
                print(f"❌ Failed to get messages: {messages_response.text}")
                return {"success": False, "error": "Failed to get messages after agent start", "thread_id": thread_id}
                
        else:
            print(f"❌ Failed to start agent: {agent_response.status_code}")
            print(f"❌ Response: {agent_response.text}")
            return {
                "success": False,
                "error": f"Agent start failed: {agent_response.text}",
                "message_sent": False,
                "response_generated": False,
                "optimization_mode": "optimized"
            }
            
    except requests.exceptions.ConnectionError as e:
        if "54321" in str(e):
            return {"success": False, "error": "Supabase not running", "need_supabase": True}
        elif "8000" in str(e):
            return {"success": False, "error": "Backend not running", "need_backend": True}
        else:
            return {"success": False, "error": str(e)}
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return {"success": False, "error": str(e)}


def main():
    """Run chat response test"""
    print("🚀 CHAT RESPONSE TEST")
    print("💬 Testing if chat can actually respond to messages")
    print()
    
    result = test_chat_response()
    
    print("\n" + "="*60)
    print("📊 CHAT RESPONSE TEST SUMMARY")
    print("="*60)
    
    if result.get("success", False):
        print("🎉 SUCCESS: Chat CAN respond!")
        print()
        print("✅ VERIFIED:")
        print(f"   💬 Message sent: {'✅' if result.get('message_sent') else '❌'}")
        print(f"   🤖 Response generated: {'✅' if result.get('response_generated') else '❌'}")
        print(f"   🔄 Complete chat flow: {'✅' if result.get('chat_responds') else '❌'}")
        print()
        print("📊 DETAILS:")
        print(f"   🧵 Thread ID: {result.get('thread_id', 'N/A')}")
        print(f"   📝 User Message ID: {result.get('user_message_id', 'N/A')}")
        print(f"   🤖 Response Message ID: {result.get('response_message_id', 'N/A')}")
        print(f"   🏃 Agent Run ID: {result.get('agent_run_id', 'N/A')}")
        print(f"   📊 Total Messages: {result.get('total_messages', 0)}")
        print()
        print("🎯 ANSWER:")
        print("❓ 'chat chưa response mà'")
        print("✅ Chat ĐÃ CÓ response! LLM đã generate response thành công!")
        print(f"🤖 Response: {result.get('response_content', 'N/A')[:100]}...")
        
    else:
        print("❌ FAILED: Chat response issues")
        error = result.get("error", "Unknown error")
        print(f"   Error: {error}")
        
        if result.get("need_supabase"):
            print("\n💡 Start Supabase: supabase start")
        elif result.get("need_backend"):
            print("\n💡 Start Backend: uvicorn api:app --reload")
        
        print("\n🎯 ANSWER:")
        print("❓ 'chat chưa response mà'")
        if result.get("message_sent") and not result.get("response_generated"):
            print("⚠️  Chat nhận message nhưng chưa generate response")
            print("💡 Có thể do: No LLM API key, agent failed, hoặc processing time")
        else:
            print("⚠️  Chat system chưa hoạt động hoàn chỉnh")
    
    return result


if __name__ == "__main__":
    main()
