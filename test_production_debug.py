#!/usr/bin/env python3
"""
Test để debug production issue với enable_context_manager
"""
import requests
import json
import time

def test_api_call_with_auth():
    """Test API call với authentication"""
    print("🔧 TESTING API CALL WITH AUTH")
    print("=" * 50)
    
    # Get JWT token first
    auth_url = "http://localhost:8000/api/auth/login"
    auth_data = {
        "email": "test@example.com",
        "password": "testpassword"
    }
    
    try:
        # Try to login (this might fail if user doesn't exist)
        auth_response = requests.post(auth_url, json=auth_data)
        print(f"📤 Auth response status: {auth_response.status_code}")
        
        if auth_response.status_code == 200:
            auth_result = auth_response.json()
            token = auth_result.get('access_token')
            
            if token:
                print("✅ Got auth token")
                
                # Test agent initiate with token
                url = "http://localhost:8000/api/agent/initiate"
                headers = {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                }
                
                data = {
                    "prompt": "Hello, can you help me with a simple task?",
                    "enable_context_manager": True,
                    "stream": False
                }
                
                print(f"📤 Sending request to: {url}")
                print(f"📋 Data: {json.dumps(data, indent=2)}")
                
                response = requests.post(url, json=data, headers=headers)
                print(f"📥 Response status: {response.status_code}")
                
                if response.status_code == 200:
                    result = response.json()
                    print(f"✅ Success! Response keys: {list(result.keys())}")
                    
                    # Check for token usage
                    if 'token_usage' in result:
                        token_usage = result['token_usage']
                        print(f"🎯 Token Usage: {token_usage}")
                        
                        prompt_tokens = token_usage.get('prompt_tokens', 0)
                        if prompt_tokens < 5000:
                            print(f"✅ OPTIMIZATION WORKING! Input tokens: {prompt_tokens}")
                        else:
                            print(f"❌ OPTIMIZATION NOT WORKING! Input tokens: {prompt_tokens}")
                    else:
                        print("⚠️ No token_usage in response")
                        
                else:
                    print(f"❌ Error: {response.status_code}")
                    print(f"Response: {response.text}")
            else:
                print("❌ No token in auth response")
        else:
            print(f"❌ Auth failed: {auth_response.status_code}")
            print("⚠️ Will try without auth (might fail)")
            
            # Try without auth anyway
            test_without_auth()
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        print("⚠️ Will try without auth")
        test_without_auth()

def test_without_auth():
    """Test without authentication (might fail)"""
    print("\n🔧 TESTING WITHOUT AUTH")
    print("=" * 50)
    
    url = "http://localhost:8000/api/agent/initiate"
    
    # Try with form data instead of JSON
    data = {
        "prompt": "Hello, can you help me with a simple task?",
        "enable_context_manager": "true",  # String instead of boolean
        "stream": "false"
    }
    
    print(f"📤 Sending form data to: {url}")
    print(f"📋 Data: {data}")
    
    try:
        response = requests.post(url, data=data)
        print(f"📥 Response status: {response.status_code}")
        print(f"Response: {response.text[:500]}...")
        
    except Exception as e:
        print(f"❌ Exception: {e}")

def check_server_logs():
    """Check recent server logs"""
    print("\n🔧 CHECKING RECENT SERVER LOGS")
    print("=" * 50)
    
    try:
        import subprocess
        
        # Get recent logs with optimization debug
        result = subprocess.run([
            "tail", "-n", "100", "logs/structured.jsonl"
        ], capture_output=True, text=True, cwd="/Users/mac_1/Documents/GitHub/suna")
        
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            optimization_lines = [line for line in lines if 'OPTIMIZATION' in line or 'enable_context_manager' in line]
            
            if optimization_lines:
                print("✅ Found optimization logs:")
                for line in optimization_lines[-5:]:  # Last 5 lines
                    print(f"   {line}")
            else:
                print("❌ No optimization logs found in recent entries")
                
            # Check for recent agent runs
            agent_lines = [line for line in lines if 'AGENT' in line and 'DEBUG' in line]
            if agent_lines:
                print("\n✅ Found agent debug logs:")
                for line in agent_lines[-3:]:  # Last 3 lines
                    print(f"   {line}")
        else:
            print(f"❌ Failed to read logs: {result.stderr}")
            
    except Exception as e:
        print(f"❌ Exception checking logs: {e}")

def check_worker_status():
    """Check worker status"""
    print("\n🔧 CHECKING WORKER STATUS")
    print("=" * 50)
    
    try:
        import subprocess
        
        # Check dramatiq processes
        result = subprocess.run([
            "ps", "aux"
        ], capture_output=True, text=True)
        
        if result.returncode == 0:
            lines = result.stdout.split('\n')
            dramatiq_lines = [line for line in lines if 'dramatiq' in line and 'grep' not in line]
            
            if dramatiq_lines:
                print(f"✅ Found {len(dramatiq_lines)} dramatiq processes:")
                for line in dramatiq_lines:
                    print(f"   {line}")
            else:
                print("❌ No dramatiq processes found")
        else:
            print(f"❌ Failed to check processes: {result.stderr}")
            
    except Exception as e:
        print(f"❌ Exception checking workers: {e}")

if __name__ == "__main__":
    check_worker_status()
    check_server_logs()
    test_api_call_with_auth()
