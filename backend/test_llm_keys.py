#!/usr/bin/env python3
"""
LLM API KEYS TEST

Check if LLM API keys are configured:
1. Check environment variables
2. Test LLM service directly
3. Diagnose why chat doesn't respond

This answers: "chat chưa response mà" - likely due to missing API keys
"""
import os
import asyncio


async def test_llm_keys():
    """Test LLM API keys and service"""
    print("🔑 LLM API KEYS TEST")
    print("="*60)
    
    try:
        # Step 1: Check environment variables
        print("🔧 STEP 1: ENVIRONMENT VARIABLES")
        print("-" * 40)
        
        api_keys = {
            "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY"),
            "ANTHROPIC_API_KEY": os.getenv("ANTHROPIC_API_KEY"),
            "GOOGLE_API_KEY": os.getenv("GOOGLE_API_KEY"),
            "AZURE_API_KEY": os.getenv("AZURE_API_KEY"),
            "COHERE_API_KEY": os.getenv("COHERE_API_KEY")
        }
        
        keys_found = 0
        for key_name, key_value in api_keys.items():
            if key_value:
                print(f"✅ {key_name}: {'*' * 20}{key_value[-4:]}")
                keys_found += 1
            else:
                print(f"❌ {key_name}: Not set")
        
        print(f"\n📊 API Keys Found: {keys_found}/{len(api_keys)}")
        
        if keys_found == 0:
            print("❌ NO LLM API KEYS FOUND!")
            print("💡 This is why chat doesn't respond")
            return {
                "success": False,
                "keys_found": 0,
                "error": "No LLM API keys configured",
                "reason": "Chat cannot respond without API keys"
            }
        
        # Step 2: Test LLM service
        print(f"\n🤖 STEP 2: TEST LLM SERVICE")
        print("-" * 40)
        
        try:
            from core.services.llm import make_llm_api_call, setup_api_keys
            
            print("✅ LLM service imported successfully")
            
            # Setup API keys
            setup_api_keys()
            print("✅ API keys setup called")
            
            # Test simple LLM call
            print("🔄 Testing simple LLM call...")
            
            test_messages = [
                {"role": "user", "content": "Hello! Please respond with just 'Hi there!'"}
            ]
            
            # Use auto model (should select appropriate model)
            response = await make_llm_api_call(
                messages=test_messages,
                model="auto",
                max_tokens=50,
                temperature=0.1
            )
            
            if response and response.get("content"):
                print(f"✅ LLM response received!")
                print(f"🤖 Response: {response['content']}")
                
                return {
                    "success": True,
                    "keys_found": keys_found,
                    "llm_working": True,
                    "test_response": response['content'],
                    "reason": "LLM is working - chat should respond"
                }
            else:
                print(f"❌ LLM call failed or empty response")
                print(f"📋 Response: {response}")
                
                return {
                    "success": False,
                    "keys_found": keys_found,
                    "llm_working": False,
                    "error": "LLM call failed",
                    "reason": "LLM not working properly"
                }
                
        except ImportError as e:
            print(f"❌ Cannot import LLM service: {e}")
            return {
                "success": False,
                "keys_found": keys_found,
                "error": f"Import error: {e}",
                "reason": "LLM service not available"
            }
        except Exception as e:
            print(f"❌ LLM test failed: {e}")
            return {
                "success": False,
                "keys_found": keys_found,
                "llm_working": False,
                "error": str(e),
                "reason": "LLM service error"
            }
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return {"success": False, "error": str(e)}


async def main():
    """Run LLM keys test"""
    print("🚀 LLM API KEYS TEST")
    print("🔍 Checking why chat doesn't respond")
    print()
    
    result = await test_llm_keys()
    
    print("\n" + "="*60)
    print("📊 LLM API KEYS TEST SUMMARY")
    print("="*60)
    
    keys_found = result.get("keys_found", 0)
    
    if result.get("success", False):
        print("🎉 SUCCESS: LLM is working!")
        print()
        print("✅ VERIFIED:")
        print(f"   🔑 API Keys: {keys_found} found")
        print(f"   🤖 LLM Service: {'✅' if result.get('llm_working') else '❌'}")
        print(f"   💬 Test Response: {result.get('test_response', 'N/A')}")
        print()
        print("🎯 ANSWER:")
        print("❓ 'chat chưa response mà'")
        print("✅ LLM is working! Chat SHOULD be able to respond!")
        print("💡 Issue might be:")
        print("   - Agent run not completing properly")
        print("   - Threading/async issues")
        print("   - Database connection problems")
        print("   - Need to wait longer for response")
        
    else:
        print("❌ FAILED: LLM issues found")
        error = result.get("error", "Unknown error")
        reason = result.get("reason", "Unknown reason")
        
        print(f"   Error: {error}")
        print(f"   Reason: {reason}")
        print()
        print("🎯 ANSWER:")
        print("❓ 'chat chưa response mà'")
        
        if keys_found == 0:
            print("❌ Chat CANNOT respond - No API keys!")
            print("💡 SOLUTION:")
            print("   1. Get API key from OpenAI or Anthropic")
            print("   2. Set environment variable:")
            print("      export OPENAI_API_KEY='your-key-here'")
            print("      or")
            print("      export ANTHROPIC_API_KEY='your-key-here'")
            print("   3. Restart backend server")
            print("   4. Chat will then respond!")
        else:
            print(f"⚠️  Chat might not respond - API keys found ({keys_found}) but LLM service issues")
            print("💡 SOLUTION:")
            print("   1. Check API key validity")
            print("   2. Check API provider status")
            print("   3. Check network connectivity")
            print("   4. Check API quotas/credits")
    
    return result


if __name__ == "__main__":
    asyncio.run(main())
