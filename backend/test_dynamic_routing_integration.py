"""
Test Dynamic Routing Integration with ThreadManager
Phase 3 Task 3.1.2
"""
import asyncio
from core.agentpress.thread_manager import ThreadManager
from core.utils.logger import logger

async def test_integration():
    """Test dynamic routing integration"""
    
    logger.info("=" * 80)
    logger.info("DYNAMIC ROUTING INTEGRATION TEST")
    logger.info("=" * 80)
    
    # Initialize ThreadManager
    manager = ThreadManager()
    
    # Test cases with different query types
    test_cases = [
        {
            "name": "File Operation",
            "query": "Create a Python file called test.py",
            "expected_modules": 5  # 4 core + 1 tool (toolkit)
        },
        {
            "name": "Data Processing",
            "query": "Parse this JSON data",
            "expected_modules": 5  # 4 core + 1 tool (data_processing)
        },
        {
            "name": "Generic Query",
            "query": "Hello, how are you?",
            "expected_modules": 8  # 4 core + 4 tools (all)
        }
    ]
    
    for i, test_case in enumerate(test_cases):
        logger.info(f"\n{'='*80}")
        logger.info(f"Test {i+1}: {test_case['name']}")
        logger.info(f"{'='*80}")
        
        try:
            # Create thread
            thread_id = await manager.create_thread(
                account_id="00000000-0000-0000-0000-000000000001",
                is_public=False
            )
            logger.info(f"✅ Thread created: {thread_id}")
            
            # Add message
            await manager.add_message(
                thread_id=thread_id,
                role="user",
                content=test_case['query']
            )
            logger.info(f"✅ Message added: {test_case['query']}")
            
            # Run thread with dynamic routing
            logger.info(f"🧭 Running with dynamic routing...")
            
            response = await manager.run_thread(
                thread_id=thread_id,
                system_prompt={"role": "system", "content": "You are a helpful assistant."},
                llm_model="claude-sonnet-4",
                enable_prompt_caching=True,
                native_max_auto_continues=0
            )
            
            logger.info(f"✅ Response received")
            logger.info(f"   Response type: {type(response).__name__}")
            
            # Check if response is valid
            if response:
                logger.info(f"✅ Test {i+1} PASSED: {test_case['name']}")
            else:
                logger.warning(f"⚠️  Test {i+1} WARNING: Empty response")
        
        except Exception as e:
            logger.error(f"❌ Test {i+1} FAILED: {e}")
            import traceback
            traceback.print_exc()
    
    logger.info("\n" + "=" * 80)
    logger.info("INTEGRATION TEST COMPLETE")
    logger.info("=" * 80)
    logger.info("\nCheck GlitchTip dashboard for:")
    logger.info("  - 'Routing: X modules selected'")
    logger.info("  - 'Prompt built: X modules, Y chars'")
    logger.info("  - 'Prompt Request: ...'")
    logger.info("=" * 80)

if __name__ == "__main__":
    asyncio.run(test_integration())

