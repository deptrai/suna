# Phase 3.2: Semantic Routing Specification
## Optional Upgrade to Dynamic Routing
## Date: 2025-10-01
## Status: DEFINED, NOT IMPLEMENTED

---

## 📋 Overview

**Phase 3.2** is an **optional upgrade** to Phase 3.1's keyword-based routing, using semantic similarity for more intelligent module selection.

**Current Status:** Phase 3.1 (keyword-based) is complete and deployed ✅  
**Phase 3.2 Status:** Defined but not implemented ⏸️

---

## 🎯 Goals

### Primary Goal
Upgrade from keyword-based routing (Phase 3.1) to semantic similarity routing for better accuracy and handling of complex queries.

### Success Criteria
- [ ] Semantic router implemented
- [ ] Accuracy > 95% (vs ~90% keyword-based)
- [ ] Performance < 100ms (vs 0.54ms keyword-based)
- [ ] Cost reduction: 40-50% (vs 21.1% keyword-based)
- [ ] Quality maintained: 100%

---

## 💰 Investment Analysis

### Costs

**Development:**
- Implementation: $15k (2 weeks)
- Testing & validation: $5k (1 week)
- Integration & deployment: $5k (1 week)
- Documentation: $2k (included)
- Contingency: $3k
- **Total: $30k**

**Timeline:** 4-6 weeks

**Infrastructure:**
- Sentence Transformers model: Free (open source)
- Additional compute: ~$50/month
- Storage for embeddings: ~$10/month

### Returns

