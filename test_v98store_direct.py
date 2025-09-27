#!/usr/bin/env python3
"""
Test v98store API directly to debug the issue.
"""

import requests
import json
import os
import sys
sys.path.append('backend')

from backend.core.utils.config import config

def test_v98store_direct():
    """Test v98store API directly."""
    
    print("🧪 Testing v98store API directly...")
    
    api_key = config.OPENAI_COMPATIBLE_API_KEY
    api_base = config.OPENAI_COMPATIBLE_API_BASE
    
    print(f"📝 API Key: {api_key[:10]}..." if api_key else "❌ No API Key")
    print(f"📝 API Base: {api_base}")
    
    if not api_key or not api_base:
        print("❌ Missing v98store credentials")
        return
    
    # Test 1: Simple request
    print("\n🔍 Test 1: Simple request...")
    
    try:
        response = requests.post(
            f"{api_base}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "user", "content": "Hello! This is a test message."}
                ],
                "max_tokens": 100,
                "temperature": 0.7
            },
            timeout=30
        )
        
        print(f"📊 Status Code: {response.status_code}")
        print(f"📊 Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Success!")
            print(f"📝 Response: {json.dumps(data, indent=2)}")
        else:
            print(f"❌ Error: {response.text}")
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        import traceback
        traceback.print_exc()

    # Test 2: Empty content request
    print("\n🔍 Test 2: Empty content request...")
    
    try:
        response = requests.post(
            f"{api_base}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "user", "content": ""}
                ],
                "max_tokens": 100,
                "temperature": 0.7
            },
            timeout=30
        )
        
        print(f"📊 Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Empty content works!")
            print(f"📝 Response: {json.dumps(data, indent=2)}")
        else:
            print(f"❌ Empty content error: {response.text}")
            
    except Exception as e:
        print(f"❌ Exception: {e}")

    # Test 3: No messages
    print("\n🔍 Test 3: No messages...")
    
    try:
        response = requests.post(
            f"{api_base}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [],
                "max_tokens": 100,
                "temperature": 0.7
            },
            timeout=30
        )
        
        print(f"📊 Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ No messages works!")
            print(f"📝 Response: {json.dumps(data, indent=2)}")
        else:
            print(f"❌ No messages error: {response.text}")
            
    except Exception as e:
        print(f"❌ Exception: {e}")

if __name__ == "__main__":
    test_v98store_direct()
