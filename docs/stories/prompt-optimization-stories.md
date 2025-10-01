# System Prompt Optimization - User Stories & Tasks
## Architect: Winston | Date: 2025-10-01

---

## 🎯 Epic: System Prompt Optimization

**Goal:** Reduce token costs by 80-95% while maintaining 100% functionality  
**Priority:** HIGH  
**Timeline:** 3 phases over 12 weeks  
**Success Criteria:** Cost reduction + Zero functionality loss

---

## Phase 1: Enable & Validate Caching (Week 1-2)

### Story 1.1: Validate Existing Caching Implementation

**As a** system architect  
**I want to** validate that prompt caching is working correctly  
**So that** we can confirm 70-90% savings are being achieved

**Acceptance Criteria:**
- [ ] Caching is enabled in production
- [ ] Cache hit rate > 70%
- [ ] Cost reduction = 50%+
- [ ] Latency reduction = 50%+
- [ ] Zero functionality loss
- [ ] GlitchTip logging shows cache metrics

**Tasks:**

#### Task 1.1.1: Check Caching Status
**File:** `backend/core/agentpress/thread_manager.py` line 235  
**Action:** Verify `enable_prompt_caching=True` by default

```python
# Check this parameter in run_thread()
enable_prompt_caching: bool = True,  # Should be True
```

**Test:**
```bash
# Check logs for caching activity
tail -f logs/backend.log | grep "🔥 Block"
```

**Expected Output:**
```
🔥 Block 1: Cached system prompt (X tokens)
🎯 Total cache blocks used: X/4
```

**GlitchTip Event:** Log cache status check result

---

#### Task 1.1.2: Add Cache Metrics Logging
**File:** `backend/core/agentpress/prompt_caching.py`  
**Action:** Add comprehensive cache metrics to GlitchTip

```python
# Add after line 281
import sentry_sdk

def log_cache_metrics(blocks_used, system_tokens, cache_hit_rate):
    """Log cache metrics to GlitchTip"""
    sentry_sdk.set_context("cache_metrics", {
        "blocks_used": blocks_used,
        "system_tokens": system_tokens,
        "cache_hit_rate": cache_hit_rate,
        "timestamp": datetime.now().isoformat()
    })
    
    sentry_sdk.capture_message(
        f"Cache metrics: {blocks_used} blocks, {cache_hit_rate}% hit rate",
        level="info"
    )
```

**Test:**
1. Send 10 test messages
2. Check GlitchTip for cache metrics
3. Verify hit rate > 70%

**GlitchTip Event:** Cache metrics logged every request

---

#### Task 1.1.3: Create Cache Performance Dashboard
**File:** Create `scripts/monitor_cache_performance.py`

```python
"""
Monitor cache performance from logs
"""
import re
from collections import defaultdict

def analyze_cache_logs(log_file='logs/backend.log'):
    """Analyze cache performance from logs"""
    
    cache_hits = 0
    cache_misses = 0
    total_savings = 0
    
    with open(log_file) as f:
        for line in f:
            if "🔥 Block" in line:
                cache_hits += 1
                # Extract tokens saved
                match = re.search(r'\((\d+) tokens\)', line)
                if match:
                    total_savings += int(match.group(1))
            elif "System prompt too small for caching" in line:
                cache_misses += 1
    
    hit_rate = (cache_hits / (cache_hits + cache_misses) * 100) if (cache_hits + cache_misses) > 0 else 0
    
    print(f"Cache Performance:")
    print(f"  Hits: {cache_hits}")
    print(f"  Misses: {cache_misses}")
    print(f"  Hit Rate: {hit_rate:.1f}%")
    print(f"  Total Tokens Saved: {total_savings:,}")
    print(f"  Estimated Cost Savings: ${total_savings * 0.0001:.2f}")
    
    return {
        'hit_rate': hit_rate,
        'total_savings': total_savings
    }

if __name__ == "__main__":
    analyze_cache_logs()
```

**Test:**
```bash
python scripts/monitor_cache_performance.py
```

**Expected Output:**
```
Cache Performance:
  Hits: 850
  Misses: 150
  Hit Rate: 85.0%
  Total Tokens Saved: 55,250,000
  Estimated Cost Savings: $5,525.00
```

**GlitchTip Event:** Dashboard results logged

---

### Story 1.2: Fix Over-Aggressive Optimization

**As a** system architect  
**I want to** disable the over-aggressive prompt optimization  
**So that** tool calling works correctly

**Acceptance Criteria:**
- [ ] `get_optimized_system_prompt()` disabled or fixed
- [ ] Tool calling works 100%
- [ ] All test cases pass
- [ ] GlitchTip shows zero tool calling errors

