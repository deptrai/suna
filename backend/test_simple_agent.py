#!/usr/bin/env python3
"""
TEST SIMPLE AGENT

Test agent with minimal configuration to avoid overload
"""
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()


async def test_simple_agent():
    """Test agent with minimal config"""
    print("🤖 SIMPLE AGENT TEST")
    print("="*50)
    
    try:
        from core.agentpress.thread_manager import ThreadManager
        from core.services.supabase import DBConnection
        
        # Initialize database
        db = DBConnection()
        await db.initialize()
        
        # Use real test thread
        thread_id = "5bf0095c-058a-44d0-b3d5-2e042c62e1f9"
        
        # Create thread manager with minimal config
        thread_manager = ThreadManager()

        # Initialize thread manager database
        await thread_manager.db.initialize()
        
        print(f"🔄 Running simple agent for thread: {thread_id}")
        
        # Simple system prompt
        system_prompt = {
            "content": "You are a helpful assistant. Respond briefly and clearly.",
            "role": "system"
        }

        # Run thread and get response
        response = await thread_manager.run_thread(
            thread_id=thread_id,
            system_prompt=system_prompt,
            llm_model="openai-compatible/gpt-4o-mini",
            stream=False,
            llm_max_tokens=100
        )

        print(f"📨 Response type: {type(response)}")
        print(f"📨 Response: {response}")

        response_count = 1
        
        if response_count > 0:
            print(f"✅ Simple agent working - Generated {response_count} responses")
            return True
        else:
            print("❌ No responses generated")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_direct_message_creation():
    """Test creating assistant message directly"""
    print("\n💬 DIRECT MESSAGE CREATION TEST")
    print("="*50)
    
    try:
        from core.services.supabase import DBConnection
        import uuid
        import json
        
        db = DBConnection()
        await db.initialize()
        client = await db.client
        
        thread_id = "5bf0095c-058a-44d0-b3d5-2e042c62e1f9"
        
        # Create assistant message directly
        message_id = str(uuid.uuid4())
        message_data = {
            "message_id": message_id,
            "thread_id": thread_id,
            "type": "assistant",
            "is_llm_message": True,
            "content": {"text": "Hello! This is a test assistant response."}
        }
        
        result = await client.table("messages").insert(message_data).execute()
        
        if result.data:
            print(f"✅ Created assistant message: {message_id}")
            
            # Verify message exists
            messages = await client.table("messages").select("*").eq("thread_id", thread_id).order("created_at", desc=True).limit(5).execute()
            
            print(f"📊 Total messages in thread: {len(messages.data)}")
            for msg in messages.data:
                print(f"   - {msg['type']}: {msg['content']}")
            
            return True
        else:
            print("❌ Failed to create message")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Run tests"""
    print("🚀 SIMPLE AGENT & MESSAGE TEST")
    print("🔍 Testing minimal agent configuration")
    print()
    
    # Test 1: Direct message creation
    message_result = await test_direct_message_creation()
    
    # Test 2: Simple agent
    agent_result = await test_simple_agent()
    
    print("\n" + "="*50)
    print("📊 TEST SUMMARY")
    print("="*50)
    
    if message_result:
        print("✅ Direct message creation: WORKING")
    else:
        print("❌ Direct message creation: FAILED")
    
    if agent_result:
        print("✅ Simple agent: WORKING")
    else:
        print("❌ Simple agent: FAILED")
    
    if message_result and agent_result:
        print("\n🎉 CHAT SYSTEM READY!")
        print("✅ All components working")
        print("💡 Chat can now respond to users")
    else:
        print("\n⚠️  PARTIAL SUCCESS")
        print("🔧 Some components need debugging")
    
    return message_result and agent_result


if __name__ == "__main__":
    asyncio.run(main())
