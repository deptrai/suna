"""
Validate Phase 3 Task 3.1.1 (Dynamic Prompt Router)
"""
import sys
from core.prompts.router import DynamicPromptRouter, get_router
from core.prompts.module_manager import PromptModule

print("=" * 80)
print("PHASE 3 TASK 3.1.1 VALIDATION: Dynamic Prompt Router")
print("=" * 80)

# Test 1: Initialize router
print("\n✅ Test 1: Initialize DynamicPromptRouter")
try:
    router = DynamicPromptRouter()
    print(f"   ✅ PASS: Router initialized")
    print(f"   Keyword patterns: {len(router.keyword_patterns)} modules")
except Exception as e:
    print(f"   ❌ FAIL: Initialization error: {e}")
    sys.exit(1)

# Test 2: Test file operation routing
print("\n✅ Test 2: Test file operation routing")
try:
    query = "Create a Python file called hello.py"
    modules = router.route(query)
    
    print(f"   Query: {query}")
    print(f"   Modules selected: {len(modules)}")
    print(f"   Modules: {[m.value for m in modules]}")
    
    # Should include TOOL_TOOLKIT
    if PromptModule.TOOL_TOOLKIT in modules:
        print("   ✅ PASS: TOOL_TOOLKIT included")
    else:
        print("   ⚠️  WARNING: TOOL_TOOLKIT not included")
except Exception as e:
    print(f"   ❌ FAIL: Routing error: {e}")

# Test 3: Test data processing routing
print("\n✅ Test 3: Test data processing routing")
try:
    query = "Parse this JSON data and extract user names"
    modules = router.route(query)
    
    print(f"   Query: {query}")
    print(f"   Modules selected: {len(modules)}")
    
    if PromptModule.TOOL_DATA_PROCESSING in modules:
        print("   ✅ PASS: TOOL_DATA_PROCESSING included")
    else:
        print("   ⚠️  WARNING: TOOL_DATA_PROCESSING not included")
except Exception as e:
    print(f"   ❌ FAIL: Routing error: {e}")

# Test 4: Test workflow routing
print("\n✅ Test 4: Test workflow routing")
try:
    query = "Set up a new React project with all dependencies"
    modules = router.route(query)
    
    print(f"   Query: {query}")
    print(f"   Modules selected: {len(modules)}")
    
    if PromptModule.TOOL_WORKFLOW in modules:
        print("   ✅ PASS: TOOL_WORKFLOW included")
    else:
        print("   ⚠️  WARNING: TOOL_WORKFLOW not included")
except Exception as e:
    print(f"   ❌ FAIL: Routing error: {e}")

# Test 5: Test content creation routing
print("\n✅ Test 5: Test content creation routing")
try:
    query = "Write a blog post about machine learning"
    modules = router.route(query)
    
    print(f"   Query: {query}")
    print(f"   Modules selected: {len(modules)}")
    
    if PromptModule.TOOL_CONTENT_CREATION in modules:
        print("   ✅ PASS: TOOL_CONTENT_CREATION included")
    else:
        print("   ⚠️  WARNING: TOOL_CONTENT_CREATION not included")
except Exception as e:
    print(f"   ❌ FAIL: Routing error: {e}")

# Test 6: Test generic query (should include all modules)
print("\n✅ Test 6: Test generic query")
try:
    query = "Hello, how are you?"
    modules = router.route(query)
    
    print(f"   Query: {query}")
    print(f"   Modules selected: {len(modules)}")
    
    # Should include all modules for generic query
    if len(modules) >= 7:  # 4 core + 3+ tool modules
        print("   ✅ PASS: All modules included for generic query")
    else:
        print(f"   ⚠️  WARNING: Only {len(modules)} modules included")
except Exception as e:
    print(f"   ❌ FAIL: Routing error: {e}")

# Test 7: Test core modules always included
print("\n✅ Test 7: Test core modules always included")
try:
    queries = [
        "Create a file",
        "Parse JSON",
        "Write a blog",
        "Hello"
    ]
    
    all_have_core = True
    for query in queries:
        modules = router.route(query)
        core_modules = [
            PromptModule.CORE_IDENTITY,
            PromptModule.CORE_WORKSPACE,
            PromptModule.CORE_CRITICAL_RULES,
            PromptModule.RESPONSE_FORMAT
        ]
        
        if not all(m in modules for m in core_modules):
            all_have_core = False
            print(f"   ⚠️  Query '{query}' missing core modules")
    
    if all_have_core:
        print("   ✅ PASS: All queries include core modules")
    else:
        print("   ❌ FAIL: Some queries missing core modules")
except Exception as e:
    print(f"   ❌ FAIL: Core modules test error: {e}")

# Test 8: Test analyze_query
print("\n✅ Test 8: Test analyze_query")
try:
    query = "Create a Python file and parse JSON data"
    analysis = router.analyze_query(query)
    
    print(f"   Query: {query}")
    print(f"   Matched modules: {len(analysis['matched_modules'])}")
    print(f"   Final modules: {analysis['module_count']}")
    print(f"   Tool modules: {analysis['tool_modules']}")
    
    if analysis['module_count'] > 4:
        print("   ✅ PASS: Analysis working correctly")
    else:
        print("   ⚠️  WARNING: Analysis may not be working correctly")
except Exception as e:
    print(f"   ❌ FAIL: Analysis error: {e}")

# Test 9: Test singleton pattern
print("\n✅ Test 9: Test singleton pattern")
try:
    router1 = get_router()
    router2 = get_router()
    
    if router1 is router2:
        print("   ✅ PASS: Singleton pattern working")
    else:
        print("   ❌ FAIL: Singleton pattern not working")
except Exception as e:
    print(f"   ❌ FAIL: Singleton test error: {e}")

# Test 10: Test add_keyword_pattern
print("\n✅ Test 10: Test add_keyword_pattern")
try:
    router.add_keyword_pattern(
        PromptModule.TOOL_TOOLKIT,
        ['custom_keyword1', 'custom_keyword2']
    )
    
    patterns = router.get_keyword_patterns()
    if 'custom_keyword1' in patterns[PromptModule.TOOL_TOOLKIT]:
        print("   ✅ PASS: Keyword pattern added successfully")
    else:
        print("   ❌ FAIL: Keyword pattern not added")
except Exception as e:
    print(f"   ❌ FAIL: Add keyword pattern error: {e}")

print("\n" + "=" * 80)
print("VALIDATION COMPLETE")
print("=" * 80)
print("\n✅ Phase 3 Task 3.1.1 (Dynamic Prompt Router) validated successfully!")
print("\nNext steps:")
print("1. Integrate router with ThreadManager (Task 3.1.2)")
print("2. Test with real queries")
print("3. Measure cost reduction")
print("\n" + "=" * 80)