**Expected Benefits:**
- Additional cost reduction: 20-30% (on top of Phase 3.1's 21.1%)
- Total reduction: 40-50% (vs current 21.1%)
- Combined with Phase 1: 70-75% total (vs current 60.5%)

**Financial Impact:**
- Additional annual savings: ~$3,000
- Total annual savings: ~$8,000 (vs current $5,000)
- Payback period: 10 months
- 5-year ROI: $10,000

### ROI Analysis

**Investment:** $30k  
**Additional Annual Savings:** $3,000  
**Payback:** 10 months  
**5-Year Profit:** $10,000

**Recommendation:** Evaluate after 1 month of Phase 3.1 production data

---

## 🔧 Technical Specification

### Architecture

**Current (Phase 3.1):**
```
User Query → Keyword Matching → Module Selection → Build Prompt
```

**Proposed (Phase 3.2):**
```
User Query → Semantic Embedding → Similarity Calculation → Module Selection → Build Prompt
```

### Implementation

#### File: `backend/core/prompts/semantic_router.py`

```python
"""
Semantic Prompt Router
Phase 3.2 - Optional Upgrade

Uses semantic similarity for intelligent module selection.
"""
from typing import List, Dict
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

from core.prompts.router import DynamicPromptRouter
from core.prompts.module_manager import PromptModule
from core.utils.logger import logger


class SemanticPromptRouter(DynamicPromptRouter):
    """
    Semantic similarity-based router.
    
    Upgrades keyword-based routing with semantic understanding.
    Falls back to keyword matching if semantic fails.
    """
    
    def __init__(self, model_name: str = 'all-MiniLM-L6-v2'):
        """
        Initialize semantic router.
        
        Args:
            model_name: SentenceTransformer model to use
        """
        super().__init__()
        
        # Load semantic model
        self.model = SentenceTransformer(model_name)
        
        # Compute module embeddings
        self.module_embeddings = self._compute_module_embeddings()
        
        logger.info(f"🧠 SemanticPromptRouter initialized with {model_name}")
    
    def _compute_module_embeddings(self) -> Dict[PromptModule, np.ndarray]:
        """
        Compute embeddings for each module.
        
        Returns:
            Dictionary mapping modules to embeddings
        """
        module_descriptions = {
            PromptModule.TOOL_TOOLKIT: 
                "file operations, create, edit, read, write, delete, list, "
                "web browsing, search, navigate, url, website, "
                "terminal commands, shell, execute, run, "
                "screenshots, images, visual content",
            
            PromptModule.TOOL_DATA_PROCESSING:
                "data analysis, csv, json, xml, parse, extract, transform, "
                "scraping, tables, spreadsheets, databases, queries",
            
            PromptModule.TOOL_WORKFLOW:
                "tasks, workflows, steps, planning, organization, "
                "project setup, initialization, configuration, "
                "deployment, building, installation, packages",
            
            PromptModule.TOOL_CONTENT_CREATION:
                "writing, blogs, articles, posts, content creation, "
                "documents, reports, presentations, slides, "
                "readme, documentation, guides, tutorials"
        }
        
        embeddings = {}
        for module, description in module_descriptions.items():
            embedding = self.model.encode(description)
            embeddings[module] = embedding
        
        return embeddings
    
    def route(self, user_query: str, threshold: float = 0.5) -> List[PromptModule]:
        """
        Route query using semantic similarity.
        
        Args:
            user_query: User's query string
            threshold: Similarity threshold (0-1)
        
        Returns:
            List of modules to include
        """
        try:
            # Always include core modules
            modules = [
                PromptModule.CORE_IDENTITY,
                PromptModule.CORE_WORKSPACE,
                PromptModule.CORE_CRITICAL_RULES,
                PromptModule.RESPONSE_FORMAT
            ]
            
            # Get query embedding
            query_embedding = self.model.encode(user_query)
            
            # Calculate similarity with each module
            similarities = {}
            for module, module_embedding in self.module_embeddings.items():
                similarity = cosine_similarity(
                    query_embedding.reshape(1, -1),
                    module_embedding.reshape(1, -1)
                )[0][0]
                similarities[module] = similarity
                
                if similarity >= threshold:
                    modules.append(module)
            
            # If no modules matched, use keyword fallback
            if len(modules) == 4:  # Only core modules
                logger.warning("No semantic matches, falling back to keyword routing")
                return super().route(user_query)
            
            # Log routing decision
            logger.info(f"🧠 Semantic routing: {len(modules)} modules selected")
            logger.debug(f"   Similarities: {similarities}")
            
            # Log to GlitchTip
            try:
                import sentry_sdk
                sentry_sdk.set_context("semantic_routing", {
                    "query_length": len(user_query),
                    "query_preview": user_query[:200],
                    "modules_selected": [m.value for m in modules],
                    "module_count": len(modules),
                    "similarities": {m.value: float(s) for m, s in similarities.items()},
                    "threshold": threshold
                })
                sentry_sdk.capture_message(
                    f"Semantic routing: {len(modules)} modules, avg similarity {np.mean(list(similarities.values())):.2f}",
                    level="info"
                )
            except Exception as e:
                logger.warning(f"Failed to log semantic routing to GlitchTip: {e}")
            
            return modules
        
        except Exception as e:
            logger.error(f"Semantic routing failed: {e}, falling back to keyword routing")
            return super().route(user_query)
    
    def analyze_query(self, user_query: str) -> Dict[str, any]:
        """
        Analyze query with semantic information.
        
        Args:
            user_query: User's query string
        
        Returns:
            Analysis results with similarities
        """
        # Get base analysis
        analysis = super().analyze_query(user_query)
        
        # Add semantic information
        query_embedding = self.model.encode(user_query)
        
        similarities = {}
        for module, module_embedding in self.module_embeddings.items():
            similarity = cosine_similarity(
                query_embedding.reshape(1, -1),
                module_embedding.reshape(1, -1)
            )[0][0]
            similarities[module.value] = float(similarity)
        
        analysis["semantic_similarities"] = similarities
        analysis["routing_method"] = "semantic"
        
        return analysis


# Singleton instance
_semantic_router_instance = None


def get_semantic_router() -> SemanticPromptRouter:
    """Get singleton instance of SemanticPromptRouter"""
    global _semantic_router_instance
    if _semantic_router_instance is None:
        _semantic_router_instance = SemanticPromptRouter()
    return _semantic_router_instance
```

---

## 🧪 Testing Plan

### Unit Tests

**File:** `backend/validate_phase3_task2.py`

**Tests:**
1. Semantic router initialization
2. Module embedding computation
3. Similarity calculation
4. Threshold-based selection
5. Fallback to keyword routing
6. Performance benchmarking
7. Accuracy comparison
8. Edge cases

**Expected Results:**
- All tests pass
- Accuracy > 95%
- Performance < 100ms
- Fallback working

### Integration Tests

**Tests:**
1. Integration with ThreadManager
2. Integration with ModularPromptBuilder
3. End-to-end routing
4. GlitchTip logging
5. Error handling

### A/B Tests

**Compare:**
- Keyword routing (Phase 3.1)
- Semantic routing (Phase 3.2)

**Metrics:**
- Accuracy
- Performance
- Cost reduction
- Quality

**Success Criteria:**
- Semantic >= 98% of keyword quality
- Semantic accuracy > keyword accuracy
- Performance acceptable (<100ms)

---

## 📊 Expected Results

### Performance

**Routing Time:**
- Keyword (Phase 3.1): 0.54ms
- Semantic (Phase 3.2): 50-100ms (expected)
- **Trade-off:** Slower but more accurate

### Accuracy

**Module Selection:**
- Keyword: ~90% accuracy
- Semantic: ~95% accuracy (expected)
- **Improvement:** +5% accuracy

### Cost Reduction

**Prompt Size:**
- Keyword: 21.1% reduction
- Semantic: 40-50% reduction (expected)
- **Improvement:** +20-30% reduction

### Quality

**Functional Equivalence:**
- Target: 100%
- Expected: 100%
- **Status:** Maintained

---

## 🚀 Implementation Plan

### Week 1-2: Development
- [ ] Implement SemanticPromptRouter
- [ ] Compute module embeddings
- [ ] Add similarity calculation
- [ ] Implement fallback logic
- [ ] Add GlitchTip logging

### Week 3-4: Testing
- [ ] Unit tests (8 tests)
- [ ] Integration tests (5 tests)
- [ ] A/B tests (15 cases)
- [ ] Performance benchmarks
- [ ] Accuracy validation

### Week 5-6: Integration & Deployment
- [ ] Integrate with ThreadManager
- [ ] Add feature flag
- [ ] Deploy to staging
- [ ] Monitor for 1 week
- [ ] Deploy to production

---

## 🎯 Decision Criteria

### When to Implement Phase 3.2

**Implement if:**
- ✅ Phase 3.1 production data shows need for better accuracy
- ✅ Complex queries are not handled well by keyword routing
- ✅ Budget allows ($30k available)
- ✅ ROI is positive (10-month payback acceptable)

**Don't implement if:**
- ❌ Phase 3.1 is working well enough
- ❌ Budget constraints
- ❌ Other priorities are higher
- ❌ ROI is not acceptable

### Recommendation

**Wait 1 month** after Phase 3.1 deployment to:
1. Collect production data
2. Analyze routing accuracy
3. Identify problem queries
4. Calculate actual ROI
5. Make informed decision

---

## 📋 Summary

**Phase 3.2 Status:** ✅ **DEFINED, NOT IMPLEMENTED**

**Key Points:**
- Optional upgrade to Phase 3.1
- Uses semantic similarity
- Expected: 40-50% reduction (vs 21.1%)
- Investment: $30k, 4-6 weeks
- ROI: 10 months payback

**Recommendation:**
- ⏸️ **WAIT** 1 month for Phase 3.1 data
- 📊 **EVALUATE** actual need and ROI
- ✅ **DECIDE** based on production metrics

---

**Prepared by:** James (Full Stack Developer)  
**Date:** 2025-10-01  
**Status:** SPECIFICATION COMPLETE, AWAITING DECISION

