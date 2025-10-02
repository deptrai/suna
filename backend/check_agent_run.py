#!/usr/bin/env python3
"""
CHECK AGENT RUN STATUS

Check the status of agent runs in database
"""
import asyncio
from dotenv import load_dotenv

load_dotenv()


async def check_agent_runs():
    """Check agent run status"""
    print("🔍 CHECKING AGENT RUN STATUS")
    print("="*50)
    
    try:
        from core.services.supabase import DBConnection
        
        db = DBConnection()
        await db.initialize()
        client = await db.client
        
        # Get recent agent runs
        result = await client.table("agent_runs").select("*").order("created_at", desc=True).limit(10).execute()
        
        if result.data:
            print(f"📊 Found {len(result.data)} recent agent runs:")
            print()
            
            for run in result.data:
                print(f"🤖 Agent Run: {run['id']}")
                print(f"   Thread: {run['thread_id']}")
                print(f"   Status: {run['status']}")
                print(f"   Started: {run['started_at']}")
                print(f"   Completed: {run.get('completed_at', 'N/A')}")
                if run.get('error'):
                    print(f"   ❌ Error: {run['error'][:200]}...")
                print()
        else:
            print("❌ No agent runs found")
            
        # Check messages for test thread
        thread_id = "5bf0095c-058a-44d0-b3d5-2e042c62e1f9"
        messages = await client.table("messages").select("*").eq("thread_id", thread_id).order("created_at", desc=True).limit(10).execute()
        
        print(f"\n📨 Messages in test thread:")
        print(f"Total: {len(messages.data)}")
        for msg in messages.data:
            print(f"   - {msg['type']}: {str(msg['content'])[:100]}...")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()


async def main():
    """Run check"""
    await check_agent_runs()


if __name__ == "__main__":
    asyncio.run(main())
