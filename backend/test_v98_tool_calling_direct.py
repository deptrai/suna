#!/usr/bin/env python3
"""
Direct test of v98store gpt-4o tool calling support
Tests with 1, 2, and 3 tools to find the exact limit
"""

import requests
import json

API_URL = "https://v98store.com/v1/chat/completions"
API_KEY = "sk-Righ5E8wjF9WMrNITGhjBZlgS17vzdvbxYK4S1IjaJu4soIi"

# Define test tools
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for information",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": "Create a new task",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Task title"
                    },
                    "description": {
                        "type": "string",
                        "description": "Task description"
                    }
                },
                "required": ["title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get weather information",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "City name"
                    }
                },
                "required": ["location"]
            }
        }
    }
]

def test_tool_calling(num_tools: int):
    """Test v98store with specific number of tools"""
    print(f"\n{'='*60}")
    print(f"🧪 TEST: {num_tools} tool(s)")
    print(f"{'='*60}")
    
    tools = TOOLS[:num_tools]
    
    payload = {
        "model": "gpt-4o",
        "messages": [
            {
                "role": "user",
                "content": "Hãy dùng web_search tool để tìm kiếm thông tin về PancakeSwap"
            }
        ],
        "tools": tools,
        "tool_choice": "auto",
        "max_tokens": 500,
        "temperature": 0.7
    }
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }
    
    print(f"\n📤 REQUEST:")
    print(f"   Model: gpt-4o")
    print(f"   Tools: {num_tools}")
    print(f"   Tool names: {[t['function']['name'] for t in tools]}")
    
    try:
        response = requests.post(API_URL, headers=headers, json=payload, timeout=30)
        
        print(f"\n📥 RESPONSE:")
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            # Check if tool was called
            message = data.get('choices', [{}])[0].get('message', {})
            tool_calls = message.get('tool_calls')
            
            print(f"   ✅ SUCCESS!")
            print(f"   Tool calls: {tool_calls is not None}")
            
            if tool_calls:
                print(f"   🎉 TOOL CALLED!")
                print(f"   Tool name: {tool_calls[0]['function']['name']}")
                print(f"   Arguments: {tool_calls[0]['function']['arguments']}")
                return True
            else:
                print(f"   ❌ NO TOOL CALLED")
                print(f"   Response: {message.get('content', '')[:200]}...")
                return False
        else:
            print(f"   ❌ ERROR: {response.status_code}")
            print(f"   Response: {response.text[:500]}")
            return False
            
    except Exception as e:
        print(f"   ❌ EXCEPTION: {e}")
        return False

def test_without_tools():
    """Test v98store without tools (baseline)"""
    print(f"\n{'='*60}")
    print(f"🧪 TEST: No tools (baseline)")
    print(f"{'='*60}")
    
    payload = {
        "model": "gpt-4o",
        "messages": [
            {
                "role": "user",
                "content": "bạn có đang hoạt động không?"
            }
        ],
        "max_tokens": 50,
        "temperature": 0.7
    }
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }
    
    print(f"\n📤 REQUEST:")
    print(f"   Model: gpt-4o")
    print(f"   Tools: 0")
    
    try:
        response = requests.post(API_URL, headers=headers, json=payload, timeout=30)
        
        print(f"\n📥 RESPONSE:")
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            message = data.get('choices', [{}])[0].get('message', {})
            print(f"   ✅ SUCCESS!")
            print(f"   Response: {message.get('content', '')}")
            return True
        else:
            print(f"   ❌ ERROR: {response.status_code}")
            print(f"   Response: {response.text[:500]}")
            return False
            
    except Exception as e:
        print(f"   ❌ EXCEPTION: {e}")
        return False

if __name__ == "__main__":
    print("🔍 V98STORE GPT-4O TOOL CALLING TEST")
    print("="*60)
    
    # Test baseline (no tools)
    baseline_ok = test_without_tools()
    
    if not baseline_ok:
        print("\n❌ Baseline test failed! API might be down.")
        exit(1)
    
    # Test with different numbers of tools
    results = {}
    for num_tools in [1, 2, 3]:
        results[num_tools] = test_tool_calling(num_tools)
    
    # Summary
    print(f"\n{'='*60}")
    print("📊 SUMMARY")
    print(f"{'='*60}")
    print(f"   Baseline (no tools): ✅")
    for num_tools, success in results.items():
        status = "✅ WORKS" if success else "❌ FAILS"
        print(f"   {num_tools} tool(s): {status}")
    
    # Conclusion
    print(f"\n{'='*60}")
    print("🎯 CONCLUSION")
    print(f"{'='*60}")
    
    if all(results.values()):
        print("   ✅ v98store gpt-4o SUPPORTS tool calling with 1-3 tools!")
        print("   🤔 But why doesn't it work in production?")
        print("   → Need to check system prompt or other parameters")
    elif results[1]:
        print("   ⚠️  v98store gpt-4o ONLY supports 1 tool")
        print("   → Limit to 1 tool in production")
    else:
        print("   ❌ v98store gpt-4o DOES NOT support tool calling")
        print("   → Switch to Claude or OpenAI GPT-4")

