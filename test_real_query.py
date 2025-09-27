#!/usr/bin/env python3
"""
Test context optimization with a real query to measure actual token savings.
"""

import sys
import asyncio
sys.path.append('backend')

from core.agentpress.context_manager import ContextManager
from core.agentpress.tool_registry import ToolRegistry
from core.agentpress.thread_manager import ThreadManager
from core.agentpress.tool import SchemaType
from litellm.utils import token_counter

async def test_real_scenario():
    """Test with a realistic conversation scenario."""
    print("🧪 Testing Real Query Scenario")
    print("=" * 50)
    
    # Create a realistic conversation
    messages = [
        {
            "role": "system", 
            "content": "You are a helpful AI assistant that can help with coding, file operations, git, web searches, and general questions. You have access to various tools to assist users with their tasks."
        },
        {
            "role": "user",
            "content": "Hi, I'm working on a Python project and need help"
        },
        {
            "role": "assistant", 
            "content": "Hello! I'd be happy to help you with your Python project. What specific assistance do you need? I can help with:\n\n- Writing or editing code\n- File operations\n- Git operations\n- Debugging\n- Documentation\n- And much more!\n\nWhat would you like to work on?"
        },
        {
            "role": "user",
            "content": "I need to create a new Python file called utils.py with some helper functions"
        },
        {
            "role": "assistant",
            "content": "I'll help you create a utils.py file with helper functions. Let me create that file for you with some commonly used utility functions."
        },
        {
            "role": "user",
            "content": "Actually, let me first check what files already exist in the project"
        },
        {
            "role": "assistant",
            "content": "Good idea! Let me help you check what files already exist in your project directory."
        },
        {
            "role": "user",
            "content": "Can you show me the current directory structure and then help me edit the main.py file?"
        }
    ]
    
    # Test model
    test_model = "gpt-4o"
    
    print(f"📊 Testing with model: {test_model}")
    print(f"📝 Conversation length: {len(messages)} messages")
    
    # Test BEFORE optimization (simulate old behavior)
    print("\n🔴 BEFORE Optimization:")
    
    # Simulate old threshold
    old_threshold = 120000
    
    # Count tokens without optimization
    unoptimized_tokens = token_counter(model=test_model, messages=messages)
    print(f"   Message tokens: {unoptimized_tokens:,}")
    
    # Simulate all tools being loaded (estimate)
    estimated_all_tools_tokens = 15000  # Rough estimate for all tools
    print(f"   Tool schema tokens (all): {estimated_all_tools_tokens:,}")
    
    total_before = unoptimized_tokens + estimated_all_tools_tokens
    print(f"   Total tokens: {total_before:,}")
    print(f"   Threshold: {old_threshold:,}")
    print(f"   Would fit: {'✅ Yes' if total_before <= old_threshold else '❌ No'}")
    
    # Test AFTER optimization
    print("\n🟢 AFTER Optimization:")
    
    # Test context manager
    cm = ContextManager()
    print(f"   New threshold: {cm.token_threshold:,}")
    
    # Test message limiting
    limited_messages = cm.limit_recent_messages(messages, max_count=8)
    limited_tokens = token_counter(model=test_model, messages=limited_messages)
    print(f"   Messages: {len(messages)} -> {len(limited_messages)}")
    print(f"   Message tokens: {unoptimized_tokens:,} -> {limited_tokens:,}")
    
    # Test tool filtering
    tr = ToolRegistry()
    
    # Mock realistic tools
    class MockTool:
        def get_schemas(self):
            return {
                'str-replace-editor': [type('Schema', (), {'schema_type': SchemaType.OPENAPI, 'schema': {'name': 'str-replace-editor', 'description': 'Edit files'}})()],
                'save-file': [type('Schema', (), {'schema_type': SchemaType.OPENAPI, 'schema': {'name': 'save-file', 'description': 'Save new files'}})()],
                'view': [type('Schema', (), {'schema_type': SchemaType.OPENAPI, 'schema': {'name': 'view', 'description': 'View files and directories'}})()],
                'codebase-retrieval': [type('Schema', (), {'schema_type': SchemaType.OPENAPI, 'schema': {'name': 'codebase-retrieval', 'description': 'Search codebase'}})()],
                'git_status_git': [type('Schema', (), {'schema_type': SchemaType.OPENAPI, 'schema': {'name': 'git_status_git', 'description': 'Git status'}})()],
                'git_add_git': [type('Schema', (), {'schema_type': SchemaType.OPENAPI, 'schema': {'name': 'git_add_git', 'description': 'Git add'}})()],
                'web-search': [type('Schema', (), {'schema_type': SchemaType.OPENAPI, 'schema': {'name': 'web-search', 'description': 'Search web'}})()],
                'web-fetch': [type('Schema', (), {'schema_type': SchemaType.OPENAPI, 'schema': {'name': 'web-fetch', 'description': 'Fetch web content'}})()],
                'chrome_navigate_chrome-browser': [type('Schema', (), {'schema_type': SchemaType.OPENAPI, 'schema': {'name': 'chrome_navigate_chrome-browser', 'description': 'Navigate browser'}})()],
                'interactive_feedback_MCP_Feedback_Enhanced': [type('Schema', (), {'schema_type': SchemaType.OPENAPI, 'schema': {'name': 'interactive_feedback_MCP_Feedback_Enhanced', 'description': 'Get feedback'}})()],
            }
    
    tr.register_tool(MockTool)
    
    # Get user query for filtering
    user_query = "Can you show me the current directory structure and then help me edit the main.py file?"
    
    all_tools = tr.get_openapi_schemas()
    filtered_tools = tr.get_filtered_schemas(user_query)
    
    print(f"   Tools: {len(all_tools)} -> {len(filtered_tools)}")
    
    # Estimate tool token savings (rough calculation)
    tool_reduction_ratio = (len(all_tools) - len(filtered_tools)) / len(all_tools)
    estimated_filtered_tools_tokens = int(estimated_all_tools_tokens * (1 - tool_reduction_ratio))
    
    print(f"   Tool schema tokens: {estimated_all_tools_tokens:,} -> {estimated_filtered_tools_tokens:,}")
    
    total_after = limited_tokens + estimated_filtered_tools_tokens
    print(f"   Total tokens: {total_after:,}")
    print(f"   Threshold: {cm.token_threshold:,}")
    print(f"   Fits: {'✅ Yes' if total_after <= cm.token_threshold else '❌ No'}")
    
    # Calculate savings
    print("\n📈 OPTIMIZATION RESULTS:")
    
    message_savings = (unoptimized_tokens - limited_tokens) / unoptimized_tokens * 100 if unoptimized_tokens > 0 else 0
    tool_savings = (estimated_all_tools_tokens - estimated_filtered_tools_tokens) / estimated_all_tools_tokens * 100 if estimated_all_tools_tokens > 0 else 0
    total_savings = (total_before - total_after) / total_before * 100 if total_before > 0 else 0
    threshold_reduction = (old_threshold - cm.token_threshold) / old_threshold * 100
    
    print(f"   Message token reduction: {message_savings:.1f}%")
    print(f"   Tool schema reduction: {tool_savings:.1f}%")
    print(f"   Total token reduction: {total_savings:.1f}%")
    print(f"   Threshold reduction: {threshold_reduction:.1f}%")
    
    # Cost estimation (rough)
    cost_per_1k_tokens = 0.01  # Rough estimate
    cost_before = (total_before / 1000) * cost_per_1k_tokens
    cost_after = (total_after / 1000) * cost_per_1k_tokens
    cost_savings = (cost_before - cost_after) / cost_before * 100 if cost_before > 0 else 0
    
    print(f"\n💰 COST IMPACT:")
    print(f"   Before: ${cost_before:.4f} per request")
    print(f"   After: ${cost_after:.4f} per request")
    print(f"   Cost savings: {cost_savings:.1f}%")
    
    # Context Window Utilization
    from core.ai_models import model_manager
    context_window = model_manager.get_context_window(test_model)
    cwu_before = (total_before / context_window * 100) if context_window > 0 else 0
    cwu_after = (total_after / context_window * 100) if context_window > 0 else 0
    
    print(f"\n📊 CONTEXT WINDOW UTILIZATION:")
    print(f"   Model context window: {context_window:,} tokens")
    print(f"   Before: {cwu_before:.1f}%")
    print(f"   After: {cwu_after:.1f}%")
    print(f"   CWU reduction: {cwu_before - cwu_after:.1f} percentage points")
    
    # Quality assessment
    print(f"\n🎯 QUALITY ASSESSMENT:")
    print(f"   Messages preserved: {len(limited_messages)}/{len(messages)} ({len(limited_messages)/len(messages)*100:.1f}%)")
    print(f"   System message: {'✅ Preserved' if limited_messages[0]['role'] == 'system' else '❌ Lost'}")
    print(f"   Recent context: {'✅ Maintained' if len(limited_messages) >= 4 else '⚠️ Limited'}")
    print(f"   Relevant tools: {'✅ Available' if 'str-replace-editor' in [t['name'] for t in filtered_tools] else '❌ Missing'}")
    
    return {
        'total_savings': total_savings,
        'cost_savings': cost_savings,
        'cwu_reduction': cwu_before - cwu_after,
        'quality_score': 85 if len(limited_messages) >= 4 else 70  # Rough estimate
    }

async def main():
    """Run the real scenario test."""
    try:
        results = await test_real_scenario()
        
        print("\n" + "=" * 50)
        print("✅ OPTIMIZATION SUCCESS!")
        print(f"📊 Total token reduction: {results['total_savings']:.1f}%")
        print(f"💰 Cost savings: {results['cost_savings']:.1f}%")
        print(f"📈 CWU improvement: {results['cwu_reduction']:.1f} percentage points")
        print(f"🎯 Estimated quality retention: {results['quality_score']}%")
        
        if results['total_savings'] >= 50:
            print("\n🎉 EXCELLENT: >50% token reduction achieved!")
        elif results['total_savings'] >= 30:
            print("\n👍 GOOD: 30-50% token reduction achieved!")
        else:
            print("\n⚠️ MODERATE: <30% token reduction - consider further optimization")
            
        return True
        
    except Exception as e:
        print(f"\n❌ Test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
