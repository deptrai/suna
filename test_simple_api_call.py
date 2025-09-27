#!/usr/bin/env python3
"""
Test simple API call without context manager to isolate the issue.
"""

import requests
import json
import time

def test_simple_api_call():
    """Test simple API call without context manager."""
    
    print("🧪 Testing Simple API Call...")
    
    base_url = "http://localhost:8000"
    
    # Test with simple OpenAI model, no context manager
    payload = {
        "prompt": "Hello, this is a simple test",
        "model_name": "openai/gpt-4o-mini",
        "enable_context_manager": False,  # DISABLE context manager
        "stream": False,
        "enable_thinking": False
    }
    
    print(f"📝 Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(
            f"{base_url}/api/agent/initiate",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data=payload,
            timeout=60
        )
        
        print(f"📊 Status Code: {response.status_code}")
        print(f"📊 Response Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Success: {json.dumps(data, indent=2)}")
            
            # Check agent status
            if 'agent_run_id' in data:
                agent_run_id = data['agent_run_id']
                print(f"\n🔍 Checking agent status: {agent_run_id}")
                
                # Wait a bit for processing
                time.sleep(5)
                
                status_response = requests.get(f"{base_url}/api/agent-run/{agent_run_id}/status")
                if status_response.status_code == 200:
                    status_data = status_response.json()
                    print(f"📊 Agent Status: {json.dumps(status_data, indent=2)}")
                else:
                    print(f"⚠️ Status check failed: {status_response.text}")
        else:
            print(f"❌ Error: {response.text}")
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        import traceback
        traceback.print_exc()

def test_auto_selection_api():
    """Test auto selection via API."""
    
    print("\n🤖 Testing Auto Selection API...")
    
    base_url = "http://localhost:8000"
    
    # Test with auto model selection, no context manager
    payload = {
        "prompt": "Hello, this is a simple test for auto selection",
        "model_name": "auto",  # Use auto selection
        "enable_context_manager": False,  # DISABLE context manager
        "stream": False,
        "enable_thinking": False
    }
    
    print(f"📝 Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(
            f"{base_url}/api/agent/initiate",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data=payload,
            timeout=60
        )
        
        print(f"📊 Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Auto Selection Success: {json.dumps(data, indent=2)}")
        else:
            print(f"❌ Auto Selection Error: {response.text}")
            
    except Exception as e:
        print(f"❌ Auto Selection Exception: {e}")

if __name__ == "__main__":
    print("🚀 Simple API Call Test")
    print("=" * 60)
    
    test_simple_api_call()
    test_auto_selection_api()
    
    print("\n✅ Test completed!")
