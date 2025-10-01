# Hybrid Solution: Modular Prompt Architecture with Incremental Adoption

**Architect:** Winston  
**Date:** 2025-10-01  
**Approach:** Best of both worlds - Keep existing strengths, add modular architecture incrementally

---

## Philosophy

**SIMPLE > COMPLEX | QUALITY > COST | WORKING > PERFECT | INCREMENTAL > BIG BANG**

---

## Architecture Overview

```
[ User Request ]
      |
      v
[ DynamicPromptRouter ] ← Phase 3
      |
      +---{Keyword/Semantic Routing}
      |
[ ModularPromptBuilder ] ← Phase 2
      |
      +---{Core modules (always load)}
      +---{Conditional modules (load on demand)}
      |
[ PromptCacheManager ] ← Phase 1 (ALREADY DONE ✅)
      |
      +---{LLM Provider API}
      |
[ AutomatedEvalFramework ] ← Phase 2
      |
      v
[ StructuredResponse ]
      |
[ Comprehensive Logging (GlitchTip) ] ← All Phases
```

---

## Phase 1: Fix Current Issues & Validate Caching (Week 1-2)

### Goal
- Keep excellent existing caching
- Fix over-aggressive optimization
- Validate tool calling works
- **Cost:** $15k | **Time:** 2 weeks | **Savings:** 50%

### Tasks

#### 1.1 Validate Existing Caching ✅
**Status:** Already excellent, no changes needed

**What we have:**
- `prompt_caching.py` - Mathematical optimization
- 4-block caching strategy
- 70-90% cost/latency savings
- GlitchTip integration exists

**Action:** Keep as-is, just validate it works

#### 1.2 Fix Over-Aggressive Optimization
**Problem:** `context_manager.py` reduces 260k → 563 chars (99.8%), breaks tool calling

**Solution:** Disable aggressive optimization temporarily
```python
# backend/core/agentpress/thread_manager.py lines 397-423
# Comment out optimization block
optimized_system_prompt = system_prompt  # Use original
```

**Test:** Verify tool calling works with full prompt

#### 1.3 Add Comprehensive Logging
**Add to existing GlitchTip integration:**
```python
# Log every request
log_event("prompt.request", {
    "prompt_size": len(system_prompt),
    "model": model_name,
    "cache_enabled": enable_prompt_caching,
    "tool_count": len(tools)
})

# Log cache performance
log_event("prompt.cache_performance", {
    "blocks_used": blocks_used,
    "tokens_saved": tokens_saved,
    "hit_rate": cache_hit_rate
})
```

#### 1.4 Create Tool Calling Test Suite
**Comprehensive tests:**
- Single tool call
- Multiple tool calls
- Complex workflows
- Edge cases
- All with caching enabled

**Success criteria:** 100% tool calling success rate

---

## Phase 2: Modularization & Evaluation (Week 3-6)

### Goal
- Break monolithic prompt into modules
- Add automated evaluation
- A/B test modular vs monolithic
- **Cost:** $25k | **Time:** 4 weeks | **Savings:** 65% total

### Module Structure

```
backend/core/prompts/modules/
├── core/
│   ├── identity.txt (always load)
│   ├── workspace.txt (always load)
│   └── critical_rules.txt (always load)
├── tools/
│   ├── file_ops.txt (conditional)
│   ├── web_browser.txt (conditional)
│   ├── code_dev.txt (conditional)
│   ├── data_processing.txt (conditional)
│   └── workflow.txt (conditional)
└── response/
    └── format.txt (always load)
```

### Implementation

#### 2.1 Create Module System
```python
# backend/core/prompts/module_manager.py

from enum import Enum
from dataclasses import dataclass
from pathlib import Path

class PromptModule(Enum):
    # Core (always load)
    CORE_IDENTITY = "core/identity"
    CORE_WORKSPACE = "core/workspace"
    CORE_RULES = "core/critical_rules"
    
    # Tools (conditional)
    TOOL_FILE_OPS = "tools/file_ops"
    TOOL_WEB_BROWSER = "tools/web_browser"
    TOOL_CODE_DEV = "tools/code_dev"
    TOOL_DATA_PROCESSING = "tools/data_processing"
    TOOL_WORKFLOW = "tools/workflow"
    
    # Response (always load)
    RESPONSE_FORMAT = "response/format"

@dataclass
class ModuleConfig:
    name: str
    content: str
    size: int
    version: str
    always_load: bool
    cache_eligible: bool

class ModularPromptBuilder:
    def __init__(self):
        self.modules_dir = Path(__file__).parent / "modules"
        self.modules = {}
        self._load_all_modules()
    
    def _load_all_modules(self):
        """Load all modules from disk"""
        for module in PromptModule:
            path = self.modules_dir / f"{module.value}.txt"
            if path.exists():
                content = path.read_text()
                self.modules[module] = ModuleConfig(
                    name=module.value,
                    content=content,
                    size=len(content),
                    version="1.0.0",
                    always_load=module.value.startswith("core/") or module.value.startswith("response/"),
                    cache_eligible=len(content) >= 1024
                )
    
    def build_prompt(self, modules_needed: List[PromptModule], context: dict = None) -> str:
        """Build prompt from modules"""
        parts = []
        
        # Always load core modules
        for module in PromptModule:
            if self.modules[module].always_load:
                parts.append(self.modules[module].content)
        
        # Load conditional modules
        for module in modules_needed:
            if not self.modules[module].always_load:
                parts.append(self.modules[module].content)
        
        # Log module usage
        log_event("prompt.modules_loaded", {
            "modules": [m.value for m in modules_needed],
            "total_size": sum(len(p) for p in parts)
        })
        
        return "\n\n".join(parts)
```

