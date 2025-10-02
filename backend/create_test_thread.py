#!/usr/bin/env python3
"""
CREATE TEST THREAD

Create a test thread in database for debugging chat response
"""
import asyncio
import uuid
from dotenv import load_dotenv

load_dotenv()


async def create_test_thread():
    """Create test thread in database"""
    print("🧵 CREATING TEST THREAD")
    print("="*50)
    
    try:
        from core.services.supabase import DBConnection
        
        db = DBConnection()
        await db.initialize()
        client = await db.client
        
        # Get existing account and project
        print("📊 Getting existing account and project...")
        
        # Get first account from basejump schema
        accounts_result = await client.schema("basejump").table("accounts").select("id").limit(1).execute()
        if not accounts_result.data:
            print("❌ No accounts found. Please create an account first.")
            return None
            
        account_id = accounts_result.data[0]["id"]
        print(f"✅ Found account: {account_id}")
        
        # Get or create project
        projects_result = await client.table("projects").select("project_id").limit(1).execute()
        if projects_result.data:
            project_id = projects_result.data[0]["project_id"]
            print(f"✅ Found project: {project_id}")
        else:
            # Create test project
            project_id = str(uuid.uuid4())
            project_data = {
                "project_id": project_id,
                "account_id": account_id,
                "name": "Debug Test Project",
                "description": "Project for debugging chat response"
            }
            
            await client.table("projects").insert(project_data).execute()
            print(f"✅ Created project: {project_id}")
        
        # Create test thread
        thread_id = str(uuid.uuid4())
        thread_data = {
            "thread_id": thread_id,
            "account_id": account_id,
            "project_id": project_id,
            "is_public": False
        }
        
        result = await client.table("threads").insert(thread_data).execute()
        
        if result.data:
            print(f"✅ Created test thread: {thread_id}")
            
            # Add a test message
            message_id = str(uuid.uuid4())
            message_data = {
                "message_id": message_id,
                "thread_id": thread_id,
                "type": "user",
                "is_llm_message": False,
                "content": {"text": "Hello! This is a test message for debugging."}
            }
            
            message_result = await client.table("messages").insert(message_data).execute()
            
            if message_result.data:
                print(f"✅ Added test message: {message_id}")
            
            return {
                "thread_id": thread_id,
                "account_id": account_id,
                "project_id": project_id,
                "message_id": message_id
            }
        else:
            print("❌ Failed to create thread")
            return None
            
    except Exception as e:
        print(f"❌ Error creating test thread: {e}")
        import traceback
        traceback.print_exc()
        return None


async def main():
    """Create test thread"""
    print("🚀 CREATE TEST THREAD FOR DEBUGGING")
    print("🔍 Creating thread for chat response debug")
    print()
    
    result = await create_test_thread()
    
    if result:
        print("\n" + "="*50)
        print("🎉 TEST THREAD CREATED SUCCESSFULLY!")
        print("="*50)
        print(f"Thread ID: {result['thread_id']}")
        print(f"Account ID: {result['account_id']}")
        print(f"Project ID: {result['project_id']}")
        print(f"Message ID: {result['message_id']}")
        print()
        print("🔧 Use this thread_id in debug scripts:")
        print(f"test_thread_id = '{result['thread_id']}'")
    else:
        print("\n❌ Failed to create test thread")
    
    return result


if __name__ == "__main__":
    asyncio.run(main())
