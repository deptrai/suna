#!/usr/bin/env python3
"""
Test script to trigger context optimization logging to GlitchTip.
This will send a message that triggers all 3 stages of context optimization.
"""

import requests
import json
import time

# Configuration
BACKEND_URL = "http://localhost:8000"
PROJECT_ID = "test-project-001"
AGENT_ID = "test-agent-001"

def send_test_message():
    """Send a test message to trigger context optimization."""
    
    print("🚀 Sending test message to trigger context optimization logging...")
    
    # Step 1: Initiate agent
    initiate_url = f"{BACKEND_URL}/api/agent/initiate"
    initiate_payload = {
        "project_id": PROJECT_ID,
        "agent_id": AGENT_ID,
        "message": "Hello! Can you help me understand context optimization? I want to know how the system reduces token usage from 52k to 5k tokens.",
        "stream": False,
        "enable_context_manager": True,
        "enable_prompt_caching": True
    }
    
    print(f"📤 POST {initiate_url}")
    print(f"📦 Payload: {json.dumps(initiate_payload, indent=2)}")
    
    try:
        response = requests.post(
            initiate_url,
            json=initiate_payload,
            headers={"Content-Type": "application/json"},
            timeout=120
        )
        
        print(f"📥 Response status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Success!")
            print(f"📊 Response preview: {json.dumps(result, indent=2)[:500]}...")
            
            # Extract thread_id for follow-up
            thread_id = result.get("thread_id")
            if thread_id:
                print(f"\n🔗 Thread ID: {thread_id}")
                print(f"📝 Check GlitchTip for context optimization logs with thread_id: {thread_id}")
                
                # Wait a bit for logs to be sent
                print("\n⏳ Waiting 5 seconds for logs to be sent to GlitchTip...")
                time.sleep(5)
                
                # Send a follow-up message to see multi-turn optimization
                print("\n🔄 Sending follow-up message...")
                followup_payload = {
                    "project_id": PROJECT_ID,
                    "agent_id": AGENT_ID,
                    "thread_id": thread_id,
                    "message": "Can you also explain semantic caching and tool filtering?",
                    "stream": False,
                    "enable_context_manager": True,
                    "enable_prompt_caching": True
                }
                
                followup_response = requests.post(
                    initiate_url,
                    json=followup_payload,
                    headers={"Content-Type": "application/json"},
                    timeout=120
                )
                
                if followup_response.status_code == 200:
                    print(f"✅ Follow-up message sent successfully!")
                    print(f"📝 Check GlitchTip for updated context optimization logs")
                else:
                    print(f"❌ Follow-up failed: {followup_response.status_code}")
                    print(f"Error: {followup_response.text[:500]}")
            
            return True
        else:
            print(f"❌ Request failed: {response.status_code}")
            print(f"Error: {response.text[:500]}")
            return False
            
    except requests.exceptions.Timeout:
        print("❌ Request timed out after 120 seconds")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("=" * 80)
    print("CONTEXT OPTIMIZATION LOGGING TEST")
    print("=" * 80)
    print()
    
    # Check backend health
    try:
        health_response = requests.get(f"{BACKEND_URL}/api/health", timeout=5)
        if health_response.status_code == 200:
            print("✅ Backend is healthy")
        else:
            print(f"⚠️ Backend health check returned: {health_response.status_code}")
    except Exception as e:
        print(f"❌ Backend is not responding: {e}")
        print("Please start the backend first: cd backend && uv run uvicorn api:app --host 0.0.0.0 --port 8000 --reload")
        return
    
    print()
    
    # Send test message
    success = send_test_message()
    
    print()
    print("=" * 80)
    if success:
        print("✅ TEST COMPLETED SUCCESSFULLY")
        print()
        print("📊 Next steps:")
        print("1. Check GlitchTip for 3 context optimization log entries:")
        print("   - Stage 1: Original context from DB")
        print("   - Stage 2: After context manager compression")
        print("   - Stage 3: Final optimized context (with system prompt + tools)")
        print()
        print("2. Each log entry should contain:")
        print("   - Message count and token count")
        print("   - Reduction ratios")
        print("   - Tool filtering stats")
        print("   - Message previews")
    else:
        print("❌ TEST FAILED")
        print("Check logs/backend.log and logs/worker.log for errors")
    print("=" * 80)

if __name__ == "__main__":
    main()

