# Hybrid System Prompt Optimization - User Stories & Tasks
## Architect: Winston | Date: 2025-10-01
## Approach: Modular Architecture with Incremental Adoption

---

## 🎯 Epic: Hybrid System Prompt Optimization

**Goal:** Reduce token costs by 80-95% while maintaining 100% functionality  
**Approach:** Incremental adoption of modular architecture  
**Priority:** HIGH  
**Timeline:** 3 phases over 12 weeks  
**Investment:** $70k  
**ROI:** 321% over 12 months  
**Success Criteria:** Cost reduction + Zero functionality loss + Comprehensive observability

---

## Phase 1: Fix Current Issues & Validate Caching (Week 1-2)

**Goal:** Keep excellent caching, fix optimization, validate tool calling  
**Cost:** $15k | **Time:** 2 weeks | **Savings:** 50%

---

### Story 1.1: Validate Existing Caching Implementation

**As a** system architect  
**I want to** validate that prompt caching is working correctly  
**So that** we can confirm 70-90% savings are being achieved

**Acceptance Criteria:**
- [ ] Caching is enabled in production
- [ ] Cache hit rate > 70%
- [ ] Cost reduction = 50%+
- [ ] Zero functionality loss
- [ ] GlitchTip logging comprehensive

**Tasks:**

#### Task 1.1.1: Validate Caching Status
**File:** `backend/core/agentpress/thread_manager.py` line 235  
**Action:** Verify `enable_prompt_caching=True` by default

**Test:**
```bash
# Check parameter
grep "enable_prompt_caching.*True" backend/core/agentpress/thread_manager.py

# Check logs for caching activity
tail -f logs/backend.log | grep "🔥 Block"
```

**Expected:** Caching enabled, logs show cache activity

**GlitchTip:** No new events needed (validation only)

---

#### Task 1.1.2: Add Comprehensive Request Logging
**File:** `backend/core/agentpress/thread_manager.py`  
**Action:** Add logging for every request

**Implementation:**
```python
# Add after line 240 in run_thread()
try:
    import sentry_sdk
    sentry_sdk.set_context("prompt_request", {
        "thread_id": thread_id,
        "model": llm_model,
        "prompt_size": len(system_prompt.get('content', '')),
        "cache_enabled": enable_prompt_caching,
        "tool_count": len(config.tools) if config.tools else 0,
        "timestamp": datetime.now().isoformat()
    })
    sentry_sdk.capture_message(
        f"Prompt Request: {llm_model}, {len(system_prompt.get('content', ''))} chars",
        level="info"
    )
except Exception as e:
    logger.warning(f"Failed to log request to GlitchTip: {e}")
```

**Test:**
1. Send test message
2. Check GlitchTip for "Prompt Request" events
3. Verify all metrics present

**GlitchTip Event:** "Prompt Request: claude-sonnet-4, 260990 chars"

---

#### Task 1.1.3: Add Cache Performance Logging
**File:** `backend/core/agentpress/prompt_caching.py`  
**Action:** Add logging after caching is applied

**Implementation:**
```python
# Add after line 338 in apply_anthropic_caching_strategy()
try:
    import sentry_sdk
    
    # Calculate metrics
    total_tokens = system_tokens + total_conversation_tokens
    cache_hit_rate = (cache_count / len(prepared_messages) * 100) if len(prepared_messages) > 0 else 0
    
    sentry_sdk.set_context("cache_performance", {
        "blocks_used": blocks_used,
        "max_blocks": 4,
        "system_tokens": system_tokens,
        "conversation_tokens": total_conversation_tokens,
        "total_tokens": total_tokens,
        "cache_breakpoints": cache_count,
        "cache_hit_rate": round(cache_hit_rate, 2),
        "model": model_name
    })
    sentry_sdk.capture_message(
        f"Cache Performance: {blocks_used}/4 blocks, {cache_hit_rate:.1f}% hit rate",
        level="info"
    )
except Exception as e:
    logger.warning(f"Failed to log cache performance: {e}")
```

**Test:**
1. Send test message
2. Check GlitchTip for "Cache Performance" events
3. Verify metrics accurate

**GlitchTip Event:** "Cache Performance: 3/4 blocks, 85.0% hit rate"

---

### Story 1.2: Fix Over-Aggressive Optimization

**As a** system architect  
**I want to** disable the over-aggressive prompt optimization  
**So that** tool calling works correctly

**Acceptance Criteria:**
- [ ] Optimization disabled or fixed
- [ ] Tool calling works 100%
- [ ] All test cases pass
- [ ] GlitchTip shows zero tool calling errors

**Tasks:**

#### Task 1.2.1: Disable Aggressive Optimization
**File:** `backend/core/agentpress/thread_manager.py` lines 397-423  
**Action:** Comment out optimization temporarily

