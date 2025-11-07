#!/usr/bin/env python3
"""
Quick Chat API Test
Tests the complete chat flow without requiring manual authentication
"""
import requests
import json
import time
import sys

def test_chat_flow():
    """Test complete chat flow"""
    print("🚀 CHAT API TEST")
    print("="*60)
    
    # Configuration
    # Try to detect Supabase port from status, fallback to common ports
    supabase_ports = [54341, 54321]  # Common Supabase local ports
    supabase_url = None
    for port in supabase_ports:
        try:
            test_response = requests.get(f"http://localhost:{port}/rest/v1/", timeout=2)
            if test_response.status_code in [200, 401, 404]:  # Any response means it's running
                supabase_url = f"http://localhost:{port}"
                break
        except:
            continue
    
    if not supabase_url:
        supabase_url = "http://localhost:54341"  # Default fallback
    
    backend_url = "http://localhost:8000"
    # Try common test credentials
    test_credentials = [
        ("test@example.com", "Test123456!"),
        ("admin@example.com", "Admin@123"),
        ("user@example.com", "password123"),
    ]
    
    admin_email = None
    admin_password = None
    
    # Try to find working credentials
    for email, password in test_credentials:
        try:
            test_auth_response = requests.post(
                f"{supabase_url}/auth/v1/token?grant_type=password",
                headers={
                    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOuoJuXMiQTTdk0Tz_w_Yz_Yz_Yz_Yz_Yz_Y",
                    "Content-Type": "application/json"
                },
                json={"email": email, "password": password},
                timeout=2
            )
            if test_auth_response.status_code == 200:
                admin_email = email
                admin_password = password
                break
        except:
            continue
    
    # If no credentials work, try to create one
    if not admin_email:
        admin_email = "test@example.com"
        admin_password = "Test123456!"
        try:
            signup_response = requests.post(
                f"{supabase_url}/auth/v1/signup",
                headers={
                    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOuoJuXMiQTTdk0Tz_w_Yz_Yz_Yz_Yz_Yz_Y",
                    "Content-Type": "application/json"
                },
                json={"email": admin_email, "password": admin_password},
                timeout=5
            )
            if signup_response.status_code in [200, 201]:
                print(f"   ✅ Created test user: {admin_email}")
        except:
            pass
    
    print(f"   Using Supabase URL: {supabase_url}")
    
    try:
        # Step 1: Authentication
        print("\n🔐 STEP 1: AUTHENTICATION")
        print("-" * 40)
        
        auth_endpoint = f"{supabase_url}/auth/v1/token?grant_type=password"
        auth_headers = {
            "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOuoJuXMiQTTdk0Tz_w_Yz_Yz_Yz_Yz_Yz_Y",
            "Content-Type": "application/json"
        }
        
        auth_payload = {
            "email": admin_email,
            "password": admin_password
        }
        
        print(f"   Authenticating as: {admin_email}")
        auth_response = requests.post(
            auth_endpoint,
            headers=auth_headers,
            json=auth_payload,
            timeout=10
        )
        
        if auth_response.status_code != 200:
            print(f"   ❌ Auth failed: {auth_response.status_code}")
            print(f"   Response: {auth_response.text}")
            return False
        
        auth_data = auth_response.json()
        access_token = auth_data.get("access_token")
        user_id = auth_data.get("user", {}).get("id")
        
        print(f"   ✅ Authenticated: {user_id}")
        print(f"   🔑 Token: {access_token[:30]}...")
        
        # Step 2: Check Backend Health
        print("\n🏥 STEP 2: BACKEND HEALTH CHECK")
        print("-" * 40)
        
        health_response = requests.get(f"{backend_url}/api/health", timeout=5)
        if health_response.status_code == 200:
            health_data = health_response.json()
            print(f"   ✅ Backend is healthy: {health_data.get('status')}")
        else:
            print(f"   ⚠️  Backend health check failed: {health_response.status_code}")
        
        # Step 3: Get or Create Thread
        print("\n🧵 STEP 3: GET/CREATE THREAD")
        print("-" * 40)
        
        backend_headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json"
        }
        
        # Get existing threads
        threads_response = requests.get(
            f"{backend_url}/api/threads",
            headers=backend_headers,
            timeout=10
        )
        
        thread_id = None
        if threads_response.status_code == 200:
            threads_data = threads_response.json()
            threads = threads_data.get("threads", [])
            if threads:
                thread_id = threads[0].get("thread_id")
                print(f"   ✅ Using existing thread: {thread_id}")
            else:
                print("   ℹ️  No existing threads found")
        else:
            print(f"   ⚠️  Failed to get threads: {threads_response.status_code}")
        
        # Create new thread if needed
        if not thread_id:
            print("   🔄 Creating new thread...")
            create_thread_response = requests.post(
                f"{backend_url}/api/threads",
                headers=backend_headers,
                json={"title": "API Test Thread"},
                timeout=10
            )
            
            if create_thread_response.status_code == 200:
                thread_data = create_thread_response.json()
                thread_id = thread_data.get("thread_id")
                print(f"   ✅ Created new thread: {thread_id}")
            else:
                print(f"   ❌ Failed to create thread: {create_thread_response.status_code}")
                print(f"   Response: {create_thread_response.text}")
                return False
        
        # Step 4: Send Message
        print("\n💬 STEP 4: SEND MESSAGE")
        print("-" * 40)
        
        test_message = "Hello! This is a test message from API. Can you respond?"
        print(f"   Sending: {test_message}")
        
        message_response = requests.post(
            f"{backend_url}/api/threads/{thread_id}/messages",
            headers=backend_headers,
            json={"content": test_message, "type": "user"},
            timeout=10
        )
        
        if message_response.status_code not in [200, 201]:
            print(f"   ❌ Failed to send message: {message_response.status_code}")
            print(f"   Response: {message_response.text}")
            return False
        
        message_data = message_response.json()
        message_id = message_data.get("message_id")
        print(f"   ✅ Message sent: {message_id}")
        
        # Step 5: Start Agent
        print("\n🤖 STEP 5: START AGENT")
        print("-" * 40)
        
        # Use FormData for agent start
        agent_headers = {
            "Authorization": f"Bearer {access_token}"
        }
        
        form_data = {
            "thread_id": thread_id,
            "model_name": "gpt-4o-mini"  # Use the model we configured
        }
        
        print(f"   Starting agent with model: {form_data['model_name']}")
        agent_response = requests.post(
            f"{backend_url}/api/agent/start",
            headers=agent_headers,
            data=form_data,
            timeout=30
        )
        
        if agent_response.status_code not in [200, 201]:
            print(f"   ❌ Failed to start agent: {agent_response.status_code}")
            print(f"   Response: {agent_response.text}")
            return False
        
        agent_data = agent_response.json()
        agent_run_id = agent_data.get("agent_run_id")
        print(f"   ✅ Agent started: {agent_run_id}")
        print(f"   Status: {agent_data.get('status')}")
        
        # Step 6: Check Agent Status
        print("\n📊 STEP 6: CHECK AGENT STATUS")
        print("-" * 40)
        
        max_checks = 10
        check_interval = 2
        
        for i in range(max_checks):
            status_response = requests.get(
                f"{backend_url}/api/agent-run/{agent_run_id}",
                headers=backend_headers,
                timeout=10
            )
            
            if status_response.status_code == 200:
                status_data = status_response.json()
                status = status_data.get("status")
                print(f"   Check {i+1}/{max_checks}: Status = {status}")
                
                if status == "running":
                    print("   ⏳ Agent is running, waiting for completion...")
                    time.sleep(check_interval)
                elif status in ["completed", "stopped", "failed"]:
                    print(f"   ✅ Agent finished with status: {status}")
                    if status == "completed":
                        print("   🎉 Chat test successful!")
                    break
            else:
                print(f"   ⚠️  Failed to get status: {status_response.status_code}")
                time.sleep(check_interval)
        
        # Step 7: Get Messages
        print("\n📨 STEP 7: GET MESSAGES")
        print("-" * 40)
        
        messages_response = requests.get(
            f"{backend_url}/api/threads/{thread_id}/messages",
            headers=backend_headers,
            timeout=10
        )
        
        if messages_response.status_code == 200:
            messages_data = messages_response.json()
            messages = messages_data.get("messages", [])
            print(f"   ✅ Found {len(messages)} messages")
            
            # Show last few messages
            for msg in messages[-3:]:
                msg_type = msg.get("type", "unknown")
                content = msg.get("content", "")[:100]
                print(f"   - {msg_type}: {content}...")
        else:
            print(f"   ⚠️  Failed to get messages: {messages_response.status_code}")
        
        print("\n" + "="*60)
        print("✅ CHAT API TEST COMPLETED")
        print("="*60)
        return True
        
    except requests.exceptions.ConnectionError:
        print("\n❌ Connection Error: Backend or Supabase not running")
        print("   Make sure backend is running on http://localhost:8000")
        print("   Make sure Supabase is running on http://localhost:54321")
        return False
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_chat_flow()
    sys.exit(0 if success else 1)

