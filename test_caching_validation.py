"""
Test script to validate prompt caching is working
Phase 1 Task 1.1.1
"""
import asyncio
import sys
import os

# Add backend to path
backend_path = os.path.join(os.path.dirname(__file__), 'backend')
sys.path.insert(0, backend_path)

from core.agentpress.thread_manager import ThreadManager
from core.utils.logger import logger

async def test_caching():
    """Test if prompt caching is working"""
    
    print("=" * 80)
    print("PHASE 1 TASK 1.1.1: Validate Prompt Caching")
    print("=" * 80)
    
    # Create thread manager
    manager = ThreadManager()
    
    # Create a test thread
    thread_id = await manager.create_thread(
        account_id="test_account",
        is_public=False
    )
    
    print(f"\n✅ Created test thread: {thread_id}")
    
    # Send a test message
    print("\n📤 Sending test message...")
    
    test_message = "Hello, can you help me create a Python file?"
    
    await manager.add_message(
        thread_id=thread_id,
        role="user",
        content=test_message
    )
    
    # Run thread with caching ENABLED
    print("\n🔥 Running thread with caching ENABLED...")
    
    system_prompt = {
        "role": "system",
        "content": "You are a helpful AI assistant."
    }
    
    try:
        response = await manager.run_thread(
            thread_id=thread_id,
            system_prompt=system_prompt,
            stream=False,
            llm_model="claude-sonnet-4",
            enable_prompt_caching=True,  # ✅ ENABLE CACHING
            native_max_auto_continues=0
        )
        
        print("\n✅ Response received!")
        print(f"Response type: {type(response)}")
        
        if isinstance(response, dict):
            print(f"Response keys: {response.keys()}")
            if 'content' in response:
                print(f"Content length: {len(response['content'])}")
        
        # Check logs for caching activity
        print("\n" + "=" * 80)
        print("CHECKING LOGS FOR CACHING ACTIVITY")
        print("=" * 80)
        
        import subprocess
        result = subprocess.run(
            ["tail", "-100", "logs/backend.log"],
            capture_output=True,
            text=True
        )
        
        cache_logs = [line for line in result.stdout.split('\n') if '🔥' in line or 'Block' in line or 'cache' in line.lower()]
        
        if cache_logs:
            print("\n✅ CACHING LOGS FOUND:")
            for log in cache_logs[-10:]:  # Last 10 cache-related logs
                print(f"  {log}")
        else:
            print("\n⚠️  NO CACHING LOGS FOUND")
            print("This might mean:")
            print("  1. Caching is not being triggered")
            print("  2. System prompt is too small (<1024 tokens)")
            print("  3. Model doesn't support caching")
        
        print("\n" + "=" * 80)
        print("TEST COMPLETE")
        print("=" * 80)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_caching())

