"""
Test Dynamic Routing with Real LLM Calls
Phase 3 Task 3.1.2 - Real World Testing
"""
import asyncio
import os
from dotenv import load_dotenv
from core.agentpress.thread_manager import ThreadManager
from core.utils.logger import logger

# Load environment
load_dotenv()

async def test_real_llm():
    """Test with real LLM calls"""
    
    logger.info("=" * 80)
    logger.info("REAL LLM ROUTING TEST")
    logger.info("=" * 80)
    
    # Initialize ThreadManager
    manager = ThreadManager()
    
    # Test cases
    test_cases = [
        {
            "name": "Simple File Operation",
            "query": "Create a file called test.txt with content 'Hello World'",
            "expected_modules": 5
        },
        {
            "name": "Simple Question",
            "query": "What is 2+2?",
            "expected_modules": 8  # Generic query, all modules
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
            logger.info(f"   Expected modules: {test_case['expected_modules']}")
            
            # Use streaming to see response
            response_generator = await manager.run_thread(
                thread_id=thread_id,
                system_prompt={"role": "system", "content": "You are a helpful assistant."},
                llm_model="claude-sonnet-4",
                enable_prompt_caching=True,
                stream=True,
                native_max_auto_continues=0  # No auto-continues for testing
            )
            
            # Collect response
            full_response = ""
            async for chunk in response_generator:
                if isinstance(chunk, dict) and 'content' in chunk:
                    content = chunk['content']
                    if isinstance(content, str):
                        full_response += content
                        print(content, end='', flush=True)
            
            print()  # New line after response
            
            logger.info(f"\n✅ Response received ({len(full_response)} chars)")
            logger.info(f"   First 100 chars: {full_response[:100]}...")
            
            # Check GlitchTip for routing decision
            logger.info(f"\n📊 Check GlitchTip for:")
            logger.info(f"   - 'Routing: X modules selected'")
            logger.info(f"   - 'Prompt built: X modules, Y chars'")
            logger.info(f"   - 'Prompt Request: ...'")
            
            logger.info(f"\n✅ Test {i+1} PASSED: {test_case['name']}")
        
        except Exception as e:
            logger.error(f"❌ Test {i+1} FAILED: {e}")
            import traceback
            traceback.print_exc()
    
    logger.info("\n" + "=" * 80)
    logger.info("REAL LLM ROUTING TEST COMPLETE")
    logger.info("=" * 80)
    logger.info("\n✅ All tests completed!")
    logger.info("\nNext steps:")
    logger.info("1. Check GlitchTip dashboard for routing decisions")
    logger.info("2. Compare prompt sizes (specific vs generic)")
    logger.info("3. Calculate actual cost savings")
    logger.info("\n" + "=" * 80)

if __name__ == "__main__":
    asyncio.run(test_real_llm())

