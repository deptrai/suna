#!/usr/bin/env python3
"""
Test live optimization by making actual API calls to the running server.
This will verify if optimization is working in production.
"""

import asyncio
import aiohttp
import json
import sys
import time

async def test_live_optimization():
    """Test optimization with live API calls."""
    print("🔍 Testing Live Context Optimization")
    print("=" * 60)
    
    # Test endpoint
    base_url = "http://localhost:8000/api"
    
    # Test scenarios
    test_cases = [
        {
            "name": "Simple Question",
            "message": "Xin chào",
            "expected_reduction": "High (80%+)"
        },
        {
            "name": "Code Request", 
            "message": "Help me edit a Python file to add error handling",
            "expected_reduction": "Medium (40-60%)"
        },
        {
            "name": "Git Request",
            "message": "Show me git status and commit my changes",
            "expected_reduction": "High (70%+)"
        }
    ]
    
    async with aiohttp.ClientSession() as session:
        for i, test_case in enumerate(test_cases, 1):
            print(f"\n🧪 Test {i}: {test_case['name']}")
            print(f"   Message: '{test_case['message']}'")
            print(f"   Expected: {test_case['expected_reduction']}")
            
            try:
                # Create a new thread
                thread_payload = {
                    "project_id": "test-optimization",
                    "name": f"Test Optimization {i}",
                    "description": "Testing context optimization"
                }
                
                async with session.post(f"{base_url}/threads", json=thread_payload) as resp:
                    if resp.status != 200:
                        print(f"   ❌ Failed to create thread: {resp.status}")
                        continue
                    
                    thread_data = await resp.json()
                    thread_id = thread_data.get("id")
                    print(f"   ✅ Thread created: {thread_id}")
                
                # Send message to thread
                message_payload = {
                    "content": test_case["message"],
                    "llm_model": "gpt-4o",
                    "llm_temperature": 0.7,
                    "llm_max_tokens": 4000,
                    "tool_choice": "auto",
                    "stream": False,
                    "enable_context_manager": True  # Ensure optimization is enabled
                }
                
                print(f"   📤 Sending message...")
                start_time = time.time()
                
                async with session.post(f"{base_url}/threads/{thread_id}/messages", json=message_payload) as resp:
                    if resp.status != 200:
                        print(f"   ❌ Failed to send message: {resp.status}")
                        error_text = await resp.text()
                        print(f"   Error: {error_text}")
                        continue
                    
                    response_data = await resp.json()
                    end_time = time.time()
                    
                    print(f"   ✅ Response received in {end_time - start_time:.2f}s")
                    
                    # Check if response contains optimization info
                    if "usage" in response_data:
                        usage = response_data["usage"]
                        input_tokens = usage.get("prompt_tokens", 0)
                        output_tokens = usage.get("completion_tokens", 0)
                        total_tokens = usage.get("total_tokens", 0)
                        
                        print(f"   📊 Token Usage:")
                        print(f"      Input tokens: {input_tokens}")
                        print(f"      Output tokens: {output_tokens}")
                        print(f"      Total tokens: {total_tokens}")
                        
                        # Evaluate optimization
                        if input_tokens < 5000:
                            print(f"   🎉 EXCELLENT: Input tokens under 5k!")
                        elif input_tokens < 15000:
                            print(f"   ✅ GOOD: Input tokens under 15k")
                        elif input_tokens < 30000:
                            print(f"   ⚠️ MODERATE: Input tokens under 30k")
                        else:
                            print(f"   ❌ HIGH: Input tokens over 30k - optimization may not be working")
                    else:
                        print(f"   ⚠️ No usage data in response")
                    
                    # Check response quality
                    if "content" in response_data:
                        content = response_data["content"]
                        if len(content) > 10:
                            print(f"   ✅ Response quality: Good ({len(content)} chars)")
                        else:
                            print(f"   ⚠️ Response quality: Short ({len(content)} chars)")
                    
            except Exception as e:
                print(f"   ❌ Test failed: {str(e)}")
                import traceback
                traceback.print_exc()
    
    print(f"\n" + "=" * 60)
    print("🏁 Live Optimization Test Complete")
    
    print(f"\n📋 ANALYSIS:")
    print(f"   • If input tokens < 5k: Optimization working excellently")
    print(f"   • If input tokens 5-15k: Optimization working well")
    print(f"   • If input tokens 15-30k: Optimization partially working")
    print(f"   • If input tokens > 30k: Optimization not working")
    
    print(f"\n🔧 TROUBLESHOOTING:")
    print(f"   • Check server logs for optimization debug messages")
    print(f"   • Verify enable_context_manager=True in requests")
    print(f"   • Ensure latest code is deployed")
    print(f"   • Check if DEFAULT_TOKEN_THRESHOLD=15000")

async def test_health():
    """Test if server is running."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("http://localhost:8000/api/health") as resp:
                if resp.status == 200:
                    print("✅ Server is running")
                    return True
                else:
                    print(f"❌ Server health check failed: {resp.status}")
                    return False
    except Exception as e:
        print(f"❌ Cannot connect to server: {e}")
        return False

async def main():
    """Main test function."""
    print("🚀 Live Context Optimization Test")
    print("=" * 60)
    
    # Check server health first
    if not await test_health():
        print("\n❌ Server is not accessible. Please start the server first.")
        return False
    
    # Run optimization tests
    await test_live_optimization()
    
    return True

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
