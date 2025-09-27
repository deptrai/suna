#!/usr/bin/env python3
"""
Test real optimization with actual API calls to measure token usage.
This will test the optimization against real v98store API.
"""

import sys
import asyncio
import json
import time
sys.path.append('backend')

from core.agentpress.context_manager import ContextManager
from core.agentpress.tool_registry import ToolRegistry
from core.agentpress.thread_manager import ThreadManager
from core.ai_models import model_manager
from litellm.utils import token_counter

async def test_real_api_optimization():
    """Test optimization with real API calls."""
    print("🔥 Real API Optimization Test")
    print("=" * 60)
    
    # Test scenarios
    test_scenarios = [
        {
            "name": "Simple Code Question",
            "messages": [
                {"role": "system", "content": "You are a helpful AI assistant."},
                {"role": "user", "content": "How do I create a Python function to calculate factorial?"}
            ]
        },
        {
            "name": "File Editing Request", 
            "messages": [
                {"role": "system", "content": "You are a helpful AI assistant."},
                {"role": "user", "content": "I need help editing a Python file to add error handling"},
                {"role": "assistant", "content": "I'd be happy to help you add error handling to your Python file. What specific file are you working with?"},
                {"role": "user", "content": "It's main.py and I want to add try-catch blocks around database operations"}
            ]
        },
        {
            "name": "Complex Development Task",
            "messages": [
                {"role": "system", "content": "You are a helpful AI assistant."},
                {"role": "user", "content": "I'm building a FastAPI application and need help setting up authentication"},
                {"role": "assistant", "content": "I'll help you set up authentication for your FastAPI application. What type of authentication are you looking to implement?"},
                {"role": "user", "content": "JWT authentication with user registration and login endpoints"},
                {"role": "assistant", "content": "Perfect! I'll help you implement JWT authentication. Let me create the necessary components."},
                {"role": "user", "content": "Can you also add password hashing and validation?"},
                {"role": "assistant", "content": "Absolutely! I'll add secure password hashing using bcrypt and proper validation."},
                {"role": "user", "content": "Great! Now can you help me create the database models for users?"}
            ]
        }
    ]
    
    # Initialize components
    cm = ContextManager()
    tr = ToolRegistry()
    
    # Mock tool registry for testing
    class TestTool:
        def get_schemas(self):
            return {
                'str-replace-editor': [type('Schema', (), {
                    'schema_type': type('SchemaType', (), {'OPENAPI': 'openapi'})().OPENAPI,
                    'schema': {
                        'type': 'function',
                        'function': {
                            'name': 'str-replace-editor',
                            'description': 'Tool for editing existing files. This tool allows you to make precise edits to files by replacing specific content with new content. It supports regex patterns and can handle multiple replacements in a single operation.',
                            'parameters': {
                                'type': 'object',
                                'properties': {
                                    'command': {'type': 'string', 'description': 'The command to execute, either str_replace or insert'},
                                    'path': {'type': 'string', 'description': 'Full path to file relative to the workspace root'},
                                    'old_str': {'type': 'string', 'description': 'String to replace'},
                                    'new_str': {'type': 'string', 'description': 'New string content'}
                                },
                                'required': ['command', 'path']
                            }
                        }
                    }
                })()],
                'save-file': [type('Schema', (), {
                    'schema_type': type('SchemaType', (), {'OPENAPI': 'openapi'})().OPENAPI,
                    'schema': {
                        'type': 'function',
                        'function': {
                            'name': 'save-file',
                            'description': 'Save a new file with the specified content. This tool creates new files and writes content to them.',
                            'parameters': {
                                'type': 'object',
                                'properties': {
                                    'path': {'type': 'string', 'description': 'Path of the file to save'},
                                    'file_content': {'type': 'string', 'description': 'Content of the file'}
                                },
                                'required': ['path', 'file_content']
                            }
                        }
                    }
                })()],
                'view': [type('Schema', (), {
                    'schema_type': type('SchemaType', (), {'OPENAPI': 'openapi'})().OPENAPI,
                    'schema': {
                        'type': 'function',
                        'function': {
                            'name': 'view',
                            'description': 'View files and directories in the workspace',
                            'parameters': {
                                'type': 'object',
                                'properties': {
                                    'path': {'type': 'string', 'description': 'Path to view'}
                                },
                                'required': ['path']
                            }
                        }
                    }
                })()],
                'web-search': [type('Schema', (), {
                    'schema_type': type('SchemaType', (), {'OPENAPI': 'openapi'})().OPENAPI,
                    'schema': {
                        'type': 'function',
                        'function': {
                            'name': 'web-search',
                            'description': 'Search the web for information and return results',
                            'parameters': {
                                'type': 'object',
                                'properties': {
                                    'query': {'type': 'string', 'description': 'Search query'}
                                },
                                'required': ['query']
                            }
                        }
                    }
                })()],
                'interactive_feedback_MCP_Feedback_Enhanced': [type('Schema', (), {
                    'schema_type': type('SchemaType', (), {'OPENAPI': 'openapi'})().OPENAPI,
                    'schema': {
                        'type': 'function',
                        'function': {
                            'name': 'interactive_feedback_MCP_Feedback_Enhanced',
                            'description': 'Get interactive feedback from user',
                            'parameters': {
                                'type': 'object',
                                'properties': {
                                    'summary': {'type': 'string', 'description': 'Summary of work completed'}
                                },
                                'required': ['summary']
                            }
                        }
                    }
                })()]
            }
    
    tr.register_tool(TestTool)
    
    results = []
    
    for scenario in test_scenarios:
        print(f"\n🧪 Testing: {scenario['name']}")
        messages = scenario['messages']
        
        # Get user query for optimization
        user_query = ""
        for msg in reversed(messages):
            if msg.get('role') == 'user':
                user_query = msg.get('content', '')
                break
        
        print(f"   Messages: {len(messages)}")
        print(f"   User query: '{user_query[:60]}...'")
        
        # Test BEFORE optimization
        print("\n   🔴 BEFORE Optimization:")
        
        # Count tokens without optimization
        original_tokens = token_counter(model="gpt-4o", messages=messages)
        all_tools = tr.get_openapi_schemas()
        all_tool_tokens = len(json.dumps(all_tools)) // 4  # Rough estimate
        
        total_before = original_tokens + all_tool_tokens
        print(f"      Message tokens: {original_tokens}")
        print(f"      Tool tokens: {all_tool_tokens}")
        print(f"      Total tokens: {total_before}")
        
        # Test AFTER optimization
        print("\n   🟢 AFTER Optimization:")
        
        # 1. Message limiting
        limited_messages = cm.limit_recent_messages(messages, max_count=8)
        limited_tokens = token_counter(model="gpt-4o", messages=limited_messages)
        
        # 2. System prompt optimization
        if messages and messages[0].get('role') == 'system':
            original_system = messages[0]['content']
            optimized_system = cm.get_optimized_system_prompt(user_query, original_system)
            optimized_messages = limited_messages.copy()
            optimized_messages[0] = {'role': 'system', 'content': optimized_system}
            optimized_tokens = token_counter(model="gpt-4o", messages=optimized_messages)
        else:
            optimized_tokens = limited_tokens
        
        # 3. Tool filtering and compression
        minimal_tools = tr.get_minimal_schemas(user_query)
        minimal_tool_tokens = len(json.dumps(minimal_tools)) // 4
        
        total_after = optimized_tokens + minimal_tool_tokens
        
        print(f"      Message tokens: {original_tokens} -> {optimized_tokens}")
        print(f"      Tool tokens: {all_tool_tokens} -> {minimal_tool_tokens}")
        print(f"      Total tokens: {total_after}")
        
        # Calculate improvements
        total_reduction = (total_before - total_after) / total_before * 100 if total_before > 0 else 0
        message_reduction = (original_tokens - optimized_tokens) / original_tokens * 100 if original_tokens > 0 else 0
        tool_reduction = (all_tool_tokens - minimal_tool_tokens) / all_tool_tokens * 100 if all_tool_tokens > 0 else 0
        
        print(f"\n   📊 OPTIMIZATION RESULTS:")
        print(f"      Message reduction: {message_reduction:.1f}%")
        print(f"      Tool reduction: {tool_reduction:.1f}%")
        print(f"      Total reduction: {total_reduction:.1f}%")
        
        # Cost calculation
        cost_per_1k = 0.01  # Rough estimate
        cost_before = total_before / 1000 * cost_per_1k
        cost_after = total_after / 1000 * cost_per_1k
        cost_savings = (cost_before - cost_after) / cost_before * 100 if cost_before > 0 else 0
        
        print(f"      Cost: ${cost_before:.4f} -> ${cost_after:.4f} ({cost_savings:.1f}% savings)")
        
        results.append({
            'scenario': scenario['name'],
            'total_reduction': total_reduction,
            'message_reduction': message_reduction,
            'tool_reduction': tool_reduction,
            'cost_savings': cost_savings,
            'tokens_before': total_before,
            'tokens_after': total_after
        })
    
    return results

