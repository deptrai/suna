#!/usr/bin/env python3
"""
Test API endpoint directly to match frontend behavior.
"""

import requests
import json
import time

def test_api_endpoint():
    """Test API endpoint directly."""
    
    print("🧪 Testing API Endpoint...")
    
    base_url = "http://localhost:8000"
    
    # Test with auto model selection (matching frontend)
    payload = {
        "prompt": "Test with Router strategy for v98store",
        "model_name": "auto",
        "enable_context_manager": True,
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
                
                # Wait for processing
                for i in range(12):  # Wait up to 60 seconds
                    time.sleep(5)
                    
                    status_response = requests.get(f"{base_url}/api/agent-run/{agent_run_id}/status")
                    if status_response.status_code == 200:
                        status_data = status_response.json()
                        status = status_data.get('status', 'unknown')
                        print(f"📊 Agent Status (attempt {i+1}): {status}")
                        
                        if status == 'completed':
                            print(f"✅ Agent completed successfully!")
                            
                            # Get messages
                            messages_response = requests.get(f"{base_url}/api/agent-run/{agent_run_id}/messages")
                            if messages_response.status_code == 200:
                                messages_data = messages_response.json()
                                print(f"📝 Messages: {json.dumps(messages_data, indent=2)}")
                            break
                        elif status == 'error':
                            print(f"❌ Agent failed!")
                            
                            # Get error details
                            messages_response = requests.get(f"{base_url}/api/agent-run/{agent_run_id}/messages")
                            if messages_response.status_code == 200:
                                messages_data = messages_response.json()
                                print(f"📝 Error Messages: {json.dumps(messages_data, indent=2)}")
                            break
                    else:
                        print(f"⚠️ Status check failed: {status_response.text}")
                        break
        else:
            print(f"❌ Error: {response.text}")
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("🚀 API Endpoint Test")
    print("=" * 60)
    
    test_api_endpoint()
    
    print("\n✅ Test completed!")
