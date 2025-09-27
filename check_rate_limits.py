#!/usr/bin/env python3
"""
Check rate limits for OpenAI and OpenRouter APIs.
"""

import requests
import json
import os
import sys
sys.path.append('backend')

from backend.core.utils.config import config

def check_openrouter_limits():
    """Check OpenRouter rate limits."""
    
    print("🔍 Checking OpenRouter Rate Limits...")
    
    api_key = config.OPENROUTER_API_KEY
    if not api_key:
        print("❌ No OpenRouter API key found")
        return
    
    try:
        response = requests.get(
            "https://openrouter.ai/api/v1/key",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            timeout=10
        )
        
        print(f"📊 Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ OpenRouter Key Info:")
            print(json.dumps(data, indent=2))
        else:
            print(f"❌ Error: {response.text}")
            
    except Exception as e:
        print(f"❌ Exception: {e}")

def check_openai_limits():
    """Check OpenAI rate limits (via usage endpoint)."""
    
    print("\n🔍 Checking OpenAI Rate Limits...")
    
    api_key = config.OPENAI_API_KEY
    if not api_key:
        print("❌ No OpenAI API key found")
        return
    
    try:
        # OpenAI doesn't have a direct rate limit endpoint, but we can check usage
        response = requests.get(
            "https://api.openai.com/v1/usage",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            timeout=10
        )
        
        print(f"📊 Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ OpenAI Usage Info:")
            print(json.dumps(data, indent=2))
        else:
            print(f"❌ Error: {response.text}")
            
    except Exception as e:
        print(f"❌ Exception: {e}")

def check_v98store_limits():
    """Check v98store limits."""
    
    print("\n🔍 Checking v98store Limits...")
    
    api_key = config.OPENAI_COMPATIBLE_API_KEY
    if not api_key:
        print("❌ No v98store API key found")
        return
    
    try:
        response = requests.get(
            f"https://v98store.com/check-balance?key={api_key}",
            timeout=10
        )
        
        print(f"📊 Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ v98store Balance:")
            print(f"   Remaining: ${data.get('remain_quota', 'N/A')}")
            print(f"   Used: ${data.get('used_quota', 'N/A')}")
        else:
            print(f"❌ Error: {response.text}")
            
    except Exception as e:
        print(f"❌ Exception: {e}")

def test_simple_openai_call():
    """Test a simple OpenAI call to check if it works."""
    
    print("\n🧪 Testing Simple OpenAI Call...")
    
    api_key = config.OPENAI_API_KEY
    if not api_key:
        print("❌ No OpenAI API key found")
        return
    
    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "user", "content": "Hello! This is a test."}
                ],
                "max_tokens": 50
            },
            timeout=30
        )
        
        print(f"📊 Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            content = data['choices'][0]['message']['content']
            print(f"✅ OpenAI Response: {content}")
        else:
            print(f"❌ Error: {response.text}")
            
    except Exception as e:
        print(f"❌ Exception: {e}")

if __name__ == "__main__":
    print("🚀 Rate Limits Check")
    print("=" * 60)
    
    check_openrouter_limits()
    check_openai_limits()
    check_v98store_limits()
    test_simple_openai_call()
    
    print("\n✅ Check completed!")
