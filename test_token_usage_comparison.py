#!/usr/bin/env python3
"""
Test to compare token usage before and after optimization.
This simulates real usage scenarios and measures actual token savings.
"""

import sys
import asyncio
import json
sys.path.append('backend')

from core.agentpress.context_manager import ContextManager
from core.agentpress.tool_registry import ToolRegistry
from core.agentpress.tool import SchemaType
from litellm.utils import token_counter

# Mock comprehensive tool registry for realistic testing
class ComprehensiveTool:
    def get_schemas(self):
        return {
            'str-replace-editor': [type('Schema', (), {
                'schema_type': SchemaType.OPENAPI,
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
                'schema_type': SchemaType.OPENAPI,
                'schema': {
                    'type': 'function',
                    'function': {
                        'name': 'save-file',
                        'description': 'Save a new file with the specified content. This tool creates new files and writes content to them. It cannot modify existing files.',
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
                'schema_type': SchemaType.OPENAPI,
                'schema': {
                    'type': 'function',
                    'function': {
                        'name': 'view',
                        'description': 'View files and directories in the workspace. This tool allows you to examine the contents of files and list directory contents.',
                        'parameters': {
                            'type': 'object',
                            'properties': {
                                'path': {'type': 'string', 'description': 'Path to view'},
                                'type': {'type': 'string', 'description': 'Type of view operation'}
                            },
                            'required': ['path', 'type']
                        }
                    }
                }
            })()],
            'codebase-retrieval': [type('Schema', (), {
                'schema_type': SchemaType.OPENAPI,
                'schema': {
                    'type': 'function',
                    'function': {
                        'name': 'codebase-retrieval',
                        'description': 'Search and retrieve information from the codebase using advanced semantic search capabilities.',
                        'parameters': {
                            'type': 'object',
                            'properties': {
                                'information_request': {'type': 'string', 'description': 'Description of the information needed'}
                            },
                            'required': ['information_request']
                        }
                    }
                }
            })()],
            'web-search': [type('Schema', (), {
                'schema_type': SchemaType.OPENAPI,
                'schema': {
                    'type': 'function',
                    'function': {
                        'name': 'web-search',
                        'description': 'Search the web for information and return relevant results from various sources.',
                        'parameters': {
                            'type': 'object',
                            'properties': {
                                'query': {'type': 'string', 'description': 'Search query'},
                                'num_results': {'type': 'integer', 'description': 'Number of results to return'}
                            },
                            'required': ['query']
                        }
                    }
                }
            })()],
            'git_status_git': [type('Schema', (), {
                'schema_type': SchemaType.OPENAPI,
                'schema': {
                    'type': 'function',
                    'function': {
                        'name': 'git_status_git',
                        'description': 'Show the working tree status of a git repository including staged and unstaged changes.',
                        'parameters': {
                            'type': 'object',
                            'properties': {
                                'repo_path': {'type': 'string', 'description': 'Path to the git repository'}
                            },
                            'required': ['repo_path']
                        }
                    }
                }
            })()],
            'git_add_git': [type('Schema', (), {
                'schema_type': SchemaType.OPENAPI,
                'schema': {
                    'type': 'function',
                    'function': {
                        'name': 'git_add_git',
                        'description': 'Add files to the git staging area for the next commit.',
                        'parameters': {
                            'type': 'object',
                            'properties': {
                                'repo_path': {'type': 'string', 'description': 'Path to the git repository'},
                                'files': {'type': 'array', 'description': 'List of files to add'}
                            },
                            'required': ['repo_path', 'files']
                        }
                    }
                }
            })()],
            'launch-process': [type('Schema', (), {
                'schema_type': SchemaType.OPENAPI,
                'schema': {
                    'type': 'function',
                    'function': {
                        'name': 'launch-process',
                        'description': 'Launch a new process with a shell command for executing system operations.',
                        'parameters': {
                            'type': 'object',
                            'properties': {
                                'command': {'type': 'string', 'description': 'Shell command to execute'},
                                'cwd': {'type': 'string', 'description': 'Working directory'},
                                'wait': {'type': 'boolean', 'description': 'Whether to wait for completion'}
                            },
                            'required': ['command', 'wait', 'cwd']
                        }
                    }
                }
            })()],
            'interactive_feedback_MCP_Feedback_Enhanced': [type('Schema', (), {
                'schema_type': SchemaType.OPENAPI,
                'schema': {
                    'type': 'function',
                    'function': {
                        'name': 'interactive_feedback_MCP_Feedback_Enhanced',
                        'description': 'Get interactive feedback from the user about completed work and next steps.',
                        'parameters': {
                            'type': 'object',
                            'properties': {
                                'summary': {'type': 'string', 'description': 'Summary of work completed'},
                                'project_directory': {'type': 'string', 'description': 'Project directory path'}
                            },
                            'required': ['summary']
                        }
                    }
                }
            })()]
        }

async def test_token_usage_scenarios():
    """Test token usage across different scenarios."""
    print("🔍 Token Usage Comparison Test")
    print("=" * 60)
    
    # Initialize components
    cm = ContextManager()
    tr = ToolRegistry()
    tr.register_tool(ComprehensiveTool)
    
    # Test scenarios
    scenarios = [
        {
            "name": "Simple Question",
            "system_prompt": "You are a helpful AI assistant with comprehensive capabilities for coding, file operations, git management, web research, and general assistance. You have access to numerous tools and should use them appropriately to help users accomplish their tasks efficiently and effectively.",
            "messages": [
                {"role": "user", "content": "What is Python?"}
            ]
        },
        {
            "name": "Code Editing Request",
            "system_prompt": "You are a helpful AI assistant with comprehensive capabilities for coding, file operations, git management, web research, and general assistance. You have access to numerous tools and should use them appropriately to help users accomplish their tasks efficiently and effectively.",
            "messages": [
                {"role": "user", "content": "I need help editing a Python file"},
                {"role": "assistant", "content": "I'd be happy to help you edit a Python file. What specific changes do you need to make?"},
                {"role": "user", "content": "I want to add error handling to the main.py file around database operations"}
            ]
        },
        {
            "name": "Long Conversation",
            "system_prompt": "You are a helpful AI assistant with comprehensive capabilities for coding, file operations, git management, web research, and general assistance. You have access to numerous tools and should use them appropriately to help users accomplish their tasks efficiently and effectively.",
            "messages": [
                {"role": "user", "content": "Hi, I'm working on a Python project"},
                {"role": "assistant", "content": "Hello! I'd be happy to help with your Python project. What are you working on?"},
                {"role": "user", "content": "It's a web application using FastAPI"},
                {"role": "assistant", "content": "Great choice! FastAPI is excellent for building APIs. What specific help do you need?"},
                {"role": "user", "content": "I need to set up user authentication"},
                {"role": "assistant", "content": "I can help you implement authentication. Are you looking for JWT-based authentication?"},
                {"role": "user", "content": "Yes, JWT with user registration and login"},
                {"role": "assistant", "content": "Perfect! I'll help you create a complete JWT authentication system."},
                {"role": "user", "content": "Can you also help me create the database models?"},
                {"role": "assistant", "content": "Absolutely! I'll help you create the user models and database setup."},
                {"role": "user", "content": "And I need to add proper error handling throughout the application"}
            ]
        }
    ]
    
    results = []
    
    for scenario in scenarios:
        print(f"\n🧪 Testing: {scenario['name']}")
        
        # Prepare messages with system prompt
        messages = [{"role": "system", "content": scenario["system_prompt"]}] + scenario["messages"]
        user_query = scenario["messages"][-1]["content"]
        
        print(f"   Messages: {len(messages)}")
        print(f"   User query: '{user_query[:50]}...'")
        
        # BEFORE optimization
        print("\n   🔴 BEFORE Optimization:")
        
        # Count message tokens
        original_message_tokens = token_counter(model="gpt-4o", messages=messages)
        
        # Count tool tokens (all tools)
        all_tools = tr.get_openapi_schemas()
        all_tool_str = json.dumps(all_tools)
        all_tool_tokens = len(all_tool_str) // 4  # Rough estimate
        
        total_before = original_message_tokens + all_tool_tokens
        
        print(f"      Message tokens: {original_message_tokens}")
        print(f"      Tool tokens: {all_tool_tokens}")
        print(f"      Total tokens: {total_before}")
        
        # AFTER optimization
        print("\n   🟢 AFTER Optimization:")
        
        # 1. Message limiting
        limited_messages = cm.limit_recent_messages(messages, max_count=8)
        
        # 2. System prompt optimization
        optimized_system = cm.get_optimized_system_prompt(user_query, scenario["system_prompt"])
        optimized_messages = limited_messages.copy()
        if optimized_messages and optimized_messages[0].get('role') == 'system':
            optimized_messages[0] = {"role": "system", "content": optimized_system}
        
        optimized_message_tokens = token_counter(model="gpt-4o", messages=optimized_messages)
        
        # 3. Tool filtering and compression
        minimal_tools = tr.get_minimal_schemas(user_query)
        minimal_tool_str = json.dumps(minimal_tools)
        minimal_tool_tokens = len(minimal_tool_str) // 4
        
        total_after = optimized_message_tokens + minimal_tool_tokens
        
        print(f"      Message tokens: {original_message_tokens} -> {optimized_message_tokens}")
        print(f"      Tool tokens: {all_tool_tokens} -> {minimal_tool_tokens}")
        print(f"      Total tokens: {total_after}")
        
        # Calculate improvements
        message_reduction = (original_message_tokens - optimized_message_tokens) / original_message_tokens * 100 if original_message_tokens > 0 else 0
        tool_reduction = (all_tool_tokens - minimal_tool_tokens) / all_tool_tokens * 100 if all_tool_tokens > 0 else 0
        total_reduction = (total_before - total_after) / total_before * 100 if total_before > 0 else 0
        
        print(f"\n   📊 OPTIMIZATION RESULTS:")
        print(f"      Message reduction: {message_reduction:.1f}%")
        print(f"      Tool reduction: {tool_reduction:.1f}%")
        print(f"      Total reduction: {total_reduction:.1f}%")
        
        # Cost estimation
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
            'tokens_after': total_after,
            'tools_before': len(all_tools),
            'tools_after': len(minimal_tools)
        })
    
    return results

