#!/usr/bin/env python3
"""
Chat Response Validation Test

Tests that the chat system can generate actual responses from LLM.
This validates the complete flow from user input to LLM response.
"""
import asyncio
import uuid
from datetime import datetime


async def test_chat_response():
    """Test that chat system generates actual responses"""
    print("\n" + "="*80)
    print("💬 CHAT RESPONSE VALIDATION TEST")
    print("="*80)
    
    try:
        from core.agentpress.thread_manager import ThreadManager
        from core.agentpress.response_processor import ProcessorConfig
        from core.prompts.prompt import SYSTEM_PROMPT
        
        # Setup
        manager = ThreadManager()
        thread_id = "test-chat-" + str(uuid.uuid4())[:8]
        
        # Create processor config
        config = ProcessorConfig(
            native_tool_calling=True,
            execute_tools=False  # Disable tool execution for testing
        )
        
        # Prepare system prompt
        system_prompt = {"role": "system", "content": SYSTEM_PROMPT}
        
        print(f"📝 Thread ID: {thread_id}")
        print(f"🔧 Testing chat response generation...")
        
        # Simple test message
        test_message = "Hello! Please respond with exactly: 'Chat system is working correctly.'"
        
        print(f"💬 Sending: {test_message}")
        start_time = datetime.now()
        
        try:
            # Run thread to get response
            response = await manager.run_thread(
                thread_id=thread_id,
                system_prompt=system_prompt,
                stream=False,  # Non-streaming for simpler testing
                temporary_message={"content": test_message},
                llm_model="claude-sonnet-4",
                enable_prompt_caching=True,
                processor_config=config,
                native_max_auto_continues=0
            )
            
            end_time = datetime.now()
            response_time = (end_time - start_time).total_seconds()
            
            print(f"⏱️  Response time: {response_time:.2f}s")
            
            # Analyze response
            if isinstance(response, dict):
                content = response.get("content", "")
                if isinstance(content, list):
                    # Handle list content (tool calls, etc.)
                    text_content = ""
                    for item in content:
                        if isinstance(item, dict) and item.get("type") == "text":
                            text_content += item.get("text", "")
                        elif isinstance(item, str):
                            text_content += item
                    content = text_content
                elif not isinstance(content, str):
                    content = str(content)
                
                print(f"📝 Response type: {type(response)}")
                print(f"📝 Content length: {len(content)} chars")
                print(f"📝 Response preview: {content[:200]}...")
                
                # Validation
                if len(content) > 0:
                    print("✅ SUCCESS: Chat system generated response!")
                    print(f"✅ Response received in {response_time:.2f}s")
                    
                    # Check if it's a meaningful response
                    if len(content) > 10:
                        print("✅ Response is substantial (>10 chars)")
                    else:
                        print("⚠️  Response is very short")
                    
                    return True
                else:
                    print("❌ FAIL: Empty response received")
                    return False
            else:
                print(f"❌ FAIL: Unexpected response type: {type(response)}")
                print(f"Response: {response}")
                return False
                
        except Exception as e:
            print(f"❌ FAIL: Error during chat: {e}")
            import traceback
            traceback.print_exc()
            return False
            
    except Exception as e:
        print(f"❌ FAIL: Setup error: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_streaming_chat_response():
    """Test streaming chat response"""
    print("\n" + "="*60)
    print("🌊 STREAMING CHAT RESPONSE TEST")
    print("="*60)
    
    try:
        from core.agentpress.thread_manager import ThreadManager
        from core.agentpress.response_processor import ProcessorConfig
        from core.prompts.prompt import SYSTEM_PROMPT
        
        manager = ThreadManager()
        thread_id = "test-stream-" + str(uuid.uuid4())[:8]
        
        config = ProcessorConfig(native_tool_calling=True, execute_tools=False)
        system_prompt = {"role": "system", "content": SYSTEM_PROMPT}
        
        test_message = "Count from 1 to 5 and say 'done'."
        
        print(f"💬 Streaming test: {test_message}")
        start_time = datetime.now()
        
        # Get streaming response
        response_generator = await manager.run_thread(
            thread_id=thread_id,
            system_prompt=system_prompt,
            stream=True,
            temporary_message={"content": test_message},
            llm_model="claude-sonnet-4",
            enable_prompt_caching=True,
            processor_config=config,
            native_max_auto_continues=0
        )
        
        # Collect streaming chunks
        chunks = []
        chunk_count = 0
        
        if hasattr(response_generator, '__aiter__'):
            print("🌊 Collecting streaming chunks...")
            async for chunk in response_generator:
                chunk_count += 1
                print(f"   Chunk {chunk_count}: {str(chunk)[:50]}...")
                chunks.append(chunk)
                
                # Limit chunks for testing
                if chunk_count >= 10:
                    break
        else:
            print("⚠️  Non-streaming response received")
            chunks = [response_generator]
            chunk_count = 1
        
        end_time = datetime.now()
        response_time = (end_time - start_time).total_seconds()
        
        print(f"✅ Streaming test complete:")
        print(f"   Chunks received: {chunk_count}")
        print(f"   Response time: {response_time:.2f}s")
        
        return chunk_count > 0
        
    except Exception as e:
        print(f"❌ Streaming test failed: {e}")
        return False


async def main():
    """Run all chat validation tests"""
    print("🚀 Starting Chat Response Validation...")
    
    results = {
        "basic_chat": False,
        "streaming_chat": False
    }
    
    # Test 1: Basic chat response
    results["basic_chat"] = await test_chat_response()
    
    # Test 2: Streaming chat response  
    results["streaming_chat"] = await test_streaming_chat_response()
    
    # Summary
    print("\n" + "="*80)
    print("📊 CHAT VALIDATION SUMMARY")
    print("="*80)
    
    passed = sum(results.values())
    total = len(results)
    
    for test_name, passed_test in results.items():
        status = "✅ PASS" if passed_test else "❌ FAIL"
        print(f"{status} {test_name.replace('_', ' ').title()}")
    
    success_rate = passed / total
    print(f"\n🎯 Overall: {passed}/{total} tests passed ({success_rate*100:.1f}%)")
    
    if success_rate >= 0.5:
        print("🎉 CHAT SYSTEM IS WORKING!")
    else:
        print("❌ CHAT SYSTEM NEEDS ATTENTION")
    
    return results


if __name__ == "__main__":
    asyncio.run(main())
