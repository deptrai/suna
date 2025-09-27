#!/usr/bin/env python3
"""
Simple test to verify context optimization is working
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from core.agentpress.context_manager import ContextManager
from core.agentpress.tool_registry import ToolRegistry

def test_context_manager():
    """Test ContextManager basic functionality"""
    print("🧪 Testing ContextManager...")
    
    try:
        cm = ContextManager()
        print("✅ ContextManager created successfully")
        
        # Test message compression
        messages = [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Hello, how are you?"}
        ]
        
        compressed = cm.compress_messages(messages, "openai/gpt-4", max_tokens=50000)
        print(f"✅ Message compression: {len(messages)} -> {len(compressed)} messages")
        
        # Test system prompt optimization
        base_prompt = "You are a helpful AI assistant. " * 100  # Long prompt
        optimized = cm.get_optimized_system_prompt("test query", base_prompt)
        print(f"✅ System prompt optimization: {len(base_prompt)} -> {len(optimized)} chars")
        
        return True
        
    except Exception as e:
        print(f"❌ ContextManager test failed: {e}")
        return False

def test_tool_registry():
    """Test ToolRegistry optimization functionality"""
    print("\n🧪 Testing ToolRegistry...")
    
    try:
        tr = ToolRegistry()
        print("✅ ToolRegistry created successfully")
        
        # Test filtered schemas
        filtered = tr.get_filtered_schemas("code editing")
        print(f"✅ Filtered schemas: {len(filtered)} tools for 'code editing'")
        
        # Test minimal schemas
        minimal = tr.get_minimal_schemas("test query")
        print(f"✅ Minimal schemas: {len(minimal)} tools with compression")
        
        return True
        
    except Exception as e:
        print(f"❌ ToolRegistry test failed: {e}")
        return False

def main():
    """Run all tests"""
    print("🚀 Starting Context Optimization Tests\n")
    
    success = True
    
    # Test ContextManager
    success &= test_context_manager()
    
    # Test ToolRegistry
    success &= test_tool_registry()
    
    print(f"\n{'🎉 ALL TESTS PASSED!' if success else '❌ SOME TESTS FAILED!'}")
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())
