#!/usr/bin/env python3
"""
Test Chat API với tất cả các OpenAI Compatible models mới
"""
import requests
import json
import time
import uuid
from typing import List, Dict, Tuple

# Danh sách các model cần test
MODELS_TO_TEST = [
    {
        "id": "openai-compatible/gpt-4o-mini",
        "name": "GPT-4o Mini",
        "alias": "gpt-4o-mini"
    },
    {
        "id": "openai-compatible/qwen3-30b-a3b-instruct-2507",
        "name": "Qwen3 30B A3B Instruct",
        "alias": "qwen3-30b-a3b-instruct-2507"
    },
    {
        "id": "openai-compatible/deepseek-v3-1",
        "name": "DeepSeek V3.1",
        "alias": "deepseek-v3-1"
    },
    {
        "id": "openai-compatible/qwen3-235b-a22b",
        "name": "Qwen3 235B A22B",
        "alias": "qwen3-235b-a22b"
    },
    {
        "id": "openai-compatible/claude-haiku-4-5-20251001",
        "name": "Claude Haiku 4.5",
        "alias": "claude-haiku-4-5-20251001"
    }
]

def test_single_model(model_info: Dict, supabase_url: str, backend_url: str, apikey: str) -> Tuple[bool, str]:
    """Test một model cụ thể"""
    model_id = model_info["id"]
    model_name = model_info["name"]
    model_alias = model_info["alias"]
    
    print(f"\n{'='*70}")
    print(f"🧪 TESTING: {model_name}")
    print(f"   Model ID: {model_id}")
    print(f"   Alias: {model_alias}")
    print(f"{'='*70}")
    
    try:
        # Step 1: Create/Authenticate User
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
        else:
            # Try login
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
            else:
                return False, f"Auth failed: {login_response.status_code}"
        
        # Step 2: Start Agent với model cụ thể
        test_prompt = f"Hello! Please respond with a simple greeting. This is a test for {model_name}."
        print(f"   📝 Prompt: {test_prompt[:60]}...")
        
        agent_headers = {"Authorization": f"Bearer {token}"}
        form_data = {
            "prompt": test_prompt,
            "model_name": model_alias  # Sử dụng alias
        }
        
        print(f"   🚀 Starting agent with model: {model_alias}...")
        agent_response = requests.post(
            f"{backend_url}/api/agent/start",
            headers=agent_headers,
            data=form_data,
            timeout=30
        )
        
        if agent_response.status_code not in [200, 201]:
            error_text = agent_response.text[:300]
            return False, f"Agent start failed ({agent_response.status_code}): {error_text}"
        
        agent_data = agent_response.json()
        thread_id = agent_data.get("thread_id")
        agent_run_id = agent_data.get("agent_run_id")
        status = agent_data.get("status")
        
        print(f"   ✅ Agent started: {agent_run_id[:8]}...")
        print(f"   📊 Initial status: {status}")
        
        # Step 3: Monitor Agent Status
        max_checks = 30  # Increased for slower models
        check_interval = 3
        final_status = None
        
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
                
                if i % 3 == 0:  # Print every 3 checks
                    print(f"   ⏳ Check {i+1}/{max_checks}: {current_status}")
                
                if current_status == "running":
                    continue
                elif current_status in ["completed", "stopped"]:
                    final_status = current_status
                    print(f"   ✅ Agent finished: {final_status}")
                    break
                elif current_status in ["failed", "error"]:
                    final_status = current_status
                    error_msg = status_data.get("error", "Unknown error")
                    if isinstance(error_msg, dict):
                        error_msg = str(error_msg)
                    return False, f"Agent failed: {error_msg[:200]}"
        
        if final_status is None:
            # Check one more time to see final status
            status_response = requests.get(
                f"{backend_url}/api/agent-run/{agent_run_id}",
                headers=agent_headers,
                timeout=10
            )
            if status_response.status_code == 200:
                status_data = status_response.json()
                final_status = status_data.get("status")
                if final_status in ["completed", "stopped"]:
                    print(f"   ✅ Agent finished (late): {final_status}")
                else:
                    return False, f"Agent timeout - status: {final_status}"
            else:
                return False, "Agent timeout - did not complete in time"
        
        # Step 4: Get Messages
        messages_response = requests.get(
            f"{backend_url}/api/threads/{thread_id}/messages",
            headers=agent_headers,
            timeout=10
        )
        
        if messages_response.status_code != 200:
            return False, f"Failed to get messages: {messages_response.status_code}"
        
        messages_data = messages_response.json()
        messages = messages_data.get("messages", [])
        
        # Debug: Print message structure
        print(f"   🔍 Found {len(messages)} total messages")
        if messages:
            print(f"   📋 Last message structure: {json.dumps(messages[-1], indent=2, default=str)[:300]}")
        
        # Tìm assistant message
        assistant_messages = [m for m in messages if m.get("type") == "assistant" or m.get("role") == "assistant"]
        
        if not assistant_messages:
            # Try to find any message with content
            for msg in reversed(messages):
                content = msg.get("content") or msg.get("text") or msg.get("message")
                if content and isinstance(content, str) and len(content.strip()) > 10:
                    print(f"   🔍 Found message with content: {type(content)}, length: {len(str(content))}")
                    response_content = str(content)
                    break
            else:
                return False, f"No assistant response found. Message types: {[m.get('type', m.get('role', 'unknown')) for m in messages[-3:]]}"
        else:
            last_assistant = assistant_messages[-1]
            response_content = last_assistant.get("content") or last_assistant.get("text") or last_assistant.get("message") or ""
        
        # Handle dict response (some APIs return structured content)
        if isinstance(response_content, dict):
            # Check for nested content structure: {"role": "assistant", "content": "text"}
            if "content" in response_content and isinstance(response_content["content"], str):
                response_content = response_content["content"]
            elif "text" in response_content:
                response_content = response_content["text"]
            elif "message" in response_content:
                response_content = response_content["message"]
            elif "role" in response_content:
                # If it's a role dict, try to get the content
                response_content = response_content.get("content", str(response_content))
            elif len(response_content) > 0:
                # Get first value if dict
                response_content = str(list(response_content.values())[0])
            else:
                response_content = str(response_content)
        
        # Convert to string if not already
        if not isinstance(response_content, str):
            response_content = str(response_content)
        
        # Strip whitespace
        response_content = response_content.strip()
        
        if not response_content or len(response_content) < 10:
            return False, f"Response too short or empty: '{response_content[:50]}'"
        
        print(f"   ✅ Response received: {len(response_content)} chars")
        print(f"   📄 Preview: {response_content[:100]}...")
        
        return True, response_content[:200]
        
    except requests.exceptions.ConnectionError:
        return False, "Connection error - Backend or Supabase not running"
    except Exception as e:
        return False, f"Exception: {str(e)}"