async def analyze_results(results):
    """Analyze and summarize results."""
    print(f"\n📊 COMPREHENSIVE ANALYSIS")
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
    
    # Detailed breakdown
    print(f"\n📋 DETAILED BREAKDOWN:")
    for result in sorted(results, key=lambda x: x['total_reduction'], reverse=True):
        print(f"   • {result['scenario']}: {result['total_reduction']:.1f}% reduction")
        print(f"     Tokens: {result['tokens_before']} -> {result['tokens_after']}")
        print(f"     Tools: {result['tools_before']} -> {result['tools_after']}")
        print(f"     Cost savings: {result['cost_savings']:.1f}%")
    
    return {
        'avg_total_reduction': avg_total,
        'avg_cost_savings': avg_cost,
        'best_reduction': best['total_reduction'],
        'worst_reduction': worst['total_reduction']
    }

async def main():
    """Run the comprehensive token usage test."""
    try:
        print("🚀 Comprehensive Token Usage Test Starting...")
        
        results = await test_token_usage_scenarios()
        summary = await analyze_results(results)
        
        print("\n" + "=" * 60)
        print("✅ COMPREHENSIVE TEST COMPLETED!")
        
        print(f"\n🎯 FINAL SUMMARY:")
        print(f"   • Average token reduction: {summary['avg_total_reduction']:.1f}%")
        print(f"   • Average cost savings: {summary['avg_cost_savings']:.1f}%")
        print(f"   • Best case: {summary['best_reduction']:.1f}% reduction")
        print(f"   • Worst case: {summary['worst_reduction']:.1f}% reduction")
        
        # Final evaluation
        if summary['avg_total_reduction'] >= 60:
            print("\n🎉 OUTSTANDING: 60%+ average optimization!")
            status = "PRODUCTION READY"
        elif summary['avg_total_reduction'] >= 40:
            print("\n🌟 EXCELLENT: 40-60% average optimization!")
            status = "READY FOR DEPLOYMENT"
        elif summary['avg_total_reduction'] >= 25:
            print("\n👍 VERY GOOD: 25-40% average optimization!")
            status = "GOOD FOR PRODUCTION"
        else:
            print("\n✅ GOOD: Meaningful optimization achieved!")
            status = "NEEDS MONITORING"
        
        print(f"\n🚦 FINAL STATUS: {status}")
        
        print(f"\n📋 RECOMMENDATIONS:")
        if summary['avg_total_reduction'] >= 40:
            print(f"   ✅ Deploy to production immediately")
            print(f"   ✅ Monitor token usage and quality metrics")
            print(f"   ✅ Consider this optimization a success")
        else:
            print(f"   ⚠️ Consider additional optimization techniques")
            print(f"   ⚠️ Monitor closely in production")
            print(f"   ⚠️ May need further tuning")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
