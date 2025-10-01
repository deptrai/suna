#!/usr/bin/env python3
"""
Test v98store API with different tool counts to find the limit.
"""

import asyncio
import litellm
import os


async def test_with_tool_count(count: int):
    """Test v98store API with specific number of tools."""
    
    api_key = os.getenv('OPENAI_COMPATIBLE_API_KEY', 'sk-Righ5E8wjF9WMrNITGhjBZlgS17vzdvbxYK4S1IjaJu4soIi')
    api_base = os.getenv('OPENAI_COMPATIBLE_API_BASE', 'https://v98store.com/v1')
    
    messages = [
        {"role": "user", "content": "Search for Python information"}
    ]
    
    # Generate N simple tools
    tools = []
    for i in range(count):
        tools.append({
            "type": "function",
            "function": {
                "name": f"tool_{i}",
                "description": f"Tool number {i}",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"}
                    }
                }
            }
        })
    
    print(f"\n{'='*60}")
    print(f"Testing with {count} tools")
    print(f"{'='*60}")
    
    try:
        response = await litellm.acompletion(
            model="gpt-4o",
            messages=messages,
            api_key=api_key,
            api_base=api_base,
            custom_llm_provider="openai",
            max_tokens=100,
            temperature=0.7,
            tools=tools,
            timeout=30  # 30 second timeout
        )
        
        print(f"✅ SUCCESS with {count} tools!")
        
        message = response.choices[0].message
        if hasattr(message, 'tool_calls') and message.tool_calls:
            print(f"🔧 Tool calls: {len(message.tool_calls)}")
        else:
            print(f"📝 No tool calls (direct response)")
        
        return True
        
    except Exception as e:
        print(f"❌ FAILED with {count} tools!")
        print(f"Error: {str(e)[:200]}...")
        return False


async def main():
    """Test with different tool counts."""
    
    print("\n🚀 V98STORE API TOOL COUNT TEST")
    print("="*60)
    print("Finding the maximum number of tools v98store can handle")
    print("="*60)
    
    # Test with increasing tool counts
    test_counts = [1, 5, 10, 15, 20, 25, 30]
    
    results = {}
    
    for count in test_counts:
        success = await test_with_tool_count(count)
        results[count] = success
        
        # Stop if we hit a failure
        if not success:
            print(f"\n⚠️  Failed at {count} tools. Testing lower counts...")
            break
        
        # Small delay between tests
        await asyncio.sleep(2)
    
    # Summary
    print(f"\n\n📊 SUMMARY")
    print("="*60)
    
    for count, success in results.items():
        status = "✅ SUCCESS" if success else "❌ FAILED"
        print(f"{status}: {count} tools")
    
    # Find max successful count
    successful_counts = [c for c, s in results.items() if s]
    if successful_counts:
        max_count = max(successful_counts)
        print(f"\n🎯 Maximum successful tool count: {max_count}")
        print(f"💡 Recommendation: Limit tools to {max_count} or less for v98store API")
    else:
        print(f"\n❌ No successful tests! v98store API may not support tools at all.")


if __name__ == "__main__":
    asyncio.run(main())