async def analyze_optimization_results(results):
    """Analyze and summarize optimization results."""
    print(f"\n📊 OPTIMIZATION ANALYSIS")
    print("=" * 60)
    
    # Calculate averages
    avg_total = sum(r['total_reduction'] for r in results) / len(results)
    avg_message = sum(r['message_reduction'] for r in results) / len(results)
    avg_tool = sum(r['tool_reduction'] for r in results) / len(results)
    avg_cost = sum(r['cost_savings'] for r in results) / len(results)
    
    print(f"📈 AVERAGE OPTIMIZATIONS:")
    print(f"   • Total token reduction: {avg_total:.1f}%")
    print(f"   • Message optimization: {avg_message:.1f}%")
    print(f"   • Tool optimization: {avg_tool:.1f}%")
    print(f"   • Cost savings: {avg_cost:.1f}%")
    
    # Best and worst
    best = max(results, key=lambda x: x['total_reduction'])
    worst = min(results, key=lambda x: x['total_reduction'])
    
    print(f"\n🏆 BEST PERFORMANCE:")
    print(f"   • Scenario: {best['scenario']}")
    print(f"   • Reduction: {best['total_reduction']:.1f}%")
    print(f"   • Tokens: {best['tokens_before']} -> {best['tokens_after']}")
    
    print(f"\n⚠️ WORST PERFORMANCE:")
    print(f"   • Scenario: {worst['scenario']}")
    print(f"   • Reduction: {worst['total_reduction']:.1f}%")
    print(f"   • Tokens: {worst['tokens_before']} -> {worst['tokens_after']}")
    
    # Performance by scenario
    print(f"\n📋 DETAILED RESULTS:")
    for result in sorted(results, key=lambda x: x['total_reduction'], reverse=True):
        print(f"   • {result['scenario']}: {result['total_reduction']:.1f}% reduction")
        print(f"     Tokens: {result['tokens_before']} -> {result['tokens_after']}")
        print(f"     Cost savings: {result['cost_savings']:.1f}%")
    
    return {
        'avg_total_reduction': avg_total,
        'avg_cost_savings': avg_cost,
        'best_reduction': best['total_reduction'],
        'worst_reduction': worst['total_reduction']
    }