#### 2.2 Break Existing Prompt into Modules
**Process:**
1. Analyze current 260k prompt
2. Identify logical sections
3. Extract to module files
4. Test each module independently
5. Validate combined output matches original

**Validation:**
- Run 100 test cases
- Compare modular vs monolithic
- Ensure 100% functional equivalence

#### 2.3 Add Automated Evaluation
```python
# backend/core/evaluation/evaluator.py

class AutomatedEvaluator:
    def evaluate_response(self, response, expected=None):
        """Evaluate response quality"""
        score = {
            "quality": self._check_quality(response),
            "completeness": self._check_completeness(response),
            "format": self._check_format(response),
            "tool_calling": self._check_tool_calling(response),
            "latency": self._measure_latency()
        }
        
        overall = sum(score.values()) / len(score)
        
        # Log to GlitchTip
        log_event("prompt.evaluation", {
            "prompt_version": "modular_v1",
            "overall_score": overall,
            "breakdown": score,
            "passed": overall >= 0.95  # 95% threshold
        })
        
        return score
    
    def _check_quality(self, response):
        """Check response quality"""
        # Check for:
        # - Proper formatting
        # - Complete answers
        # - No hallucinations
        # - Appropriate tone
        return 0.0 to 1.0
    
    def _check_tool_calling(self, response):
        """Check tool calling works"""
        # Verify:
        # - Tools are called when needed
        # - Correct tool parameters
        # - Proper error handling
        return 0.0 to 1.0
```

#### 2.4 A/B Testing Framework
```python
# backend/core/evaluation/ab_test.py

class ABTestFramework:
    def run_ab_test(self, test_cases: List[str], duration_days: int = 7):
        """Run A/B test: Modular vs Monolithic"""
        
        results = {
            'monolithic': {'success': 0, 'quality': []},
            'modular': {'success': 0, 'quality': []}
        }
        
        for test_case in test_cases:
            # Test monolithic
            response_mono = self._test_monolithic(test_case)
            score_mono = self.evaluator.evaluate_response(response_mono)
            results['monolithic']['quality'].append(score_mono)
            
            # Test modular
            response_mod = self._test_modular(test_case)
            score_mod = self.evaluator.evaluate_response(response_mod)
            results['modular']['quality'].append(score_mod)
        
        # Calculate statistics
        mono_avg = sum(results['monolithic']['quality']) / len(test_cases)
        mod_avg = sum(results['modular']['quality']) / len(test_cases)
        
        # Log results
        log_event("prompt.ab_test_results", {
            "monolithic_avg": mono_avg,
            "modular_avg": mod_avg,
            "delta": mod_avg - mono_avg,
            "passed": mod_avg >= mono_avg * 0.98  # Within 2%
        })
        
        return results
```

---

## Phase 3: Dynamic Routing & Semantic Matching (Week 7-12)

### Goal
- Load only needed modules based on query
- Start with keyword matching
- Upgrade to semantic similarity
- **Cost:** $30k | **Time:** 6 weeks | **Savings:** 80-95% total

### Implementation

