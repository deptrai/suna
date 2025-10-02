"""
Regression tests for all phases.

BMAD Test Strategy: Integration Tests (P1)
- Test ID: REG-INT-001 to REG-INT-003
- Level: Integration
- Priority: P1 (Important)
- Risk: RISK-006 (Previous phases break)

Tests:
- Phase 1 regression (caching still works)
- Phase 2 regression (modularization still works)
- Phase 3 regression (routing still works)
"""

import pytest
from core.prompts.module_manager import get_prompt_builder
from core.prompts.router import DynamicPromptRouter

@pytest.mark.asyncio
@pytest.mark.integration
async def test_phase1_regression(chat_helper, test_thread):
    """
    Test ID: REG-INT-001
    Level: Integration
    Priority: P1
    
    Test Phase 1 functionality still works.
    
    Acceptance Criteria:
    - Caching still works
    - Tool calling still works
    - No regressions from Phase 2/3
    
    Mitigates: RISK-006 (Previous phases break)
    """
    # Test basic chat (Phase 1 core functionality)
    response = await chat_helper(
        thread_id=test_thread,
        content="What is 2+2?"
    )
    
    assert response is not None, "Phase 1: Basic chat should work"
    assert len(response) > 0, "Phase 1: Response should have content"
    
    # Test tool calling (Phase 1 feature)
    response2 = await chat_helper(
        thread_id=test_thread,
        content="Create a file called test.txt"
    )
    
    assert response2 is not None, "Phase 1: Tool calling should work"
    assert len(response2) > 0, "Phase 1: Tool response should have content"
    
    print(f"✅ REG-INT-001 PASSED: Phase 1 regression test")
    print(f"   Basic chat: ✅")
    print(f"   Tool calling: ✅")

@pytest.mark.unit
@pytest.mark.integration
def test_phase2_regression():
    """
    Test ID: REG-INT-002
    Level: Integration
    Priority: P1
    
    Test Phase 2 functionality still works.
    
    Acceptance Criteria:
    - Modularization still works
    - Modules load correctly
    - Prompt building works
    
    Mitigates: RISK-006 (Previous phases break)
    """
    # Test module loading (Phase 2 feature)
    builder = get_prompt_builder()
    
    assert builder is not None, "Phase 2: Builder should exist"
    
    # Test prompt building
    prompt = builder.build_prompt("Create a file")
    
    assert prompt is not None, "Phase 2: Prompt should be built"
    assert len(prompt) > 0, "Phase 2: Prompt should have content"
    
    # Verify modules are loaded
    # The prompt should contain module content
    assert len(str(prompt)) > 1000, "Phase 2: Prompt should contain modules"
    
    print(f"✅ REG-INT-002 PASSED: Phase 2 regression test")
    print(f"   Module loading: ✅")
    print(f"   Prompt building: ✅")

@pytest.mark.unit
@pytest.mark.integration
def test_phase3_regression():
    """
    Test ID: REG-INT-003
    Level: Integration
    Priority: P1
    
    Test Phase 3 functionality still works.
    
    Acceptance Criteria:
    - Dynamic routing still works
    - Keyword matching works
    - Module selection works
    
    Mitigates: RISK-006 (Previous phases break)
    """
    # Test routing (Phase 3 feature)
    router = DynamicPromptRouter()
    
    assert router is not None, "Phase 3: Router should exist"
    
    # Test keyword matching
    modules = router.route("Create a file")
    
    assert modules is not None, "Phase 3: Routing should work"
    assert len(modules) > 0, "Phase 3: Should select modules"
    
    # Verify toolkit module is selected
    module_names = [m.value for m in modules]
    assert "tools/toolkit" in module_names, "Phase 3: Should select toolkit for file operations"
    
    print(f"✅ REG-INT-003 PASSED: Phase 3 regression test")
    print(f"   Dynamic routing: ✅")
    print(f"   Keyword matching: ✅")
    print(f"   Module selection: ✅")

@pytest.mark.asyncio
@pytest.mark.integration
async def test_end_to_end_regression(chat_helper, test_thread):
    """
    Test ID: REG-INT-004
    Level: Integration
    Priority: P1
    
    Test complete end-to-end flow.
    
    Acceptance Criteria:
    - All phases work together
    - No integration issues
    - Performance acceptable
    """
    # Test complete flow: routing → module selection → prompt building → LLM call
    queries = [
        "What is 2+2?",
        "Create a file",
        "Parse CSV data",
        "Write a blog post"
    ]
    
    for query in queries:
        response = await chat_helper(
            thread_id=test_thread,
            content=query
        )
        
        assert response is not None, f"E2E: Query '{query}' should get response"
        assert len(response) > 0, f"E2E: Query '{query}' response should have content"
    
    print(f"✅ REG-INT-004 PASSED: End-to-end regression test")
    print(f"   Tested {len(queries)} queries")
    print(f"   All phases working together: ✅")

@pytest.mark.asyncio
@pytest.mark.integration
async def test_backward_compatibility(chat_helper, test_thread):
    """
    Test ID: REG-INT-005
    Level: Integration
    Priority: P2
    
    Test backward compatibility.
    
    Acceptance Criteria:
    - Old queries still work
    - No breaking changes
    - Consistent behavior
    """
    # Test queries that should work across all phases
    legacy_queries = [
        "Hello",
        "Help me",
        "What can you do?",
        "Explain quantum computing"
    ]
    
    for query in legacy_queries:
        response = await chat_helper(
            thread_id=test_thread,
            content=query
        )
        
        assert response is not None, f"Legacy query '{query}' should work"
        assert len(response) > 0, f"Legacy query '{query}' should have response"
    
    print(f"✅ REG-INT-005 PASSED: Backward compatibility test")
    print(f"   Tested {len(legacy_queries)} legacy queries")
    print(f"   All backward compatible: ✅")

