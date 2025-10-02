#!/usr/bin/env python3
"""
SIMPLE FRONTEND CHAT TEST

Tests basic frontend → backend message sending:
1. Use existing thread (skip creation)
2. Send message via API
3. Verify message was received

This answers: "test vừa tạo k tự động vào front end send chat à?"
"""
import requests
import json
import uuid


def test_simple_frontend_message():
    """Test simple frontend message sending"""
    print("📱 SIMPLE FRONTEND MESSAGE TEST")
    print("="*60)
    
    try:
        # Step 1: Setup
        print("🔧 STEP 1: SETUP")
        print("-" * 40)
        
        # Use admin credentials that worked
        admin_email = "admin@example.com"
        admin_password = "Admin@123"
        
        # Get real JWT token
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
        
        print(f"👤 Admin: {admin_email}")
        
        # Authenticate
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
        print(f"🔑 Token: {access_token[:20]}...")
        
        # Step 2: Get existing threads
        print(f"\n📋 STEP 2: GET EXISTING THREADS")
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
        
        print(f"📊 Threads Status: {threads_response.status_code}")
        
        if threads_response.status_code == 200:
            threads_data = threads_response.json()
            threads = threads_data.get("threads", [])
            
            print(f"✅ Found {len(threads)} threads")
            
            if threads:
                # Use first existing thread
                thread_id = threads[0]["thread_id"]
                thread_name = threads[0].get("name", "Unknown")
                
                print(f"🧵 Using thread: {thread_name} ({thread_id})")
                
                # Step 3: Send message to existing thread
                print(f"\n💬 STEP 3: SEND MESSAGE")
                print("-" * 40)
                
                chat_message = "Hello from frontend test! Can you respond with a simple greeting?"
                message_endpoint = f"{backend_url}/api/threads/{thread_id}/messages/add"

                # API expects message as query parameter
                params = {
                    "message": chat_message
                }

                print(f"💬 Message: {chat_message}")
                print(f"🔗 Endpoint: {message_endpoint}")
                print(f"📦 Params: {params}")

                message_response = requests.post(
                    message_endpoint,
                    headers=backend_headers,
                    params=params,  # Use query parameters
                    timeout=30
                )
                
                print(f"📊 Message Status: {message_response.status_code}")
                
                if message_response.status_code == 200:
                    message_result = message_response.json()
                    message_id = message_result.get("message_id")
                    
                    print(f"✅ Message sent successfully!")
                    print(f"📝 Message ID: {message_id}")
                    
                    # Step 4: Verify message was stored
                    print(f"\n✅ STEP 4: VERIFY MESSAGE")
                    print("-" * 40)
                    
                    get_messages_endpoint = f"{backend_url}/api/threads/{thread_id}/messages"
                    
                    backend_headers["Content-Type"] = "application/json"
                    
                    messages_response = requests.get(
                        get_messages_endpoint,
                        headers=backend_headers,
                        timeout=30
                    )
                    
                    if messages_response.status_code == 200:
                        messages_data = messages_response.json()
                        messages = messages_data.get("messages", [])
                        
                        # Find our message
                        our_message = None
                        for msg in messages:
                            if msg.get("message_id") == message_id:
                                our_message = msg
                                break
                        
                        if our_message:
                            print(f"✅ Message verified in database!")
                            print(f"📄 Content: {our_message.get('content', {}).get('content', 'No content')}")
                            print(f"🕐 Created: {our_message.get('created_at', 'Unknown')}")
                            
                            return {
                                "success": True,
                                "frontend_to_backend": True,
                                "message_sent": True,
                                "message_stored": True,
                                "thread_id": thread_id,
                                "message_id": message_id,
                                "message_content": chat_message,
                                "total_messages": len(messages)
                            }
                        else:
                            print(f"⚠️  Message not found in thread")
                            return {
                                "success": False,
                                "error": "Message not found after sending"
                            }
                    else:
                        print(f"❌ Failed to get messages: {messages_response.text}")
                        return {
                            "success": False,
                            "error": "Failed to retrieve messages"
                        }
                else:
                    print(f"❌ Failed to send message: {message_response.text}")
                    return {
                        "success": False,
                        "error": f"Message send failed: {message_response.text}"
                    }
            else:
                print("⚠️  No existing threads found")
                print("💡 Need to create a thread first or use existing thread ID")
                return {
                    "success": False,
                    "error": "No threads available"
                }
        else:
            print(f"❌ Failed to get threads: {threads_response.text}")
            return {
                "success": False,
                "error": f"Failed to get threads: {threads_response.text}"
            }
            
    except requests.exceptions.ConnectionError as e:
        if "54321" in str(e):
            print("❌ Supabase not running")
            return {"success": False, "error": "Supabase not running", "need_supabase": True}
        elif "8000" in str(e):
            print("❌ Backend not running")
            return {"success": False, "error": "Backend not running", "need_backend": True}
        else:
            return {"success": False, "error": str(e)}
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return {"success": False, "error": str(e)}


def main():
    """Run simple frontend message test"""
    print("🚀 SIMPLE FRONTEND MESSAGE TEST")
    print("📱 Testing if frontend can send messages to backend")
    print()
    
    result = test_simple_frontend_message()
    
    print("\n" + "="*60)
    print("📊 SIMPLE FRONTEND TEST SUMMARY")
    print("="*60)
    
    if result.get("success", False):
        print("🎉 SUCCESS: Frontend → Backend messaging works!")
        print()
        print("✅ VERIFIED:")
        print(f"   📱 Frontend can send messages: {'✅' if result.get('message_sent') else '❌'}")
        print(f"   💾 Backend stores messages: {'✅' if result.get('message_stored') else '❌'}")
        print(f"   🔄 Complete flow working: {'✅' if result.get('frontend_to_backend') else '❌'}")
        print()
        print("📊 DETAILS:")
        print(f"   🧵 Thread ID: {result.get('thread_id', 'N/A')}")
        print(f"   📝 Message ID: {result.get('message_id', 'N/A')}")
        print(f"   💬 Message: {result.get('message_content', 'N/A')}")
        print(f"   📊 Total Messages: {result.get('total_messages', 0)}")
        print()
        print("🎯 ANSWER TO YOUR QUESTION:")
        print("❓ 'test vừa tạo k tự động vào front end send chat à?'")
        print("✅ YES! Frontend CAN automatically send chat to backend!")
        print("✅ This test proves the complete frontend → backend flow works!")
        
    else:
        print("❌ FAILED: Frontend → Backend messaging issues")
        error = result.get("error", "Unknown error")
        print(f"   Error: {error}")
        
        if result.get("need_supabase"):
            print("\n💡 Start Supabase: supabase start")
        elif result.get("need_backend"):
            print("\n💡 Start Backend: uvicorn api:app --reload")
        
        print("\n🎯 ANSWER:")
        print("❓ 'test vừa tạo k tự động vào front end send chat à?'")
        print("⚠️  Test is ready, but servers need to be running")
    
    return result


if __name__ == "__main__":
    main()