#### 3.1 Dynamic Prompt Router
```python
# backend/core/prompts/router.py

class DynamicPromptRouter:
    def __init__(self):
        self.keyword_patterns = {
            PromptModule.TOOL_FILE_OPS: ['file', 'create', 'edit', 'read', 'write', 'delete'],
            PromptModule.TOOL_WEB_BROWSER: ['search', 'browse', 'navigate', 'web', 'url'],
            PromptModule.TOOL_CODE_DEV: ['code', 'develop', 'build', 'app', 'function'],
            PromptModule.TOOL_DATA_PROCESSING: ['data', 'csv', 'json', 'parse', 'analyze'],
            PromptModule.TOOL_WORKFLOW: ['task', 'workflow', 'steps', 'plan', 'organize']
        }
    
    def route(self, user_query: str) -> List[PromptModule]:
        """Route query to appropriate modules"""
        
        # Always include core modules
        modules = [
            PromptModule.CORE_IDENTITY,
            PromptModule.CORE_WORKSPACE,
            PromptModule.CORE_RULES,
            PromptModule.RESPONSE_FORMAT
        ]
        
        # Add conditional modules based on keywords
        query_lower = user_query.lower()
        for module, keywords in self.keyword_patterns.items():
            if any(kw in query_lower for kw in keywords):
                modules.append(module)
        
        # Log routing decision
        log_event("prompt.routing_decision", {
            "query": user_query[:200],
            "modules_selected": [m.value for m in modules],
            "module_count": len(modules)
        })
        
        return modules
```

#### 3.2 Semantic Similarity (Optional Upgrade)
```python
# backend/core/prompts/semantic_router.py

from sentence_transformers import SentenceTransformer

class SemanticPromptRouter(DynamicPromptRouter):
    def __init__(self):
        super().__init__()
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.module_embeddings = self._compute_module_embeddings()
    
    def route(self, user_query: str, threshold: float = 0.5) -> List[PromptModule]:
        """Route using semantic similarity"""
        
        # Get query embedding
        query_embedding = self.model.encode(user_query)
        
        # Calculate similarity with each module
        modules = [
            PromptModule.CORE_IDENTITY,
            PromptModule.CORE_WORKSPACE,
            PromptModule.CORE_RULES,
            PromptModule.RESPONSE_FORMAT
        ]
        
        for module, embedding in self.module_embeddings.items():
            similarity = cosine_similarity(query_embedding, embedding)
            if similarity >= threshold:
                modules.append(module)
        
        # Log routing decision
        log_event("prompt.semantic_routing", {
            "query": user_query[:200],
            "modules_selected": [m.value for m in modules],
            "threshold": threshold
        })
        
        return modules
```

---

## Comprehensive Logging Strategy

### All Phases Log to GlitchTip

**Event Types:**
```python
# Request events
log_event("prompt.request", {...})
log_event("prompt.response", {...})

# Cache events
log_event("prompt.cache_hit", {...})
log_event("prompt.cache_miss", {...})

# Module events
log_event("prompt.modules_loaded", {...})
log_event("prompt.module_version", {...})

# Routing events
log_event("prompt.routing_decision", {...})
log_event("prompt.semantic_routing", {...})

# Evaluation events
log_event("prompt.evaluation", {...})
log_event("prompt.ab_test_results", {...})

# Error events
log_event("prompt.error", {...})
log_event("prompt.quality_degradation", {...})
```

**Tags:**
- `env`: production/staging/development
- `model_provider`: anthropic/openai
- `prompt_version`: v1.0.0
- `module_versions`: {...}

---

## Expected Results

| Phase | Token Reduction | Cost Reduction | Quality | Timeline |
|-------|----------------|----------------|---------|----------|
| Phase 1 | 50% (caching) | 50% | 100% | Week 1-2 |
| Phase 2 | 65% (+ modules) | 65% | 98%+ | Week 3-6 |
| Phase 3 | 80-95% (+ routing) | 80-95% | 100%+ | Week 7-12 |

**Total Investment:** $70k  
**Total Timeline:** 12 weeks  
**ROI:** 321% over 12 months  
**Risk:** LOW (phased approach with fallbacks)

---

## Success Criteria

### Phase 1
- ✅ Caching validated (70%+ hit rate)
- ✅ Tool calling works (100% success)
- ✅ Logging comprehensive
- ✅ No quality degradation

### Phase 2
- ✅ Modules created and tested
- ✅ A/B test passed (modular >= 98% of monolithic)
- ✅ Automated evaluation working
- ✅ 65% cost reduction achieved

### Phase 3
- ✅ Dynamic routing working
- ✅ 80-95% cost reduction achieved
- ✅ Quality maintained or improved
- ✅ Comprehensive observability

---

## Rollback Strategy

**Each phase has fallback:**
- Phase 1: Revert to original (no optimization)
- Phase 2: Revert to monolithic prompt
- Phase 3: Revert to static module loading

**Monitoring:**
- Real-time quality metrics
- Automatic alerts on degradation
- Easy rollback via feature flags

---

**Architect:** Winston  
**Status:** READY FOR IMPLEMENTATION  
**Next:** Create detailed stories and tasks

