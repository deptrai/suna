#!/usr/bin/env python3
"""
Test script to verify context optimization is working after fixing default values
"""

import asyncio
import json
import httpx
import time
from datetime import datetime

# Test configuration
BASE_URL = "http://localhost:8000"
TEST_THREAD_ID = "test-optimization-fix"
TEST_PROJECT_ID = "test-project"

async def test_optimization_fix():
    """Test that context optimization is now working with correct default values"""
    
    print("🧪 TESTING CONTEXT OPTIMIZATION FIX")
    print("=" * 50)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        
        # 1. Create test thread
        print("1️⃣ Creating test thread...")
        thread_response = await client.post(f"{BASE_URL}/api/threads", json={
            "thread_id": TEST_THREAD_ID,
            "project_id": TEST_PROJECT_ID,
            "account_id": "test-user"
        })
        
        if thread_response.status_code != 200:
            print(f"❌ Failed to create thread: {thread_response.status_code}")
            return
        
        print(f"✅ Thread created: {TEST_THREAD_ID}")
        
        # 2. Add a simple user message
        print("\n2️⃣ Adding user message...")
        message_response = await client.post(f"{BASE_URL}/api/threads/{TEST_THREAD_ID}/messages", json={
            "type": "user",
            "content": "Hello, what is 2+2?"
        })
        
        if message_response.status_code != 200:
            print(f"❌ Failed to add message: {message_response.status_code}")
            return
        
        print("✅ User message added")
        
        # 3. Start agent with optimization enabled (should be default now)
        print("\n3️⃣ Starting agent with optimization...")
        agent_start_response = await client.post(f"{BASE_URL}/api/thread/{TEST_THREAD_ID}/agent/start", json={
            "model_name": "openai/gpt-5-mini",
            "enable_thinking": False,
            "reasoning_effort": "low",
            "stream": True,
            "enable_context_manager": True,  # Explicitly enable
            "enable_prompt_caching": False
        })
        
        if agent_start_response.status_code != 200:
            print(f"❌ Failed to start agent: {agent_start_response.status_code}")
            print(f"Response: {agent_start_response.text}")
            return
        
        agent_data = agent_start_response.json()
        agent_run_id = agent_data["agent_run_id"]
        print(f"✅ Agent started: {agent_run_id}")
        
        # 4. Monitor agent execution for optimization logs
        print("\n4️⃣ Monitoring agent execution...")
        
        # Wait a bit for agent to start processing
        await asyncio.sleep(3)
        
        # Check agent run status
        status_response = await client.get(f"{BASE_URL}/api/agent-run/{agent_run_id}")
        if status_response.status_code == 200:
            status_data = status_response.json()
            print(f"📊 Agent status: {status_data.get('status', 'unknown')}")
        
        # 5. Check server logs for optimization debug messages
        print("\n5️⃣ Expected optimization logs to appear in server console:")
        print("   - 'Context manager enabled, compressing X messages'")
        print("   - 'System prompt optimized: X -> Y chars'") 
        print("   - 'Tool filtering: X/Y tools for query'")
        print("   - 'Token reduction: X -> Y tokens (Z% reduction)'")
        
        print(f"\n🔍 Check server logs for agent run: {agent_run_id}")
        print(f"🔍 Check v98store logs: https://v98store.com/log?key=sk-Righ5E8wjF9WMrNITGhjBZlgS17vzdvbxYK4S1IjaJu4soIi")
        
        # 6. Wait for completion
        print("\n6️⃣ Waiting for agent completion...")
        max_wait = 30
        start_time = time.time()
        
        while time.time() - start_time < max_wait:
            status_response = await client.get(f"{BASE_URL}/api/agent-run/{agent_run_id}")
            if status_response.status_code == 200:
                status_data = status_response.json()
                status = status_data.get('status', 'unknown')
                
                if status in ['completed', 'failed', 'stopped']:
                    print(f"✅ Agent finished with status: {status}")
                    break
                    
                print(f"⏳ Agent status: {status}")
            
            await asyncio.sleep(2)
        
        print("\n" + "=" * 50)
        print("🎯 TEST COMPLETE")
        print("Check the server logs above for optimization debug messages.")
        print("If you see optimization logs, the fix worked! 🎉")
        print("If no optimization logs appear, there may be another issue.")

if __name__ == "__main__":
    asyncio.run(test_optimization_fix())