def main():
    """Test tất cả models"""
    print("🚀 CHAT API TEST - ALL OPENAI COMPATIBLE MODELS")
    print("="*70)
    
    supabase_url = "http://localhost:54341"
    backend_url = "http://localhost:8000"
    apikey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOuoJuXMiQTTdk0Tz_w_Yz_Yz_Yz_Yz_Yz_Y"
    
    # Health check
    try:
        health_response = requests.get(f"{backend_url}/api/health", timeout=5)
        if health_response.status_code != 200:
            print(f"❌ Backend health check failed: {health_response.status_code}")
            return
        print("✅ Backend is healthy\n")
    except Exception as e:
        print(f"❌ Backend not available: {e}")
        return
    
    # Test từng model
    results = []
    for model_info in MODELS_TO_TEST:
        success, message = test_single_model(model_info, supabase_url, backend_url, apikey)
        results.append({
            "model": model_info["name"],
            "success": success,
            "message": message
        })
        
        if success:
            print(f"   ✅ {model_info['name']}: PASSED")
        else:
            print(f"   ❌ {model_info['name']}: FAILED - {message}")
        
        # Delay giữa các test
        time.sleep(2)
    
    # Summary
    print("\n" + "="*70)
    print("📊 TEST SUMMARY")
    print("="*70)
    
    passed = sum(1 for r in results if r["success"])
    total = len(results)
    
    for result in results:
        status = "✅ PASS" if result["success"] else "❌ FAIL"
        print(f"{status} - {result['model']}")
        if not result["success"]:
            print(f"      Error: {result['message']}")
    
    print(f"\n📈 Results: {passed}/{total} models passed")
    
    if passed == total:
        print("🎉 ALL MODELS WORKING CORRECTLY!")
        exit(0)
    else:
        print(f"⚠️  {total - passed} model(s) failed")
        exit(1)

if __name__ == "__main__":
    main()

