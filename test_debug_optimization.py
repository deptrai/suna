#!/usr/bin/env python3
"""
Debug test để check optimization có hoạt động không
"""
import requests
import json
import time

def test_optimization_debug():
    """Test optimization với debug logs"""
    
    print("🔧 TESTING OPTIMIZATION DEBUG")
    print("=" * 50)
    
    # Test 1: Check API endpoint
    url = "http://localhost:8000/api/agent/initiate"
    
    data = {
        "prompt": "Hello, can you help me with a simple task?",
        "enable_context_manager": True,
        "stream": False
    }
    
    print(f"📤 Sending request to: {url}")
    print(f"📋 Data: {json.dumps(data, indent=2)}")
    
    try:
        response = requests.post(url, data=data)
        print(f"📥 Response status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Success! Response keys: {list(result.keys())}")
            
            # Check for token usage
            if 'token_usage' in result:
                token_usage = result['token_usage']
                print(f"🎯 Token Usage: {token_usage}")
                
                prompt_tokens = token_usage.get('prompt_tokens', 0)
                if prompt_tokens < 5000:
                    print(f"✅ OPTIMIZATION WORKING! Input tokens: {prompt_tokens}")
                else:
                    print(f"❌ OPTIMIZATION NOT WORKING! Input tokens: {prompt_tokens}")
            else:
                print("⚠️ No token_usage in response")
                
        else:
            print(f"❌ Error: {response.status_code}")
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Exception: {e}")

def test_context_manager_import():
    """Test context manager import"""
    print("\n🔧 TESTING CONTEXT MANAGER IMPORT")
    print("=" * 50)

    try:
        import sys
        sys.path.append('./backend')
        from core.agentpress.context_manager import ContextManager
        cm = ContextManager()
        print("✅ ContextManager imported successfully")

        # Test optimization method
        test_prompt = "This is a very long system prompt that should be optimized for better performance and reduced token usage."
        optimized = cm.get_optimized_system_prompt("code help", test_prompt)
        print(f"📝 Original: {len(test_prompt)} chars")
        print(f"📝 Optimized: {len(optimized)} chars")

        if len(optimized) <= len(test_prompt):
            print("✅ System prompt optimization working")
        else:
            print("❌ System prompt optimization not working")

    except Exception as e:
        print(f"❌ Import error: {e}")

def test_thread_manager_import():
    """Test thread manager import"""
    print("\n🔧 TESTING THREAD MANAGER IMPORT")
    print("=" * 50)

    try:
        import sys
        sys.path.append('./backend')
        from core.agentpress.thread_manager import ThreadManager
        print("✅ ThreadManager imported successfully")

    except Exception as e:
        print(f"❌ Import error: {e}")

def check_current_changes():
    """Check current changes in files"""
    print("\n🔧 CHECKING CURRENT CHANGES")
    print("=" * 50)

    files_to_check = [
        "backend/core/agent_runs.py",
        "backend/core/agentpress/thread_manager.py",
        "backend/core/run.py",
        "backend/run_agent_background.py"
    ]

    for file_path in files_to_check:
        try:
            with open(file_path, 'r') as f:
                content = f.read()

            # Check for debug logs
            if "🔧 OPTIMIZATION DEBUG" in content:
                print(f"✅ {file_path}: Has optimization debug logs")
            else:
                print(f"❌ {file_path}: Missing optimization debug logs")

            # Check for enable_context_manager=True
            if "enable_context_manager: Optional[bool] = Form(True)" in content:
                print(f"✅ {file_path}: Has enable_context_manager=True")
            elif "enable_context_manager: bool = True" in content:
                print(f"✅ {file_path}: Has enable_context_manager=True")
            else:
                print(f"⚠️ {file_path}: Check enable_context_manager setting")

        except Exception as e:
            print(f"❌ {file_path}: Error reading file - {e}")

if __name__ == "__main__":
    check_current_changes()
    test_context_manager_import()
    test_thread_manager_import()
    # test_optimization_debug()  # Skip API test for now
