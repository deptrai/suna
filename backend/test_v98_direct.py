#!/usr/bin/env python3
"""
TEST V98STORE DIRECT

Test v98store API directly with simple call
"""
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()


async def test_v98_direct():
    """Test v98store API directly"""
    print("🔧 V98STORE DIRECT TEST")
    print("="*50)
    
    try:
        from core.services.llm import make_llm_api_call
        
        # Test with simple message
        messages = [
            {"role": "user", "content": "Hello! Please respond with exactly: 'Hi from v98store!'"}
        ]
        
        print("🔄 Testing with openai-compatible/gpt-4o-mini...")
        
        response = await make_llm_api_call(
            messages=messages,
            model_name="openai-compatible/gpt-4o-mini",
            max_tokens=50,
            temperature=0.1,
            stream=False
        )
        
        if response and hasattr(response, 'choices') and response.choices:
            content = response.choices[0].message.content
            print(f"✅ Response: {content}")
            return True
        else:
            print(f"❌ No response: {response}")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_model_resolution():
    """Test model resolution"""
    print("\n🔧 MODEL RESOLUTION TEST")
    print("="*50)
    
    try:
        from core.ai_models.manager import model_manager
        
        test_models = [
            "auto",
            "openai-compatible/gpt-4o-mini",
            "gpt-4o-mini"
        ]
        
        for model in test_models:
            resolved = model_manager.resolve_model_id(model)
            print(f"📊 {model} → {resolved}")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()


async def main():
    """Run tests"""
    print("🚀 V98STORE API TEST")
    print("🔍 Testing direct API call to fix chat response")
    print()
    
    await test_model_resolution()
    
    result = await test_v98_direct()
    
    if result:
        print("\n🎉 V98STORE API WORKING!")
        print("✅ Chat should be able to respond now")
    else:
        print("\n❌ V98STORE API ISSUES")
        print("🔧 Need to debug further")
    
    return result


if __name__ == "__main__":
    asyncio.run(main())
