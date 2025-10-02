#!/usr/bin/env python3
"""
ENV LOADING TEST

Test if .env file is loaded properly and LLM can respond
"""
import os
from dotenv import load_dotenv
import asyncio


async def test_env_and_llm():
    """Test environment loading and LLM response"""
    print("🔧 ENV LOADING & LLM TEST")
    print("="*60)
    
    try:
        # Step 1: Load .env file explicitly
        print("📁 STEP 1: LOAD .ENV FILE")
        print("-" * 40)
        
        # Load .env file
        env_loaded = load_dotenv()
        print(f"📁 .env file loaded: {env_loaded}")
        
        # Check API keys after loading
        api_keys = {
            "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY"),
            "ANTHROPIC_API_KEY": os.getenv("ANTHROPIC_API_KEY"),
            "OPENAI_COMPATIBLE_API_KEY": os.getenv("OPENAI_COMPATIBLE_API_KEY"),
            "AUTO_MODEL_ENABLED": os.getenv("AUTO_MODEL_ENABLED")
        }
        
        keys_found = 0
        for key_name, key_value in api_keys.items():
            if key_value:
                if "API_KEY" in key_name:
                    print(f"✅ {key_name}: {'*' * 20}{key_value[-4:]}")
                else:
                    print(f"✅ {key_name}: {key_value}")
                keys_found += 1
            else:
                print(f"❌ {key_name}: Not set")
        
        print(f"\n📊 Keys/Settings Found: {keys_found}/{len(api_keys)}")
        
        if keys_found == 0:
            return {
                "success": False,
                "error": "No API keys found even after loading .env",
                "env_loaded": env_loaded
            }
        
        # Step 2: Test LLM with loaded keys
        print(f"\n🤖 STEP 2: TEST LLM WITH LOADED KEYS")
        print("-" * 40)
        
        try:
            from core.services.llm import make_llm_api_call, setup_api_keys
            
            print("✅ LLM service imported")
            
            # Setup API keys (should now find the loaded keys)
            setup_api_keys()
            print("✅ API keys setup completed")
            
            # Test with auto model (should work with openai-compatible)
            print("🔄 Testing LLM call with auto model...")
            
            test_messages = [
                {"role": "user", "content": "Hello! Please respond with exactly: 'Hi! I can help you with various tasks.'"}
            ]
            
            response = await make_llm_api_call(
                messages=test_messages,
                model_name="auto",  # Should select openai-compatible/gpt-4o-mini or gpt-4o
                max_tokens=100,
                temperature=0.1
            )
            
            if response and hasattr(response, 'choices') and response.choices:
                content = response.choices[0].message.content
                model_used = response.model

                print(f"✅ LLM response received!")
                print(f"🤖 Response: {content}")
                print(f"📊 Model used: {model_used}")

                return {
                    "success": True,
                    "env_loaded": env_loaded,
                    "keys_found": keys_found,
                    "llm_working": True,
                    "test_response": content,
                    "model_used": model_used,
                    "chat_can_respond": True
                }
            else:
                print(f"❌ LLM call returned empty response")
                print(f"📋 Full response: {response}")
                
                return {
                    "success": False,
                    "env_loaded": env_loaded,
                    "keys_found": keys_found,
                    "llm_working": False,
                    "error": "Empty LLM response",
                    "response": response
                }
                
        except Exception as e:
            print(f"❌ LLM test failed: {e}")
            import traceback
            traceback.print_exc()
            
            return {
                "success": False,
                "env_loaded": env_loaded,
                "keys_found": keys_found,
                "llm_working": False,
                "error": str(e)
            }
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return {"success": False, "error": str(e)}


async def main():
    """Run environment and LLM test"""
    print("🚀 ENV LOADING & LLM TEST")
    print("🔍 Testing if .env keys work and LLM responds")
    print()
    
    result = await test_env_and_llm()
    
    print("\n" + "="*60)
    print("📊 ENV LOADING & LLM TEST SUMMARY")
    print("="*60)
    
    if result.get("success", False):
        print("🎉 SUCCESS: LLM is working with .env keys!")
        print()
        print("✅ VERIFIED:")
        print(f"   📁 .env loaded: {'✅' if result.get('env_loaded') else '❌'}")
        print(f"   🔑 Keys found: {result.get('keys_found', 0)}")
        print(f"   🤖 LLM working: {'✅' if result.get('llm_working') else '❌'}")
        print(f"   📊 Model used: {result.get('model_used', 'N/A')}")
        print()
        print("💬 TEST RESPONSE:")
        print(f"   {result.get('test_response', 'N/A')}")
        print()
        print("🎯 ANSWER:")
        print("❓ 'chat chưa response mà'")
        print("✅ LLM CAN respond! Keys are working!")
        print("💡 Issue might be in agent run process or timing")
        
    else:
        print("❌ FAILED: Issues with environment or LLM")
        error = result.get("error", "Unknown error")
        print(f"   Error: {error}")
        print()
        print("📊 DETAILS:")
        print(f"   📁 .env loaded: {'✅' if result.get('env_loaded') else '❌'}")
        print(f"   🔑 Keys found: {result.get('keys_found', 0)}")
        print(f"   🤖 LLM working: {'✅' if result.get('llm_working') else '❌'}")
        print()
        print("🎯 ANSWER:")
        print("❓ 'chat chưa response mà'")
        print("❌ LLM has issues - Chat cannot respond properly")
        
        if result.get("response"):
            print(f"📋 LLM Response Debug: {result['response']}")
    
    return result


if __name__ == "__main__":
    asyncio.run(main())
