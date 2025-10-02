"""
Dynamic routing tests.

BMAD Test Strategy: Unit Tests (P3)
- Test ID: P3-UNIT-005 to P3-UNIT-009
- Level: Unit (pure logic, no external dependencies)
- Priority: P3 (Phase 3 functionality)
- Risk: RISK-002 (Routing logic incorrect)

Tests:
- Keyword matching logic
- Module selection based on query
- Fallback behavior for generic queries
- Multiple module selection
- Edge cases (empty query, special characters)
"""

import pytest
from core.prompts.router import DynamicPromptRouter

@pytest.fixture
def router():
    """
    Fixture for DynamicPromptRouter.

    Returns:
        DynamicPromptRouter instance
    """
    return DynamicPromptRouter()

def get_module_names(modules):
    """Helper to convert PromptModule enums to strings"""
    return [m.value for m in modules]

@pytest.mark.unit
@pytest.mark.routing
def test_keyword_matching_file_operations(router):
    """
    Test ID: P3-UNIT-005
    Level: Unit
    Priority: P3
    
    Test keyword matching for file operations.
    
    Acceptance Criteria:
    - File-related keywords trigger toolkit module
    - Multiple file keywords work
    - Case-insensitive matching
    
    Mitigates: RISK-002 (Routing logic incorrect)
    """
    # Test file operation keywords
    queries = [
        "Create a file called test.txt",
        "Read the contents of README.md",
        "Edit the configuration file",
        "Delete old log files"
    ]
    
    for query in queries:
        modules = router.route(query)

        # Convert PromptModule enums to strings for comparison
        module_names = [m.value for m in modules]

        # Should include toolkit module for file operations
        assert "tools/toolkit" in module_names, f"Query '{query}' should trigger toolkit module"
    
    print(f"✅ P3-UNIT-005 PASSED: Keyword matching for file operations")
    print(f"   Tested {len(queries)} file operation queries")

@pytest.mark.unit
@pytest.mark.routing
def test_keyword_matching_data_processing(router):
    """
    Test ID: P3-UNIT-006
    Level: Unit
    Priority: P3
    
    Test keyword matching for data processing.
    
    Acceptance Criteria:
    - Data-related keywords trigger data_processing module
    - CSV, JSON, parsing keywords work
    - Case-insensitive matching
    
    Mitigates: RISK-002 (Routing logic incorrect)
    """
    # Test data processing keywords
    queries = [
        "Parse this CSV data",
        "Convert JSON to XML",
        "Analyze the dataset",
        "Process the spreadsheet"
    ]
    
    for query in queries:
        modules = router.route(query)

        # Convert PromptModule enums to strings for comparison
        module_names = [m.value for m in modules]

        # Should include data_processing module
        assert "tools/data_processing" in module_names, f"Query '{query}' should trigger data_processing module"
    
    print(f"✅ P3-UNIT-006 PASSED: Keyword matching for data processing")
    print(f"   Tested {len(queries)} data processing queries")

@pytest.mark.unit
@pytest.mark.routing
def test_fallback_behavior(router):
    """
    Test ID: P3-UNIT-007
    Level: Unit
    Priority: P3
    
    Test fallback behavior for generic queries.
    
    Acceptance Criteria:
    - Generic queries return all modules
    - No keywords = fallback
    - Fallback includes all tool modules
    
    Mitigates: RISK-002 (Routing logic incorrect)
    """
    # Test generic queries (no specific keywords)
    generic_queries = [
        "Hello",
        "What can you do?",
        "Help me",
        "I need assistance"
    ]
    
    for query in generic_queries:
        modules = router.route(query)
        module_names = get_module_names(modules)

        # Should return all modules (fallback)
        assert len(modules) >= 4, f"Generic query '{query}' should trigger fallback (all modules)"

        # Should include all tool modules
        assert "tools/toolkit" in module_names, "Fallback should include toolkit"
        assert "tools/data_processing" in module_names, "Fallback should include data_processing"
        assert "tools/workflow" in module_names, "Fallback should include workflow"
        assert "tools/content_creation" in module_names, "Fallback should include content_creation"
    
    print(f"✅ P3-UNIT-007 PASSED: Fallback behavior test")
    print(f"   Tested {len(generic_queries)} generic queries")
    print(f"   All triggered fallback correctly")

