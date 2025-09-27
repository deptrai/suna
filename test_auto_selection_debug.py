#!/usr/bin/env python3
"""
Debug script to test auto model selection without context manager.
"""

import os
import sys
sys.path.append('backend')

# Set environment variables
os.environ['AUTO_MODEL_ENABLED'] = 'true'
os.environ['ENV_MODE'] = 'local'

from backend.core.ai_models.manager import model_manager

def test_auto_selection():
    """Test auto model selection logic."""
    
    print("🧪 Testing Auto Model Selection...")
    
    test_cases = [
        {
            "name": "Simple Query",
            "query": "Hello, how are you?",
            "expected": "gpt-4o-mini"
        },
        {
            "name": "Complex Query",
            "query": "Please analyze this complex codebase, implement a new feature with proper error handling, and create comprehensive unit tests",
            "expected": "gpt-4o"
        },
        {
            "name": "Empty Query",
            "query": "",
            "expected": "gpt-4o-mini"
        },
        {
            "name": "None Query",
            "query": None,
            "expected": "gpt-4o-mini"
        }
    ]
    
    for test_case in test_cases:
        print(f"\n📝 Test: {test_case['name']}")
        print(f"Query: '{test_case['query']}'")
        
        try:
            # Test model resolution with auto
            result = model_manager.resolve_model_id("auto", query=test_case['query'])
            print(f"✅ Result: {result}")
            
            if test_case['expected'] in result:
                print(f"✅ Expected model type found: {test_case['expected']}")
            else:
                print(f"⚠️ Expected {test_case['expected']}, got {result}")
                
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()
        
        print("-" * 50)

def test_direct_auto_selection():
    """Test direct auto selection method."""
    
    print("\n🔬 Testing Direct Auto Selection Method...")
    
    test_queries = [
        "Hello",
        "Please implement a complex algorithm with optimization and debug features",
        "",
        None
    ]
    
    for query in test_queries:
        print(f"\nQuery: '{query}'")
        try:
            result = model_manager._auto_select_model(query)
            print(f"✅ Direct result: {result}")
        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    print("🚀 Auto Model Selection Debug Test")
    print("=" * 60)
    
    # Test environment
    print(f"AUTO_MODEL_ENABLED: {os.getenv('AUTO_MODEL_ENABLED')}")
    print(f"ENV_MODE: {os.getenv('ENV_MODE')}")
    
    test_auto_selection()
    test_direct_auto_selection()
    
    print("\n✅ Debug test completed!")
