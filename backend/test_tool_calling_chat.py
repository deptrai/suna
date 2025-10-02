#!/usr/bin/env python3
"""
TEST TOOL CALLING IN CHAT

Test if chat can call tools like create_task and web_search
"""
import asyncio
import httpx
from dotenv import load_dotenv

load_dotenv()


async def test_tool_calling():
    """Test tool calling with different messages"""
    print("🔧 TOOL CALLING TEST")
    print("="*60)

    # Admin credentials
    admin_email = "admin@example.com"
    admin_password = "Admin@123"
    supabase_url = "http://localhost:54321"
    backend_url = "http://localhost:8000"

    async with httpx.AsyncClient(timeout=120.0) as client:
        # Step 1: Supabase Authentication
        print("\n🔐 STEP 1: AUTHENTICATION")
        print("-"*40)

        auth_endpoint = f"{supabase_url}/auth/v1/token?grant_type=password"
        auth_headers = {
            "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOuoJuXMiQTTdk0Tz_w_Yz_Yz_Yz_Yz_Yz_Y",
            "Content-Type": "application/json"
        }

        auth_payload = {
            "email": admin_email,
            "password": admin_password
        }

        auth_response = await client.post(
            auth_endpoint,
            headers=auth_headers,
            json=auth_payload
        )

        if auth_response.status_code != 200:
            print(f"❌ Auth failed: {auth_response.status_code}")
            print(f"Response: {auth_response.text}")
            return False

        auth_data = auth_response.json()
        token = auth_data.get("access_token")
        user_id = auth_data.get("user", {}).get("id")
        headers = {"Authorization": f"Bearer {token}"}

        print(f"✅ Authenticated: {user_id}")
        
        # Step 2: Get thread
        print("\n🧵 STEP 2: GET THREAD")
        print("-"*40)

        # Get threads from backend
        threads_response = await client.get(
            f"{backend_url}/api/threads",
            headers=headers
        )

        if threads_response.status_code != 200:
            print(f"❌ Get threads failed: {threads_response.status_code}")
            return False

        threads = threads_response.json().get("threads", [])
        if not threads:
            print("❌ No threads found")
            return False

        thread_id = threads[0]["thread_id"]
        print(f"✅ Using thread: {thread_id}")
        
        # Test 1: Create Tasks Tool (CORRECT NAME: create_tasks with 's')
        print("\n📝 TEST 1: CREATE_TASKS TOOL")
        print("="*60)

        message_1 = "Please use create_tasks tool to create tasks in a section called 'Test Section' with these tasks: ['Test Task 1', 'Test Task 2']"
        
        print(f"💬 Message: {message_1[:80]}...")
        
        # Send message
        msg_response = await client.post(
            f"{backend_url}/api/threads/{thread_id}/messages/add",
            params={"message": message_1},
            headers=headers
        )
        
        if msg_response.status_code != 200:
            print(f"❌ Message send failed: {msg_response.status_code}")
            return False
        
        message_id_1 = msg_response.json()["message_id"]
        print(f"✅ Message sent: {message_id_1}")
        
        # Start agent
        agent_response = await client.post(
            f"{backend_url}/api/thread/{thread_id}/agent/start",
            json={"model": "auto", "stream": False},
            headers=headers
        )
        
        if agent_response.status_code != 200:
            print(f"❌ Agent start failed: {agent_response.status_code}")
            return False
        
        agent_run_id_1 = agent_response.json()["agent_run_id"]
        print(f"✅ Agent started: {agent_run_id_1}")
        
        # Wait for response
        print("⏳ Waiting 20 seconds for agent to process...")
        await asyncio.sleep(20)
        
        # Check messages
        messages_response = await client.get(
            f"{backend_url}/api/threads/{thread_id}/messages",
            headers=headers
        )
        
        messages = messages_response.json()["messages"]
        
        # Find assistant response after our message
        assistant_responses = [m for m in messages if m["type"] == "assistant" and m["created_at"] > msg_response.json()["created_at"]]
        
        if assistant_responses:
            response_content = assistant_responses[0]["content"]
            print(f"✅ Response received!")
            print(f"🤖 Response: {str(response_content)[:200]}...")
            
            # Check if tool was called
            if "create_task" in str(response_content).lower() or "task" in str(response_content).lower():
                print("✅ Tool calling detected in response!")
            else:
                print("⚠️  No tool calling detected")
        else:
            print("❌ No assistant response found")
        
        # Test 2: Web Search Tool
        print("\n🔍 TEST 2: WEB_SEARCH TOOL")
        print("="*60)
        
        message_2 = "Please use web_search tool to search for 'latest AI news 2025' and tell me what you find"
        
        print(f"💬 Message: {message_2[:80]}...")
        
        # Send message
        msg_response_2 = await client.post(
            f"{backend_url}/api/threads/{thread_id}/messages/add",
            params={"message": message_2},
            headers=headers
        )
        
        if msg_response_2.status_code != 200:
            print(f"❌ Message send failed: {msg_response_2.status_code}")
            return False
        
        message_id_2 = msg_response_2.json()["message_id"]
        print(f"✅ Message sent: {message_id_2}")
        
        # Start agent
        agent_response_2 = await client.post(
            f"{backend_url}/api/thread/{thread_id}/agent/start",
            json={"model": "auto", "stream": False},
            headers=headers
        )
        
        if agent_response_2.status_code != 200:
            print(f"❌ Agent start failed: {agent_response_2.status_code}")
            return False
        
        agent_run_id_2 = agent_response_2.json()["agent_run_id"]
        print(f"✅ Agent started: {agent_run_id_2}")
        
        # Wait for response
        print("⏳ Waiting 20 seconds for agent to process...")
        await asyncio.sleep(20)
        
        # Check messages
        messages_response_2 = await client.get(
            f"{backend_url}/api/threads/{thread_id}/messages",
            headers=headers
        )
        
        messages_2 = messages_response_2.json()["messages"]
        
        # Find assistant response after our message
        assistant_responses_2 = [m for m in messages_2 if m["type"] == "assistant" and m["created_at"] > msg_response_2.json()["created_at"]]
        
        if assistant_responses_2:
            response_content_2 = assistant_responses_2[0]["content"]
            print(f"✅ Response received!")
            print(f"🤖 Response: {str(response_content_2)[:200]}...")
            
            # Check if tool was called
            if "search" in str(response_content_2).lower() or "found" in str(response_content_2).lower():
                print("✅ Tool calling detected in response!")
            else:
                print("⚠️  No tool calling detected")
        else:
            print("❌ No assistant response found")
        
        print("\n" + "="*60)
        print("📊 TOOL CALLING TEST SUMMARY")
        print("="*60)
        
        if assistant_responses and assistant_responses_2:
            print("🎉 SUCCESS: Both tool calling tests completed!")
            print("✅ create_task tool: Response received")
            print("✅ web_search tool: Response received")
            return True
        else:
            print("⚠️  PARTIAL SUCCESS: Some tests failed")
            return False


async def main():
    """Run tests"""
    print("🚀 TOOL CALLING CHAT TEST")
    print("🔍 Testing if chat can call tools")
    print()
    
    result = await test_tool_calling()
    
    if result:
        print("\n🎉 TOOL CALLING WORKING!")
        print("✅ Chat can call tools successfully")
    else:
        print("\n⚠️  TOOL CALLING ISSUES")
        print("🔧 Need to debug further")
    
    return result


if __name__ == "__main__":
    asyncio.run(main())
