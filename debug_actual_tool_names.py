#!/usr/bin/env python3
"""
Debug script to check actual tool names registered in the tool registry
"""

import sys
import os
sys.path.append('./backend')

def debug_tool_registry():
    """Debug tool registry to see actual tool names"""
    print("🔍 DEBUGGING TOOL REGISTRY")
    print("=" * 60)

    try:
        from core.run import ToolManager
        from core.agentpress.thread_manager import ThreadManager

        # Create thread manager and tool manager to simulate real registration
        thread_manager = ThreadManager()
        tool_manager = ToolManager(thread_manager, project_id="test-project", thread_id="test-thread")

        print("🔧 Registering tools...")
        # Register all tools like in production
        tool_manager.register_all_tools()

        registry = thread_manager.tool_registry

        print(f"📊 Total tools registered: {len(registry.tools)}")
        print("\n🔧 ACTUAL TOOL NAMES:")
        print("-" * 40)
        
        # List all actual tool names
        tool_names = list(registry.tools.keys())
        tool_names.sort()
        
        for i, tool_name in enumerate(tool_names, 1):
            print(f"{i:2d}. {tool_name}")
        
        print("\n🎯 ESSENTIAL TOOLS ANALYSIS:")
        print("-" * 40)
        
        # Check essential tools from current implementation
        essential_tools = [
            'interactive_feedback_MCP_Feedback_Enhanced',
            'web_search', 'scrape_webpage',  # Web research
            'create_tasks', 'update_tasks', 'view_tasks',  # Task management
            'remember', 'create_entities_memory',  # Memory
            'str_replace', 'create_file', 'edit_file',  # File operations
            'codebase-retrieval', 'git-commit-retrieval',  # Context retrieval
            'sequentialthinking_Sequential_thinking'  # Advanced reasoning
        ]
        
        print("Checking essential tools availability:")
        found_tools = []
        missing_tools = []
        
        for tool in essential_tools:
            if tool in registry.tools:
                found_tools.append(tool)
                print(f"✅ {tool}")
            else:
                missing_tools.append(tool)
                print(f"❌ {tool}")
        
        print(f"\n📈 SUMMARY:")
        print(f"Found: {len(found_tools)}/{len(essential_tools)} essential tools")
        print(f"Missing: {len(missing_tools)} essential tools")
        
        if missing_tools:
            print(f"\n🔍 MISSING TOOLS:")
            for tool in missing_tools:
                print(f"  - {tool}")
                
            print(f"\n🔍 SIMILAR TOOLS (potential matches):")
            for missing in missing_tools:
                similar = []
                for actual in tool_names:
                    if any(word in actual.lower() for word in missing.lower().split('_')):
                        similar.append(actual)
                if similar:
                    print(f"  {missing} -> {similar}")
        
        print(f"\n🔧 TOOL CATEGORIES:")
        print("-" * 40)
        
        categories = {
            'web': [],
            'task': [],
            'memory': [],
            'file': [],
            'git': [],
            'browser': [],
            'feedback': [],
            'thinking': [],
            'other': []
        }
        
        for tool_name in tool_names:
            tool_lower = tool_name.lower()
            categorized = False
            
            if any(word in tool_lower for word in ['web', 'search', 'scrape']):
                categories['web'].append(tool_name)
                categorized = True
            elif any(word in tool_lower for word in ['task', 'create_tasks', 'update_tasks', 'view_tasks']):
                categories['task'].append(tool_name)
                categorized = True
            elif any(word in tool_lower for word in ['memory', 'remember', 'entities']):
                categories['memory'].append(tool_name)
                categorized = True
            elif any(word in tool_lower for word in ['file', 'str_replace', 'create_file', 'edit']):
                categories['file'].append(tool_name)
                categorized = True
            elif any(word in tool_lower for word in ['git', 'commit']):
                categories['git'].append(tool_name)
                categorized = True
            elif any(word in tool_lower for word in ['browser', 'chrome']):
                categories['browser'].append(tool_name)
                categorized = True
            elif 'feedback' in tool_lower:
                categories['feedback'].append(tool_name)
                categorized = True
            elif 'thinking' in tool_lower:
                categories['thinking'].append(tool_name)
                categorized = True
            
            if not categorized:
                categories['other'].append(tool_name)
        
        for category, tools in categories.items():
            if tools:
                print(f"\n{category.upper()} ({len(tools)}):")
                for tool in tools:
                    print(f"  - {tool}")
        
        return tool_names, found_tools, missing_tools
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return [], [], []

def suggest_correct_tool_names(actual_tools, missing_tools):
    """Suggest correct tool names based on actual registered tools"""
    print(f"\n🎯 SUGGESTED CORRECTIONS:")
    print("=" * 60)
    
    suggestions = {}
    
    # Manual mapping based on common patterns
    mapping_hints = {
        'web_search': ['web-search', 'web_search'],
        'scrape_webpage': ['scrape-webpage', 'scrape_webpage'],
        'create_tasks': ['add_tasks', 'create_tasks'],
        'update_tasks': ['update_tasks'],
        'view_tasks': ['view_tasklist', 'view_tasks'],
        'str_replace': ['str-replace-editor', 'str_replace'],
        'create_file': ['save-file', 'create_file'],
        'edit_file': ['str-replace-editor', 'edit_file'],
        'remember': ['remember'],
        'create_entities_memory': ['create_entities_memory'],
        'codebase-retrieval': ['codebase-retrieval'],
        'git-commit-retrieval': ['git-commit-retrieval'],
        'sequentialthinking_Sequential_thinking': ['sequentialthinking_Sequential_thinking'],
        'interactive_feedback_MCP_Feedback_Enhanced': ['interactive_feedback_MCP_Feedback_Enhanced']
    }
    
    print("Suggested essential tools list:")
    print("```python")
    print("essential_tools = [")
    
    for missing in missing_tools:
        found_match = False
        for actual in actual_tools:
            # Check if actual tool matches any hint for this missing tool
            if missing in mapping_hints:
                if actual in mapping_hints[missing]:
                    print(f"    '{actual}',  # {missing}")
                    suggestions[missing] = actual
                    found_match = True
                    break
        
        if not found_match:
            # Try fuzzy matching
            for actual in actual_tools:
                if any(word in actual.lower() for word in missing.lower().split('_')):
                    print(f"    '{actual}',  # {missing} (fuzzy match)")
                    suggestions[missing] = actual
                    found_match = True
                    break
        
        if not found_match:
            print(f"    # '{missing}',  # NOT FOUND")
    
    print("]")
    print("```")
    
    return suggestions

if __name__ == "__main__":
    actual_tools, found_tools, missing_tools = debug_tool_registry()
    
    if actual_tools:
        suggestions = suggest_correct_tool_names(actual_tools, missing_tools)
        
        print(f"\n✅ DEBUG COMPLETE")
        print(f"Total tools: {len(actual_tools)}")
        print(f"Essential tools found: {len(found_tools)}")
        print(f"Essential tools missing: {len(missing_tools)}")