**Tasks:**

#### Task 1.2.1: Disable Aggressive Optimization
**File:** `backend/core/agentpress/thread_manager.py` lines 397-423  
**Action:** Comment out or disable optimization temporarily

```python
# TEMPORARY FIX: Disable aggressive optimization
# Lines 397-423 - Comment out this block:

# try:
#     ctx_optimizer = ContextManager()
#     user_query = ""
#     if messages:
#         for msg in reversed(messages):
#             if isinstance(msg, dict) and msg.get('role') == 'user':
#                 user_query = str(msg.get('content', ''))[:200]
#                 break
#
#     logger.info(f"🔍 User query extracted for optimization: {user_query[:100]}...")
#     if user_query and system_prompt and isinstance(system_prompt, dict):
#         original_content = system_prompt.get('content', '')
#         original_system_prompt_length = len(original_content)
#
#         optimized_content = ctx_optimizer.get_optimized_system_prompt(user_query, original_content)
#         optimized_system_prompt = system_prompt.copy()
#         optimized_system_prompt['content'] = optimized_content
#
#         logger.info(f"📝 System prompt optimized: {len(original_content)} -> {len(optimized_content)} chars")
# except Exception as e:
#     logger.warning(f"System prompt optimization failed: {e}")
#     optimized_system_prompt = system_prompt

# REPLACE WITH:
optimized_system_prompt = system_prompt  # Use original, no optimization
logger.info(f"📝 Using original system prompt (optimization disabled): {len(system_prompt.get('content', ''))} chars")
```

**Test:**
1. Send message requiring tool call
2. Verify tool is called correctly
3. Check response quality

**GlitchTip Event:** Log optimization disabled

---

#### Task 1.2.2: Create Tool Calling Test Suite
**File:** Create `tests/test_tool_calling_with_optimization.py`

```python
"""
Test tool calling with different optimization levels
"""
import pytest
from backend.core.agentpress.thread_manager import ThreadManager

@pytest.mark.asyncio
async def test_tool_calling_no_optimization():
    """Test tool calling with no optimization"""
    manager = ThreadManager()
    
    # Test case: File operation
    response = await manager.send_message(
        thread_id="test",
        message="Create a file called test.txt with content 'Hello World'",
        enable_optimization=False
    )
    
    assert "tool_calls" in response
    assert len(response["tool_calls"]) > 0
    assert response["tool_calls"][0]["name"] == "create_file"

@pytest.mark.asyncio
async def test_tool_calling_with_caching():
    """Test tool calling with caching enabled"""
    manager = ThreadManager()
    
    response = await manager.send_message(
        thread_id="test",
        message="Search the web for Python tutorials",
        enable_prompt_caching=True
    )
    
    assert "tool_calls" in response
    assert len(response["tool_calls"]) > 0

@pytest.mark.asyncio
async def test_multiple_tool_calls():
    """Test multiple tool calls in sequence"""
    manager = ThreadManager()
    
    # Test case: Complex workflow
    response = await manager.send_message(
        thread_id="test",
        message="Search for Python tutorials, then create a summary file",
        enable_prompt_caching=True
    )
    
    assert "tool_calls" in response
    assert len(response["tool_calls"]) >= 2

# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
```

**Test:**
```bash
cd backend && uv run pytest tests/test_tool_calling_with_optimization.py -v
```

**Expected Output:**
```
test_tool_calling_no_optimization PASSED
test_tool_calling_with_caching PASSED
test_multiple_tool_calls PASSED
```

**GlitchTip Event:** Test results logged

---

## Phase 2: Smart Compression (Week 3-6)

### Story 2.1: Implement Moderate Compression

**As a** system architect  
**I want to** compress system prompt by 30-50% without losing functionality  
**So that** we reduce costs while maintaining quality

**Acceptance Criteria:**
- [ ] 30-50% token reduction
- [ ] 100% tool calling success rate
- [ ] All test cases pass
- [ ] A/B test shows no quality degradation
- [ ] GlitchTip shows compression metrics

**Tasks:**

#### Task 2.1.1: Rewrite get_optimized_system_prompt()
**File:** `backend/core/agentpress/context_manager.py` lines 357-412  
**Action:** Replace with moderate compression