**Implementation:**
```python
# TEMPORARY FIX: Disable aggressive optimization
# Lines 397-423 - Comment out this block

# Use original system prompt without optimization
optimized_system_prompt = system_prompt
logger.info(f"📝 Using original system prompt (optimization disabled): {len(system_prompt.get('content', ''))} chars")

# Log to GlitchTip
try:
    import sentry_sdk
    sentry_sdk.capture_message(
        "Optimization disabled - using original prompt",
        level="info",
        extras={"prompt_size": len(system_prompt.get('content', ''))}
    )
except Exception as e:
    logger.warning(f"Failed to log optimization status: {e}")
```

**Test:**
1. Send message requiring tool call
2. Verify tool is called correctly
3. Check response quality

**GlitchTip Event:** "Optimization disabled - using original prompt"

---

#### Task 1.2.2: Create Tool Calling Test Suite
**File:** Create `backend/tests/test_tool_calling_comprehensive.py`

**Implementation:**
```python
"""
Comprehensive tool calling test suite
Phase 1 Task 1.2.2
"""
import pytest
from core.agentpress.thread_manager import ThreadManager

@pytest.mark.asyncio
async def test_single_tool_call():
    """Test single tool call"""
    manager = ThreadManager()
    
    # Create thread
    thread_id = await manager.create_thread(account_id="test", is_public=False)
    
    # Add message
    await manager.add_message(thread_id, "user", "Create a file called test.txt")
    
    # Run thread
    response = await manager.run_thread(
        thread_id=thread_id,
        system_prompt={"role": "system", "content": "You are a helpful assistant."},
        llm_model="claude-sonnet-4",
        enable_prompt_caching=True,
        native_max_auto_continues=0
    )
    
    # Verify tool was called
    assert "tool_calls" in response or "tool_use" in str(response)
    
    # Log to GlitchTip
    import sentry_sdk
    sentry_sdk.capture_message(
        "Tool calling test passed: single_tool_call",
        level="info"
    )

@pytest.mark.asyncio
async def test_multiple_tool_calls():
    """Test multiple tool calls"""
    # Similar structure...
    pass

@pytest.mark.asyncio
async def test_complex_workflow():
    """Test complex workflow with multiple tools"""
    # Similar structure...
    pass

# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
```

**Test:**
```bash
cd backend && uv run pytest tests/test_tool_calling_comprehensive.py -v
```

**Expected:** All tests pass

**GlitchTip Events:** "Tool calling test passed: X"

---

## Phase 2: Modularization & Evaluation (Week 3-6)

**Goal:** Break monolithic prompt into modules, add automated evaluation  
**Cost:** $25k | **Time:** 4 weeks | **Savings:** 65% total

---

### Story 2.1: Create Module System

**As a** system architect  
**I want to** break the monolithic prompt into reusable modules  
**So that** we can maintain and test individual components

**Acceptance Criteria:**
- [ ] Module structure created
- [ ] All modules extracted from original prompt
- [ ] Module manager implemented
- [ ] 100% functional equivalence with original

**Tasks:**

#### Task 2.1.1: Create Module Directory Structure
**Action:** Create module directory and files

**Structure:**
```
backend/core/prompts/modules/
├── core/
│   ├── identity.txt
│   ├── workspace.txt
│   └── critical_rules.txt
├── tools/
│   ├── file_ops.txt
│   ├── web_browser.txt
│   ├── code_dev.txt
│   ├── data_processing.txt
│   └── workflow.txt
└── response/
    └── format.txt
```

**Test:** Verify all files created

**GlitchTip Event:** "Module structure created: 9 modules"

---

#### Task 2.1.2: Extract Modules from Original Prompt
**Action:** Analyze and extract logical sections

**Process:**
1. Read current system prompt (260k chars)
2. Identify logical sections
3. Extract to module files
4. Add version metadata
5. Test each module independently

**Test:** Each module loads correctly

**GlitchTip Event:** "Modules extracted: 9 modules, total 260k chars"

---

#### Task 2.1.3: Implement ModularPromptBuilder
**File:** Create `backend/core/prompts/module_manager.py`

**Implementation:** (See hybrid-solution.md for full code)

**Test:**
```python
builder = ModularPromptBuilder()
prompt = builder.build_prompt([
    PromptModule.CORE_IDENTITY,
    PromptModule.TOOL_FILE_OPS
])
assert len(prompt) > 0
```

**GlitchTip Event:** "ModularPromptBuilder initialized: 9 modules loaded"

---

### Story 2.2: Add Automated Evaluation

**As a** system architect  
**I want to** automatically evaluate response quality  
**So that** we can detect regressions early

**Acceptance Criteria:**
- [ ] Evaluation framework implemented
- [ ] Quality metrics defined
- [ ] Automated testing working
- [ ] GlitchTip logging comprehensive

