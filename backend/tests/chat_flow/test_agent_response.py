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
        
        # Step 2: Get existing thread
        print(f"\n🧵 STEP 2: GET THREAD")
        print("-" * 40)
        
        backend_url = "http://localhost:8000"
        threads_endpoint = f"{backend_url}/api/threads"
        
        backend_headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json"
        }
        
        threads_response = requests.get(
            threads_endpoint,
            headers=backend_headers,
            timeout=30
        )
        
        if threads_response.status_code != 200:
            print(f"❌ Failed to get threads: {threads_response.text}")
            return {"success": False, "error": "Failed to get threads"}
        
        threads_data = threads_response.json()
        threads = threads_data.get("threads", [])
        
        if not threads:
            print("❌ No threads available")
            return {"success": False, "error": "No threads available"}
        
        thread_id = threads[0]["thread_id"]
        print(f"✅ Using thread: {thread_id}")
        
        # Step 3: Send message
        print(f"\n💬 STEP 3: SEND MESSAGE")
        print("-" * 40)
        
        chat_message = "Hello! Please respond with a simple greeting and tell me what you can help with."
        message_endpoint = f"{backend_url}/api/threads/{thread_id}/messages/add"
        
        params = {
            "message": chat_message
        }
        
        print(f"💬 Message: {chat_message}")
        
        message_response = requests.post(
            message_endpoint,
            headers=backend_headers,
            params=params,
            timeout=30
        )
        
        if message_response.status_code != 200:
            print(f"❌ Failed to send message: {message_response.text}")
            return {"success": False, "error": "Failed to send message"}
        
        message_result = message_response.json()
        message_id = message_result.get("message_id")
        
        print(f"✅ Message sent: {message_id}")
        
        # Step 4: Start agent to generate response
        print(f"\n🤖 STEP 4: START AGENT (GENERATE RESPONSE)")
        print("-" * 40)
        
        agent_start_endpoint = f"{backend_url}/api/thread/{thread_id}/agent/start"
        
        # Agent start payload
        agent_payload = {
            "model": "auto",  # Use auto model selection
            "stream": False   # Non-streaming for easier testing
        }
        
        backend_headers["Content-Type"] = "application/json"
        
        print(f"🔗 Agent Endpoint: {agent_start_endpoint}")
        print(f"📦 Agent Payload: {agent_payload}")
        
        agent_response = requests.post(
            agent_start_endpoint,
            headers=backend_headers,
            json=agent_payload,
            timeout=60  # Longer timeout for LLM response
        )
        
        print(f"📊 Agent Start Status: {agent_response.status_code}")
        
        if agent_response.status_code == 200:
            agent_result = agent_response.json()
            agent_run_id = agent_result.get("agent_run_id")
            
            print(f"✅ Agent started: {agent_run_id}")
            
            # Step 5: Wait and check for response
            print(f"\n⏳ STEP 5: WAIT FOR RESPONSE")
            print("-" * 40)
            
            print("🔄 Waiting for agent to generate response...")
            
            # Wait longer for processing (agent might take time)
            print("⏳ Waiting 15 seconds for agent to process...")
            time.sleep(15)
            
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
                        "user_message_id": message_id,
                        "response_message_id": latest_response.get('message_id'),
                        "response_content": response_content,
                        "agent_run_id": agent_run_id,
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
                        "agent_run_id": agent_run_id
                    }
            else:
                print(f"❌ Failed to get messages: {messages_response.text}")
                return {"success": False, "error": "Failed to get messages after agent start"}
                
        else:
            print(f"❌ Failed to start agent: {agent_response.text}")
            return {
                "success": False,
                "error": f"Agent start failed: {agent_response.text}",
                "message_sent": True,
                "response_generated": False
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
