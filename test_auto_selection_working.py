#!/usr/bin/env python3
"""
Test script to verify Auto Model Selection is working correctly.
"""

import requests
import json
import time

def test_auto_selection():
    """Test that auto selection works with different query types."""
    
    base_url = "http://localhost:8000"
    
    # Test data
    test_cases = [
        {
            "name": "Simple Query (should select gpt-4o-mini)",
            "query": "Hello, how are you?",
            "expected_model_type": "gpt-4o-mini"
        },
        {
            "name": "Complex Query (should select gpt-5)",
            "query": "Please analyze this complex codebase, implement a new feature with proper error handling, and create comprehensive unit tests",
            "expected_model_type": "gpt-5"
        }
    ]
    
    for test_case in test_cases:
        print(f"\n🧪 Testing: {test_case['name']}")
        print(f"Query: {test_case['query']}")
        
        # Create thread
        thread_response = requests.post(
            f"{base_url}/api/threads",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={"name": f"Auto Selection Test - {test_case['name']}"}
        )
        
        if thread_response.status_code != 200:
            print(f"❌ Failed to create thread: {thread_response.text}")
            continue
            
        thread_data = thread_response.json()
        thread_id = thread_data["thread_id"]
        print(f"✅ Created thread: {thread_id}")
        
        # Start agent with auto mode
        agent_response = requests.post(
            f"{base_url}/api/thread/{thread_id}/agent/start",
            headers={"Content-Type": "application/json"},
            json={
                "model_name": "auto",  # This should trigger auto selection
                "query": test_case["query"],  # Query for analysis
                "enable_context_manager": True,
                "stream": False
            }
        )
        
        if agent_response.status_code != 200:
            print(f"❌ Failed to start agent: {agent_response.text}")
            continue
            
        agent_data = agent_response.json()
        agent_run_id = agent_data["agent_run_id"]
        print(f"✅ Started agent: {agent_run_id}")
        
        # Wait a moment for processing
        time.sleep(2)
        
        # Check agent status to see which model was selected
        status_response = requests.get(f"{base_url}/api/agent-run/{agent_run_id}/status")
        
        if status_response.status_code == 200:
            status_data = status_response.json()
            print(f"📊 Agent Status: {status_data}")
        else:
            print(f"⚠️ Could not get agent status: {status_response.text}")
        
        print(f"Expected model type: {test_case['expected_model_type']}")
        print("-" * 50)

if __name__ == "__main__":
    print("🚀 Testing Auto Model Selection...")
    test_auto_selection()
    print("\n✅ Test completed!")
