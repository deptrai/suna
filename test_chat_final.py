#!/usr/bin/env python3
"""
Final Chat API Test - Uses /agent/start endpoint which handles everything
"""
import requests
import json
import time
import uuid

def test_chat_with_agent_start():
    """Test chat using /agent/start endpoint"""
    print("🚀 CHAT API TEST (Using /agent/start)")
    print("="*60)
    
    supabase_url = "http://localhost:54341"
    backend_url = "http://localhost:8000"
    apikey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOuoJuXMiQTTdk0Tz_w_Yz_Yz_Yz_Yz_Yz_Y"
    
    try:
        # Step 1: Health Check
        print("\n🏥 STEP 1: BACKEND HEALTH")
        print("-" * 40)
        health_response = requests.get(f"{backend_url}/api/health", timeout=5)
        if health_response.status_code == 200:
            print("   ✅ Backend is healthy")
        else:
            print(f"   ⚠️  Health check: {health_response.status_code}")
        
        # Step 2: Create/Authenticate User
        print("\n🔐 STEP 2: AUTHENTICATION")
        print("-" * 40)
        unique_id = str(uuid.uuid4())[:8]
        test_email = f"test_{unique_id}@example.com"
        test_password = "Test123456!"
        
        headers = {
            "apikey": apikey,
            "Content-Type": "application/json"
        }
        
        signup_response = requests.post(
            f"{supabase_url}/auth/v1/signup",
            headers=headers,
            json={"email": test_email, "password": test_password},
            timeout=10
        )
        
        if signup_response.status_code in [200, 201]:
            data = signup_response.json()
            token = data.get("access_token")
            user_id = data.get("user", {}).get("id")
            print(f"   ✅ User created: {test_email}")
            print(f"   User ID: {user_id}")
        else:
            print(f"   ⚠️  Signup: {signup_response.status_code}, trying login...")
            login_response = requests.post(
                f"{supabase_url}/auth/v1/token?grant_type=password",
                headers=headers,
                json={"email": test_email, "password": test_password},
                timeout=10
            )
            if login_response.status_code == 200:
                data = login_response.json()
                token = data.get("access_token")
                user_id = data.get("user", {}).get("id")
                print(f"   ✅ Login successful")
            else:
                print(f"   ❌ Auth failed: {login_response.status_code}")
                return False
        
        # Step 3: Start Agent (creates thread automatically)
        print("\n🤖 STEP 3: START AGENT (Auto-creates thread)")
        print("-" * 40)
        
        test_prompt = "Hello! Please respond with a simple greeting."
        print(f"   Prompt: {test_prompt}")
        
        agent_headers = {"Authorization": f"Bearer {token}"}
        form_data = {
            "prompt": test_prompt,
            "model_name": "gpt-4o-mini"
        }
        
        print("   Sending request to /api/agent/start...")
        agent_response = requests.post(
            f"{backend_url}/api/agent/start",
            headers=agent_headers,
            data=form_data,
            timeout=30
        )
        
        print(f"   Response status: {agent_response.status_code}")
        
        if agent_response.status_code in [200, 201]:
            agent_data = agent_response.json()
            thread_id = agent_data.get("thread_id")
            agent_run_id = agent_data.get("agent_run_id")
            status = agent_data.get("status")
            
            print(f"   ✅ Agent started successfully!")
            print(f"   Thread ID: {thread_id}")
            print(f"   Agent Run ID: {agent_run_id}")
            print(f"   Status: {status}")
            
            # Step 4: Monitor Agent Status
            print("\n📊 STEP 4: MONITOR AGENT STATUS")
            print("-" * 40)
            
            max_checks = 15
            check_interval = 3
            
            for i in range(max_checks):
                time.sleep(check_interval)
                status_response = requests.get(
                    f"{backend_url}/api/agent-run/{agent_run_id}",
                    headers=agent_headers,
                    timeout=10
                )
                
                if status_response.status_code == 200:
                    status_data = status_response.json()
                    current_status = status_data.get("status")
                    print(f"   Check {i+1}/{max_checks}: Status = {current_status}")
                    
                    if current_status == "running":
                        print("   ⏳ Agent is running, waiting...")
                    elif current_status in ["completed", "stopped", "failed"]:
                        print(f"   ✅ Agent finished: {current_status}")
                        break
                else:
                    print(f"   ⚠️  Status check failed: {status_response.status_code}")
            
            # Step 5: Get Messages
            print("\n📨 STEP 5: GET MESSAGES")
            print("-" * 40)
            
            messages_response = requests.get(
                f"{backend_url}/api/threads/{thread_id}/messages",
                headers=agent_headers,
                timeout=10
            )
            
            if messages_response.status_code == 200:
                messages_data = messages_response.json()
                messages = messages_data.get("messages", [])
                print(f"   ✅ Found {len(messages)} messages")
                
                # Show messages
                for msg in messages[-5:]:  # Last 5 messages
                    msg_type = msg.get("type", "unknown")
                    content = msg.get("content", "")
                    content_preview = content[:150] + "..." if len(content) > 150 else content
                    print(f"   - [{msg_type}] {content_preview}")
            else:
                print(f"   ⚠️  Failed to get messages: {messages_response.status_code}")
            
            print("\n" + "="*60)
            print("✅ CHAT API TEST COMPLETED SUCCESSFULLY!")
            print("="*60)
            return True
        else:
            print(f"   ❌ Agent start failed: {agent_response.status_code}")
            print(f"   Response: {agent_response.text[:500]}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("\n❌ Connection Error: Backend or Supabase not running")
        return False
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_chat_with_agent_start()
    exit(0 if success else 1)