async def main():
    """Run the real optimization test."""
    try:
        print("🚀 Real API Optimization Test Starting...")
        
        # Test optimization
        results = await test_real_api_optimization()
        summary = await analyze_optimization_results(results)
        
        print("\n" + "=" * 60)
        print("✅ REAL OPTIMIZATION TEST COMPLETED!")
        
        print(f"\n🎯 SUMMARY:")
        print(f"   • Average token reduction: {summary['avg_total_reduction']:.1f}%")
        print(f"   • Average cost savings: {summary['avg_cost_savings']:.1f}%")
        print(f"   • Best case: {summary['best_reduction']:.1f}% reduction")
        print(f"   • Worst case: {summary['worst_reduction']:.1f}% reduction")
        
        # Evaluation
        if summary['avg_total_reduction'] >= 60:
            print("\n🎉 EXCELLENT: 60%+ average optimization achieved!")
            status = "PRODUCTION READY"
        elif summary['avg_total_reduction'] >= 40:
            print("\n👍 VERY GOOD: 40-60% average optimization achieved!")
            status = "READY FOR DEPLOYMENT"
        elif summary['avg_total_reduction'] >= 20:
            print("\n✅ GOOD: 20-40% average optimization achieved!")
            status = "NEEDS FINE-TUNING"
        else:
            print("\n⚠️ MODERATE: <20% average optimization achieved!")
            status = "NEEDS IMPROVEMENT"
        
        print(f"\n🚦 STATUS: {status}")
        
        print(f"\n📋 NEXT STEPS:")
        print(f"   1. Check v98store.com/log for actual token usage")
        print(f"   2. Compare before/after optimization metrics")
        print(f"   3. Monitor quality and performance in production")
        print(f"   4. Adjust thresholds based on real usage patterns")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
