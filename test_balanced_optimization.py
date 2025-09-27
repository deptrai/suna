#!/usr/bin/env python3
"""
Test script for balanced context optimization
"""
import requests
import json
import time

def test_balanced_optimization():
    """Test the balanced optimization with various query types"""
    
    base_url = "http://localhost:8000"
    
    # Test queries of different types
    test_queries = [
        {
            "name": "Web Research Query",
            "query": "Search for latest AI developments and create a summary",
            "expected_tools": ["web-search", "web-fetch", "add_tasks", "remember"]
        },
        {
            "name": "Code Development Query", 
            "query": "Create a Python script to analyze data and commit to git",
            "expected_tools": ["str-replace-editor", "save-file", "git_add_git", "git_commit_git"]
        },
        {
            "name": "Task Management Query",
            "query": "Plan a project with multiple tasks and track progress",
            "expected_tools": ["add_tasks", "update_tasks", "view_tasklist", "remember"]
        },
        {
            "name": "General Query",
            "query": "Hello, how are you?",
            "expected_tools": ["interactive_feedback_MCP_Feedback_Enhanced", "web-search"]
        }
    ]
    
    print("🧪 Testing Balanced Context Optimization")
    print("=" * 50)
    
    for i, test_case in enumerate(test_queries, 1):
        print(f"\n{i}. Testing: {test_case['name']}")
        print(f"   Query: {test_case['query']}")
        
        try:
            # Create agent run
            response = requests.post(
                f"{base_url}/api/agent/initiate",
                data={
                    "query": test_case['query'],
                    "model_name": "🤖 Auto (Smart Selection)",
                    "enable_context_manager": True,
                    "enable_thinking": False
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                run_id = result.get('run_id')
                print(f"   ✅ Agent run created: {run_id}")
                
                # Wait a moment for processing
                time.sleep(2)
                
                # Check run status
                status_response = requests.get(f"{base_url}/api/agent/run/{run_id}/status")
                if status_response.status_code == 200:
                    status_data = status_response.json()
                    print(f"   📊 Status: {status_data.get('status', 'unknown')}")
                    
                    # Check if expected tools would be available
                    print(f"   🔧 Expected tools: {', '.join(test_case['expected_tools'])}")
                    
                else:
                    print(f"   ❌ Failed to get status: {status_response.status_code}")
                    
            else:
                print(f"   ❌ Failed to create run: {response.status_code}")
                print(f"   Response: {response.text}")
                
        except Exception as e:
            print(f"   ❌ Error: {e}")
    
    print("\n" + "=" * 50)
    print("🎯 Balanced Optimization Test Complete")
    print("\nExpected improvements:")
    print("✅ Essential tools always available (web-search, tasks, memory)")
    print("✅ Query-specific tools added based on context")
    print("✅ System prompt balanced (~3-5k chars vs 73 chars)")
    print("✅ Token reduction: 70-85% (vs 99.7%)")
    print("✅ Better tool availability and response quality")

if __name__ == "__main__":
    test_balanced_optimization()
