#!/usr/bin/env python3

"""
Test script để kiểm tra OpenAI Compatible API integration
"""

import asyncio
import httpx
import os
from datetime import datetime
from supabase import create_client, Client

# Configuration
BACKEND_URL = "http://localhost:8000"
SUPABASE_URL = "http://127.0.0.1:54321"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

class OpenAICompatibleTester:
    def __init__(self):
        self.access_token = None
        self.thread_id = None
        self.supabase = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        
    async def authenticate(self):
        """Authenticate với Supabase"""
        print("🔐 Authenticating with Supabase...")

        try:
            auth_response = self.supabase.auth.sign_in_with_password({
                "email": "phanquochoipt@gmail.com",
                "password": "team_Vonic@281045"
            })

            if auth_response.user:
                self.access_token = auth_response.session.access_token
                print(f"✅ Authentication successful!")
                print(f"🔑 Token: {self.access_token[:50]}...")
                return True
            else:
                print("❌ Authentication failed: No user returned")
                return False
        except Exception as e:
            print(f"❌ Authentication error: {str(e)}")
            return False
    
    async def create_thread(self):
        """Tạo thread mới"""
        print("\n📝 Using existing thread...")

        # Use existing thread from E2E test
        self.thread_id = "918c47a0-f240-4826-b352-f5d6003e316a"
        print(f"✅ Thread ID: {self.thread_id}")
        return True
    
    async def test_openai_compatible_model(self, model_name: str, test_message: str):
        """Test một OpenAI compatible model"""
        print(f"\n🧪 Testing OpenAI Compatible Model: {model_name}")
        print(f"💬 Message: {test_message}")
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                # Step 1: Create user message
                print("📝 Creating user message...")
                user_message_response = await client.post(
                    f"{BACKEND_URL}/api/threads/{self.thread_id}/messages",
                    json={
                        "type": "user",
                        "content": test_message,
                        "is_llm_message": True
                    },
                    headers={
                        "Authorization": f"Bearer {self.access_token}",
                        "Content-Type": "application/json"
                    }
                )
                
                if user_message_response.status_code != 200:
                    print(f"❌ Failed to create user message: {user_message_response.status_code}")
                    print(f"Response: {user_message_response.text}")
                    return False
                
                print(f"✅ User message created")
                
                # Step 2: Start agent with OpenAI compatible model
                print(f"🤖 Starting agent with model: {model_name}")
                start_time = datetime.now()
                
                agent_response = await client.post(
                    f"{BACKEND_URL}/api/thread/{self.thread_id}/agent/start",
                    json={
                        "model_name": model_name,
                        "stream": True,
                        "enable_context_manager": False
                    },
                    headers={
                        "Authorization": f"Bearer {self.access_token}",
                        "Content-Type": "application/json"
                    }
                )
                
                if agent_response.status_code != 200:
                    print(f"❌ Failed to start agent: {agent_response.status_code}")
                    print(f"Response: {agent_response.text}")
                    return False
                
                agent_data = agent_response.json()
                agent_run_id = agent_data["agent_run_id"]
                print(f"✅ Agent started: {agent_run_id}")
                
                # Step 3: Monitor agent run
                print("⏳ Monitoring agent run...")
                
                for i in range(60):  # Wait up to 60 seconds
                    await asyncio.sleep(1)
                    
                    status_response = await client.get(
                        f"{BACKEND_URL}/api/thread/{self.thread_id}/agent-runs",
                        headers={
                            "Authorization": f"Bearer {self.access_token}"
                        }
                    )
                    
                    if status_response.status_code == 200:
                        runs = status_response.json()
                        current_run = next((run for run in runs if run["id"] == agent_run_id), None)
                        
                        if current_run:
                            status = current_run["status"]
                            elapsed = (datetime.now() - start_time).total_seconds()
                            
                            if status == "completed":
                                print(f"🏁 Agent completed in {elapsed:.1f}s")
                                
                                # Get messages to check response
                                messages_response = await client.get(
                                    f"{BACKEND_URL}/api/threads/{self.thread_id}/messages",
                                    headers={
                                        "Authorization": f"Bearer {self.access_token}"
                                    }
                                )
                                
                                if messages_response.status_code == 200:
                                    messages = messages_response.json()
                                    assistant_messages = [msg for msg in messages if msg.get("type") == "assistant"]
                                    
                                    if assistant_messages:
                                        latest_response = assistant_messages[-1]
                                        content = latest_response.get("content", {})
                                        response_text = content.get("content", "") if isinstance(content, dict) else str(content)
                                        
                                        print(f"📏 Response length: {len(response_text)} characters")
                                        print(f"💬 Response preview: {response_text[:200]}...")
                                        
                                        return True
                                    else:
                                        print("❌ No assistant response found")
                                        return False
                                
                            elif status == "failed":
                                print(f"❌ Agent failed after {elapsed:.1f}s")
                                return False
                            
                            elif i % 5 == 0:  # Print status every 5 seconds
                                print(f"⏱️  {elapsed:.1f}s: Status={status}")
                
                print("⏰ Timeout waiting for agent completion")
                return False
                
        except Exception as e:
            print(f"❌ Error testing model {model_name}: {str(e)}")
            return False

async def main():
    """Main test function"""
    print("🚀 OPENAI COMPATIBLE MODEL TESTER")
    print("=" * 50)
    
    tester = OpenAICompatibleTester()
    
    # Step 1: Authenticate
    if not await tester.authenticate():
        return
    
    # Step 2: Create thread
    if not await tester.create_thread():
        return
    
    # Step 3: Test different OpenAI compatible models
    test_cases = [
        {
            "model": "openai-compatible/gpt-4o-mini",
            "message": "What is artificial intelligence? Keep it brief."
        },
        {
            "model": "openai-compatible/gemini-2.5-flash-thinking",
            "message": "Explain quantum computing in simple terms."
        }
    ]
    
    results = []
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n{'='*50}")
        print(f"TEST {i}/{len(test_cases)}")
        print(f"{'='*50}")
        
        success = await tester.test_openai_compatible_model(
            test_case["model"],
            test_case["message"]
        )
        
        results.append({
            "model": test_case["model"],
            "success": success
        })
        
        if i < len(test_cases):
            print("\n⏳ Waiting 3 seconds before next test...")
            await asyncio.sleep(3)
    
    # Summary
    print(f"\n{'='*50}")
    print("📊 TEST SUMMARY")
    print(f"{'='*50}")
    
    for result in results:
        status = "✅ SUCCESS" if result["success"] else "❌ FAILED"
        print(f"{status}: {result['model']}")
    
    success_count = sum(1 for r in results if r["success"])
    print(f"\n🎯 Overall: {success_count}/{len(results)} tests passed")

if __name__ == "__main__":
    asyncio.run(main())