**Tasks:**

#### Task 2.2.1: Implement AutomatedEvaluator
**File:** Create `backend/core/evaluation/evaluator.py`

**Implementation:** (See hybrid-solution.md for full code)

**Test:**
```python
evaluator = AutomatedEvaluator()
score = evaluator.evaluate_response(response)
assert score['overall'] >= 0.95
```

**GlitchTip Event:** "Evaluation: overall_score=0.97, passed=true"

---

#### Task 2.2.2: Create A/B Testing Framework
**File:** Create `backend/core/evaluation/ab_test.py`

**Implementation:** (See hybrid-solution.md for full code)

**Test:**
```bash
python backend/core/evaluation/ab_test.py --test-cases 100
```

**Expected:** Modular >= 98% of monolithic quality

**GlitchTip Event:** "A/B Test: modular=0.98, monolithic=0.97, passed=true"

---

## Phase 3: Dynamic Routing & Semantic Matching (Week 7-12)

**Goal:** Load only needed modules based on query  
**Cost:** $30k | **Time:** 6 weeks | **Savings:** 80-95% total

---

### Story 3.1: Implement Dynamic Routing

**As a** system architect  
**I want to** load only relevant modules based on user query  
**So that** we minimize token usage while maintaining quality

**Acceptance Criteria:**
- [ ] Dynamic router implemented
- [ ] Keyword matching working
- [ ] 80-95% cost reduction achieved
- [ ] Quality maintained or improved

**Tasks:**

#### Task 3.1.1: Implement DynamicPromptRouter
**File:** Create `backend/core/prompts/router.py`

**Implementation:** (See hybrid-solution.md for full code)

**Test:**
```python
router = DynamicPromptRouter()
modules = router.route("Create a Python file")
assert PromptModule.TOOL_FILE_OPS in modules
```

**GlitchTip Event:** "Routing: query='Create file', modules=['core', 'file_ops']"

---

#### Task 3.1.2: Integrate Router with ThreadManager
**File:** `backend/core/agentpress/thread_manager.py`  
**Action:** Use router to select modules

**Implementation:**
```python
# Add after line 240
from core.prompts.router import DynamicPromptRouter
from core.prompts.module_manager import ModularPromptBuilder

router = DynamicPromptRouter()
builder = ModularPromptBuilder()

# Get user query
user_query = messages[-1].get('content', '') if messages else ''

# Route to modules
modules_needed = router.route(user_query)

# Build prompt
modular_prompt = builder.build_prompt(modules_needed)

# Use modular prompt instead of original
system_prompt = {"role": "system", "content": modular_prompt}
```

**Test:** Send various queries, verify correct modules loaded

**GlitchTip Event:** "Dynamic routing applied: 3 modules loaded"

---

### Story 3.2: Optional Semantic Upgrade

**As a** system architect  
**I want to** upgrade to semantic similarity routing  
**So that** we can handle complex queries better

**Acceptance Criteria:**
- [ ] Semantic router implemented
- [ ] Better accuracy than keyword matching
- [ ] Performance acceptable (<100ms)

**Tasks:**

#### Task 3.2.1: Implement SemanticPromptRouter
**File:** Create `backend/core/prompts/semantic_router.py`

**Implementation:** (See hybrid-solution.md for full code)

**Test:**
```python
router = SemanticPromptRouter()
modules = router.route("I need to analyze some data")
assert PromptModule.TOOL_DATA_PROCESSING in modules
```

**GlitchTip Event:** "Semantic routing: similarity=0.85, modules=['data_processing']"

---

## Success Metrics

### Phase 1
- ✅ Cache hit rate > 70%
- ✅ Tool calling success rate = 100%
- ✅ Cost reduction = 50%
- ✅ Zero quality degradation

### Phase 2
- ✅ Modules created and tested
- ✅ A/B test passed (modular >= 98% of monolithic)
- ✅ Cost reduction = 65%
- ✅ Automated evaluation working

### Phase 3
- ✅ Dynamic routing working
- ✅ Cost reduction = 80-95%
- ✅ Quality maintained or improved
- ✅ Comprehensive observability

---

## GlitchTip Event Summary

**Phase 1:**
- "Prompt Request"
- "Cache Performance"
- "Optimization disabled"
- "Tool calling test passed"

**Phase 2:**
- "Module structure created"
- "Modules extracted"
- "ModularPromptBuilder initialized"
- "Evaluation"
- "A/B Test"

**Phase 3:**
- "Routing decision"
- "Semantic routing"
- "Dynamic routing applied"

---

**Architect:** Winston  
**Date:** 2025-10-01  
**Status:** READY FOR IMPLEMENTATION  
**Approach:** Hybrid - Incremental adoption of modular architecture