@pytest.mark.unit
@pytest.mark.routing
def test_multiple_module_selection(router):
    """
    Test ID: P3-UNIT-008
    Level: Unit
    Priority: P3
    
    Test multiple module selection for complex queries.
    
    Acceptance Criteria:
    - Queries with multiple keywords trigger multiple modules
    - All relevant modules included
    - No duplicate modules
    
    Mitigates: RISK-002 (Routing logic incorrect)
    """
    # Test queries that should trigger multiple modules
    query = "Create a file, parse the CSV data, and generate a report"
    modules = router.route(query)
    module_names = get_module_names(modules)

    # Should include multiple modules
    assert "tools/toolkit" in module_names, "Should include toolkit for file creation"
    assert "tools/data_processing" in module_names, "Should include data_processing for CSV parsing"
    assert "tools/content_creation" in module_names, "Should include content_creation for report generation"

    # No duplicates
    assert len(modules) == len(set(modules)), "Should not have duplicate modules"
    
    print(f"✅ P3-UNIT-008 PASSED: Multiple module selection test")
    print(f"   Query triggered {len(modules)} modules")
    print(f"   Modules: {', '.join(module_names)}")

@pytest.mark.unit
@pytest.mark.routing
def test_edge_cases(router):
    """
    Test ID: P3-UNIT-009
    Level: Unit
    Priority: P3
    
    Test edge cases for routing logic.
    
    Acceptance Criteria:
    - Empty query handled gracefully
    - Special characters handled
    - Very long queries handled
    - Unicode characters handled
    
    Mitigates: RISK-002 (Routing logic incorrect)
    """
    # Test empty query
    modules_empty = router.route("")
    assert len(modules_empty) >= 4, "Empty query should trigger fallback"

    # Test special characters
    modules_special = router.route("!@#$%^&*()")
    assert len(modules_special) >= 4, "Special characters should trigger fallback"

    # Test very long query
    long_query = "Create a file " * 100
    modules_long = router.route(long_query)
    module_names_long = get_module_names(modules_long)
    assert "tools/toolkit" in module_names_long, "Long query should still match keywords"

    # Test Unicode characters
    modules_unicode = router.route("创建文件 📁")
    assert len(modules_unicode) >= 4, "Unicode should trigger fallback (no English keywords)"
    
    print(f"✅ P3-UNIT-009 PASSED: Edge cases test")
    print(f"   Empty query: {len(modules_empty)} modules")
    print(f"   Special chars: {len(modules_special)} modules")
    print(f"   Long query: {len(modules_long)} modules")
    print(f"   Unicode: {len(modules_unicode)} modules")

@pytest.mark.unit
@pytest.mark.routing
def test_case_insensitive_matching(router):
    """
    Test ID: P3-UNIT-010
    Level: Unit
    Priority: P3
    
    Test case-insensitive keyword matching.
    
    Acceptance Criteria:
    - Uppercase keywords work
    - Lowercase keywords work
    - Mixed case keywords work
    - All produce same results
    
    Mitigates: RISK-002 (Routing logic incorrect)
    """
    # Test same query in different cases
    queries = [
        "CREATE A FILE",
        "create a file",
        "Create A File",
        "CrEaTe A fIlE"
    ]
    
    results = [router.route(q) for q in queries]

    # All should produce same results
    for i in range(1, len(results)):
        assert results[i] == results[0], f"Case variation {i} should match first result"

    # All should include toolkit
    for modules in results:
        module_names = get_module_names(modules)
        assert "tools/toolkit" in module_names, "All variations should trigger toolkit"
    
    print(f"✅ P3-UNIT-010 PASSED: Case-insensitive matching test")
    print(f"   Tested {len(queries)} case variations")
    print(f"   All produced identical results")

@pytest.mark.unit
@pytest.mark.routing
def test_performance_routing(router):
    """
    Test ID: P3-UNIT-011
    Level: Unit
    Priority: P3
    
    Test routing performance.
    
    Acceptance Criteria:
    - Routing completes in <10ms
    - No performance degradation with long queries
    - Consistent performance across queries
    
    Mitigates: RISK-003 (Performance degradation)
    """
    import time
    
    queries = [
        "Create a file",
        "Parse CSV data",
        "Generate a report",
        "Analyze the dataset and create visualizations"
    ]
    
    times = []
    for query in queries:
        start = time.time()
        modules = router.route(query)
        end = time.time()

        elapsed_ms = (end - start) * 1000
        times.append(elapsed_ms)

        # Should complete in <10ms
        assert elapsed_ms < 10, f"Routing should complete in <10ms, took {elapsed_ms:.2f}ms"
    
    avg_time = sum(times) / len(times)
    
    print(f"✅ P3-UNIT-011 PASSED: Performance routing test")
    print(f"   Average routing time: {avg_time:.2f}ms")
    print(f"   Max time: {max(times):.2f}ms")
    print(f"   Min time: {min(times):.2f}ms")