```python
def get_optimized_system_prompt(self, query_context: str, base_prompt: str) -> str:
    """
    Moderate compression - 30-50% reduction while keeping ALL essential info
    
    Strategy:
    1. Keep ALL tool schemas (critical!)
    2. Remove verbose explanations
    3. Use concise language
    4. Keep structure and examples
    """
    
    # If already short, don't optimize
    if len(base_prompt) < 5000:
        return base_prompt
    
    # MODERATE compression rules:
    # 1. Remove redundant phrases
    # 2. Shorten verbose explanations
    # 3. Keep ALL tool information
    # 4. Keep ALL critical rules
    
    compressed = base_prompt
    
    # Remove redundant phrases
    redundant_phrases = [
        ("It is important to", ""),
        ("Please note that", ""),
        ("You should always", "Always"),
        ("Make sure to", ""),
        ("Be sure to", ""),
    ]
    
    for old, new in redundant_phrases:
        compressed = compressed.replace(old, new)
    
    # Remove excessive whitespace
    import re
    compressed = re.sub(r'\n\n\n+', '\n\n', compressed)
    compressed = re.sub(r'  +', ' ', compressed)
    
    # Log compression
    original_length = len(base_prompt)
    compressed_length = len(compressed)
    reduction = (original_length - compressed_length) / original_length * 100
    
    logger.info(f"Moderate compression: {original_length} -> {compressed_length} chars ({reduction:.1f}% reduction)")
    
    # Safety check: If reduction > 50%, something went wrong
    if reduction > 50:
        logger.warning(f"Compression too aggressive ({reduction:.1f}%), using original")
        return base_prompt
    
    return compressed
```

**Test:**
1. Run with 100 test queries
2. Verify tool calling works
3. Check compression ratio 30-50%

**GlitchTip Event:** Compression metrics logged

---

#### Task 2.1.2: A/B Testing Framework
**File:** Create `tests/ab_test_compression.py`

```python
"""
A/B test compression vs original
"""
import asyncio
from backend.core.agentpress.thread_manager import ThreadManager

async def ab_test_compression():
    """Run A/B test"""
    
    test_cases = [
        "Create a Python file with a hello world function",
        "Search for React tutorials and summarize",
        "List all files in the current directory",
        # ... 97 more test cases
    ]
    
    results = {
        'original': {'success': 0, 'tool_calls': 0},
        'compressed': {'success': 0, 'tool_calls': 0}
    }
    
    manager = ThreadManager()
    
    for test_case in test_cases:
        # Test original
        response_original = await manager.send_message(
            thread_id="test_original",
            message=test_case,
            enable_optimization=False
        )
        
        if response_original.get("tool_calls"):
            results['original']['success'] += 1
            results['original']['tool_calls'] += len(response_original["tool_calls"])
        
        # Test compressed
        response_compressed = await manager.send_message(
            thread_id="test_compressed",
            message=test_case,
            enable_optimization=True
        )
        
        if response_compressed.get("tool_calls"):
            results['compressed']['success'] += 1
            results['compressed']['tool_calls'] += len(response_compressed["tool_calls"])
    
    # Calculate success rates
    original_rate = results['original']['success'] / len(test_cases) * 100
    compressed_rate = results['compressed']['success'] / len(test_cases) * 100
    
    print(f"A/B Test Results:")
    print(f"  Original: {original_rate:.1f}% success")
    print(f"  Compressed: {compressed_rate:.1f}% success")
    print(f"  Delta: {compressed_rate - original_rate:.1f}%")
    
    # PASS if compressed >= 98% of original
    assert compressed_rate >= original_rate * 0.98, f"Quality degradation: {compressed_rate:.1f}% < {original_rate * 0.98:.1f}%"
    
    return results

if __name__ == "__main__":
    asyncio.run(ab_test_compression())
```

**Test:**
```bash
python tests/ab_test_compression.py
```

**Expected Output:**
```
A/B Test Results:
  Original: 100.0% success
  Compressed: 99.0% success
  Delta: -1.0%
PASS: Quality maintained (>98%)
```

**GlitchTip Event:** A/B test results logged

---

## Phase 3: Dynamic Loading (Week 7-12)

### Story 3.1: Implement Simple Dynamic Loading

**As a** system architect  
**I want to** load only relevant prompt sections based on query  
**So that** we further reduce tokens while improving focus

**Acceptance Criteria:**
- [ ] 15-20% additional token reduction
- [ ] 100%+ quality (better than original)
- [ ] Simple pattern matching (no ML)
- [ ] All test cases pass
- [ ] GlitchTip shows dynamic loading metrics

**Tasks:**

#### Task 3.1.1: Create Prompt Sections
**File:** Create `backend/core/prompts/sections/`

```
backend/core/prompts/sections/
├── core.txt (always load)
├── file_ops.txt
├── web_search.txt
├── browser.txt
├── code_dev.txt
├── data_processing.txt
└── workflow.txt
```

