#!/usr/bin/env python3
"""Quick test to verify tool calling fix."""

import sys
sys.path.append('backend')

from core.agentpress.context_manager import ContextManager
from core.agentpress.tool_registry import ToolRegistry
from core.run import ProcessorConfig

def test_fix():
    print("🔧 Testing Tool Calling Fix")
    print("=" * 40)
    
    # Test 1: Context Manager
    print("\n1️⃣ Context Manager:")
    cm = ContextManager()
    print(f"   Token threshold: {cm.token_threshold:,}")
    
    # Test 2: Tool Registry
    print("\n2️⃣ Tool Registry:")
    tr = ToolRegistry()
    
    query = "Research about gold for investment opportunities"
    filtered = tr.get_filtered_schemas(query)
    all_tools = tr.get_openapi_schemas()
    
    print(f"   All tools: {len(all_tools)}")
    print(f"   Filtered tools: {len(filtered)}")
    
    # Test 3: ProcessorConfig
    print("\n3️⃣ ProcessorConfig:")
    config = ProcessorConfig(
        xml_tool_calling=True,
        native_tool_calling=True,
        execute_tools=True,
        execute_on_stream=True,
        tool_execution_strategy="parallel",
        xml_adding_strategy="user_message"
    )
    print(f"   native_tool_calling: {config.native_tool_calling}")
    
    # Assessment
    print("\n📊 Assessment:")
    checks = [
        cm.token_threshold == 25000,
        len(filtered) >= 5,
        len(filtered) <= 25,
        config.native_tool_calling,
        hasattr(tr, 'get_filtered_schemas')
    ]
    
    passed = sum(checks)
    total = len(checks)
    
    print(f"   Checks passed: {passed}/{total}")
    
    if passed == total:
        print("   🎉 ALL CHECKS PASSED!")
        print("   ✅ Tool calling should work")
        return True
    else:
        print("   ⚠️ SOME CHECKS FAILED!")
        return False

if __name__ == "__main__":
    success = test_fix()
    print(f"\nResult: {'SUCCESS' if success else 'FAILED'}")
    sys.exit(0 if success else 1)
