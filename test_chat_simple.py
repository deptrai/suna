#!/usr/bin/env python3
"""
Simple Chat API Test - Tests backend health and basic connectivity
"""
import requests
import json
import time
import uuid

def test_backend_health():
    """Test backend health endpoints"""
    print("🏥 BACKEND HEALTH TEST")
    print("="*60)
    
    backend_url = "http://localhost:8000"
    
    # Test basic health
    try:
        response = requests.get(f"{backend_url}/api/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Backend Health: {data.get('status')}")
            print(f"   Instance ID: {data.get('instance_id')}")
            print(f"   Timestamp: {data.get('timestamp')}")
            return True
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Backend not reachable: {e}")
        return False

def test_supabase_auth():
    """Test Supabase authentication with new user"""
    print("\n🔐 SUPABASE AUTH TEST")
    print("="*60)
    
    supabase_url = "http://localhost:54341"
    apikey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOuoJuXMiQTTdk0Tz_w_Yz_Yz_Yz_Yz_Yz_Y"
    
    # Generate unique email
    unique_id = str(uuid.uuid4())[:8]
    test_email = f"test_{unique_id}@example.com"
    test_password = "Test123456!"
    
    headers = {
        "apikey": apikey,
        "Content-Type": "application/json"
    }
    
    # Try to create new user
    print(f"   Creating user: {test_email}")
    signup_response = requests.post(
        f"{supabase_url}/auth/v1/signup",
        headers=headers,
        json={"email": test_email, "password": test_password},
        timeout=10
    )
    
    if signup_response.status_code in [200, 201]:
        print(f"   ✅ User created successfully")
        signup_data = signup_response.json()
        user_id = signup_data.get("user", {}).get("id")
        access_token = signup_data.get("access_token")
        print(f"   User ID: {user_id}")
        print(f"   Token: {access_token[:30]}...")
        return test_email, test_password, access_token
    else:
        print(f"   ⚠️  Signup response: {signup_response.status_code}")
        print(f"   Response: {signup_response.text}")
        
        # Try login instead
        print(f"   Trying to login...")
        login_response = requests.post(
            f"{supabase_url}/auth/v1/token?grant_type=password",
            headers=headers,
            json={"email": test_email, "password": test_password},
            timeout=10
        )
        
        if login_response.status_code == 200:
            login_data = login_response.json()
            access_token = login_data.get("access_token")
            user_id = login_data.get("user", {}).get("id")
            print(f"   ✅ Login successful")
            print(f"   User ID: {user_id}")
            return test_email, test_password, access_token
        else:
            print(f"   ❌ Login failed: {login_response.status_code}")
            return None, None, None

def test_chat_flow(email, password, token):
    """Test complete chat flow"""
    print("\n💬 CHAT FLOW TEST")
    print("="*60)
    
    backend_url = "http://localhost:8000"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    try:
        # Get threads
        print("   Getting threads...")
        threads_response = requests.get(
            f"{backend_url}/api/threads",
            headers=headers,
            timeout=10
        )
        
        if threads_response.status_code == 200:
            threads_data = threads_response.json()
            threads = threads_data.get("threads", [])
            print(f"   ✅ Found {len(threads)} threads")
            
            if threads:
                thread_id = threads[0].get("thread_id")
                print(f"   Using thread: {thread_id}")
            else:
                # Create new thread
                print("   Creating new thread...")
                create_response = requests.post(
                    f"{backend_url}/api/threads",
                    headers=headers,
                    json={"title": "API Test Thread"},
                    timeout=10
                )
                if create_response.status_code == 200:
                    thread_data = create_response.json()
                    thread_id = thread_data.get("thread_id")
                    print(f"   ✅ Created thread: {thread_id}")
                else:
                    print(f"   ❌ Failed to create thread: {create_response.status_code}")
                    return False
        else:
            print(f"   ❌ Failed to get threads: {threads_response.status_code}")
            return False
        
        # Send message
        print("\n   Sending test message...")
        message_response = requests.post(
            f"{backend_url}/api/threads/{thread_id}/messages",
            headers=headers,
            json={"content": "Hello! This is a test message.", "type": "user"},
            timeout=10
        )
        
        if message_response.status_code in [200, 201]:
            message_data = message_response.json()
            print(f"   ✅ Message sent: {message_data.get('message_id')}")
        else:
            print(f"   ⚠️  Message send response: {message_response.status_code}")
            print(f"   Response: {message_response.text[:200]}")
        
        # Start agent
        print("\n   Starting agent...")
        agent_headers = {"Authorization": f"Bearer {token}"}
        form_data = {
            "thread_id": thread_id,
            "model_name": "gpt-4o-mini"
        }
        
        agent_response = requests.post(
            f"{backend_url}/api/agent/start",
            headers=agent_headers,
            data=form_data,
            timeout=30
        )
        
        if agent_response.status_code in [200, 201]:
            agent_data = agent_response.json()
            agent_run_id = agent_data.get("agent_run_id")
            print(f"   ✅ Agent started: {agent_run_id}")
            
            # Check status a few times
            print("\n   Checking agent status...")
            for i in range(5):
                time.sleep(2)
                status_response = requests.get(
                    f"{backend_url}/api/agent-run/{agent_run_id}",
                    headers=headers,
                    timeout=10
                )
                if status_response.status_code == 200:
                    status_data = status_response.json()
                    status = status_data.get("status")
                    print(f"   Check {i+1}/5: Status = {status}")
                    if status in ["completed", "stopped", "failed"]:
                        break
                else:
                    print(f"   ⚠️  Status check failed: {status_response.status_code}")
            
            print("\n   ✅ Chat flow test completed!")
            return True
        else:
            print(f"   ⚠️  Agent start response: {agent_response.status_code}")
            print(f"   Response: {agent_response.text[:200]}")
            return False
            
    except Exception as e:
        print(f"   ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("🚀 SIMPLE CHAT API TEST")
    print("="*60)
    
    # Test 1: Backend Health
    if not test_backend_health():
        print("\n❌ Backend health check failed. Make sure backend is running.")
        exit(1)
    
    # Test 2: Supabase Auth
    email, password, token = test_supabase_auth()
    if not token:
        print("\n❌ Authentication failed. Cannot proceed with chat test.")
        exit(1)
    
    # Test 3: Chat Flow
    if test_chat_flow(email, password, token):
        print("\n" + "="*60)
        print("✅ ALL TESTS PASSED!")
        print("="*60)
    else:
        print("\n" + "="*60)
        print("⚠️  SOME TESTS HAD ISSUES")
        print("="*60)