**Test:** Verify all sections created

**GlitchTip Event:** Sections created

---

#### Task 3.1.2: Implement Dynamic Loader
**File:** Create `backend/core/prompts/dynamic_loader.py`

```python
"""
Simple dynamic prompt loader
"""
import os
from pathlib import Path

class DynamicPromptLoader:
    """Load prompt sections dynamically"""
    
    def __init__(self):
        self.sections_dir = Path(__file__).parent / "sections"
        self.core = self._load_section("core.txt")
        self.sections = {
            'file_ops': self._load_section("file_ops.txt"),
            'web_search': self._load_section("web_search.txt"),
            'browser': self._load_section("browser.txt"),
            'code_dev': self._load_section("code_dev.txt"),
            'data_processing': self._load_section("data_processing.txt"),
            'workflow': self._load_section("workflow.txt")
        }
        
        # Simple keyword patterns
        self.patterns = {
            'file_ops': ['file', 'create', 'edit', 'read', 'write'],
            'web_search': ['search', 'research', 'find', 'web'],
            'browser': ['navigate', 'click', 'fill', 'browser'],
            'code_dev': ['code', 'develop', 'build', 'app'],
            'data_processing': ['data', 'csv', 'json', 'parse'],
            'workflow': ['task', 'workflow', 'steps', 'plan']
        }
    
    def _load_section(self, filename):
        """Load a section file"""
        path = self.sections_dir / filename
        if path.exists():
            return path.read_text()
        return ""
    
    def build_prompt(self, query: str) -> str:
        """Build prompt dynamically"""
        # Always include core
        parts = [self.core]
        
        # Detect relevant sections
        query_lower = query.lower()
        for section_name, keywords in self.patterns.items():
            if any(kw in query_lower for kw in keywords):
                parts.append(self.sections[section_name])
        
        return "\n\n".join(parts)
```

**Test:**
```python
loader = DynamicPromptLoader()
prompt = loader.build_prompt("Create a Python file")
assert "file_ops" in prompt
assert len(prompt) < 50000  # Much smaller than original
```

**GlitchTip Event:** Dynamic loading implemented

---

## 📊 Success Metrics & Monitoring

### Metrics to Track (GlitchTip)

**1. Cache Performance:**
- Cache hit rate (target: >70%)
- Tokens saved per request
- Cost savings per day
- Latency improvement

**2. Compression Performance:**
- Compression ratio (target: 30-50%)
- Tool calling success rate (target: 100%)
- Response quality score
- User satisfaction

**3. Dynamic Loading Performance:**
- Average prompt size
- Sections loaded per query
- Token reduction vs original
- Quality improvement

### GlitchTip Integration

**File:** `backend/core/utils/metrics.py`

```python
"""
Metrics logging to GlitchTip
"""
import sentry_sdk

def log_optimization_metrics(
    phase: str,
    original_tokens: int,
    optimized_tokens: int,
    tool_calls_success: bool,
    cache_hit: bool
):
    """Log optimization metrics"""
    
    reduction = (original_tokens - optimized_tokens) / original_tokens * 100
    
    sentry_sdk.set_context("optimization", {
        "phase": phase,
        "original_tokens": original_tokens,
        "optimized_tokens": optimized_tokens,
        "reduction_percent": reduction,
        "tool_calls_success": tool_calls_success,
        "cache_hit": cache_hit
    })
    
    sentry_sdk.capture_message(
        f"Optimization metrics: {phase} - {reduction:.1f}% reduction",
        level="info"
    )
```

---

## 🚀 Deployment Plan

### Week 1-2: Phase 1
- [ ] Validate caching (Task 1.1.1-1.1.3)
- [ ] Fix over-optimization (Task 1.2.1-1.2.2)
- [ ] Deploy to production
- [ ] Monitor for 1 week

### Week 3-6: Phase 2
- [ ] Implement moderate compression (Task 2.1.1)
- [ ] Run A/B tests (Task 2.1.2)
- [ ] Deploy to 10% users
- [ ] Monitor for 2 weeks
- [ ] Deploy to 100%

### Week 7-12: Phase 3
- [ ] Create sections (Task 3.1.1)
- [ ] Implement dynamic loader (Task 3.1.2)
- [ ] Test extensively
- [ ] Deploy to 10% users
- [ ] Monitor for 3 weeks
- [ ] Deploy to 100%

---

**Prepared by:** Winston (Architect)  
**Date:** 2025-10-01  
**Status:** READY FOR IMPLEMENTATION

