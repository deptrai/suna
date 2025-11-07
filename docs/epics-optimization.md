# ChainLens AI Worker - Epic Breakdown: LLM Optimization

**Author:** Luis  
**Date:** 2025-11-07  
**Project:** ChainLens AI Worker  
**Source:** optimization-master-plan-v1.1.md

---

## Overview

Epic breakdown này implement **Quality-Preserving LLM Optimizations** từ Master Optimization Plan v1.1, tập trung vào optimizations **không giảm chất lượng** (95-100% quality maintained) với dual-mode architecture cho phép switch giữa Original và Optimized modes.

**Epic Sequencing:**
- **Epic 1**: Phase 1 - Quality-Preserving Quick Wins (Zero Quality Impact)
- **Epic 2**: Phase 2 - Quality-Preserving Medium Optimizations (Minimal Quality Impact <5%)

**Key Principles:**
- Quality-first approach: Chỉ implement optimizations không ảnh hưởng chất lượng
- Dual-mode architecture: Original mode (baseline) + Optimized mode (with caching)
- Feature flags: Easy switching và rollback
- Gradual rollout: 5% → 25% → 50% → 100% traffic

---

## Epic 1: LLM Optimization - Quality-Preserving Phase 1

**Goal:** Implement zero quality impact optimizations (caching only) để giảm 20-30% cost mà vẫn duy trì 100% quality.

**Value Proposition:** 
- Giảm chi phí LLM 20-30% ($26-43/month savings)
- Zero quality impact (100% quality maintained)
- Low risk (có thể rollback anytime)
- Foundation cho advanced optimizations

**Expected Results:**
- Cost reduction: 20-30%
- Quality: 100% maintained
- Latency: 40-60% improvement (caching)
- Risk: Very Low

---

### Story 1.1: Enable OpenAI Prompt Caching

**As a** system administrator,  
**I want** to enable OpenAI prompt caching for system prompts,  
**So that** I can reduce LLM costs by 30-50% for cached tokens without any quality impact.

**Acceptance Criteria:**
1. System prompt được restructure với static content first (để enable caching)
2. Prompts đảm bảo > 1,024 tokens (threshold cho OpenAI caching)
3. Monitor `cached_tokens` trong responses và log metrics
4. Cache hit rate được track và report trong monitoring dashboard
5. No quality degradation (100% similarity với original responses)

**Prerequisites:** None (foundational story)

**Technical Details:**
- **Code Location:** `backend/core/run.py::PromptManager.build_system_prompt()`
- **Effort:** 30 minutes
- **Expected Savings:** $18-27/month
- **Quality Impact:** ✅ ZERO (100% maintained)

---

### Story 1.2: LiteLLM Redis Response Caching (Exact Matches)

**As a** system administrator,  
**I want** to configure LiteLLM Redis caching for exact response matches,  
**So that** I can reduce API calls by 10-20% for duplicate queries without quality impact.

**Acceptance Criteria:**
1. Redis instance được setup và configured cho LiteLLM
2. LiteLLM Redis caching được enable với exact match strategy (no semantic)
3. Cache keys được namespaced để prevent cross-contamination
4. Cache TTL được configured appropriately (default 1 hour)
5. Cache hit/miss metrics được tracked và logged
6. No quality degradation (exact matches = same responses)

**Prerequisites:** Story 1.1 (prompt caching foundation)

**Technical Details:**
- **Code Location:** `backend/core/services/llm.py`
- **Effort:** 2 hours
- **Expected Savings:** $5-10/month
- **Quality Impact:** ✅ ZERO (100% maintained)

---

### Story 1.3: Anthropic Explicit Caching

**As a** system administrator,  
**I want** to enable Anthropic explicit caching với cache_control directives,  
**So that** Claude users có thể benefit từ 20-30% cost reduction cho cached tokens.

**Acceptance Criteria:**
1. `cache_control` directives được add cho Claude models trong LLM calls
2. Cache TTL được configured (default 5 minutes, configurable to 1 hour)
3. Cache creation/read tokens được tracked trong response usage
4. Cache metrics được logged và reported
5. No quality degradation (cached computation = same result)

**Prerequisites:** Story 1.2 (LiteLLM caching foundation)

**Technical Details:**
- **Code Location:** `backend/core/services/llm.py::make_llm_api_call()`
- **Effort:** 1 hour
- **Expected Savings:** $3-6/month (if using Claude)
- **Quality Impact:** ✅ ZERO (100% maintained)

---

### Story 1.4: Dual-Mode Architecture Implementation

**As a** system administrator,  
**I want** to implement dual-mode architecture (Original + Optimized) với feature flags,  
**So that** I can switch between modes và rollback anytime nếu có issues.

**Acceptance Criteria:**
1. `OptimizationMode` enum được created (ORIGINAL, OPTIMIZED, AUTO)
2. `OptimizationConfig` class được implemented với feature flags
3. `PromptManager.build_system_prompt()` được updated để support dual-mode
4. `_build_original_prompt()` method preserves current implementation (no changes)
5. `_build_optimized_prompt()` method applies quality-preserving optimizations
6. Feature flags được configurable via environment variables
7. Mode switching được tested và documented
8. Rollback mechanism được verified (switch to ORIGINAL mode anytime)

**Prerequisites:** Stories 1.1, 1.2, 1.3 (caching implementations)

**Technical Details:**
- **Code Location:** `backend/core/utils/config.py`, `backend/core/run.py`
- **Effort:** 2 hours
- **Expected Savings:** Enables all Phase 1 optimizations
- **Quality Impact:** ✅ ZERO (original mode unchanged)

---

## Epic 2: LLM Optimization - Quality-Preserving Phase 2

**Goal:** Implement minimal quality impact optimizations (<5%) để đạt 40-50% total cost reduction với quality monitoring và auto-rollback.

**Value Proposition:**
- Additional 20-30% cost reduction (total 40-50%)
- Quality maintained at 95-100% (monitored)
- Quality validation framework với auto-rollback
- Foundation cho advanced optimizations

**Expected Results:**
- Cost reduction: 40-50% total (combined Phase 1-2)
- Quality: 95-100% maintained (monitored)
- Latency: Additional 15-25% improvement
- Risk: Low (with quality monitoring)

---

### Story 2.1: Semantic Response Caching (Quality-Controlled)

**As a** system administrator,  
**I want** to implement semantic response caching với high similarity threshold (0.95),  
**So that** I can reduce API calls by 20-40% while maintaining 95-100% quality.

**Acceptance Criteria:**
1. `SemanticCache` class được implemented với Redis + embeddings
2. Similarity threshold được set to 0.95 (high threshold for quality)
3. Quality validation framework được implemented (human eval sample)
4. False positive rate được monitored và logged
5. Auto-disable mechanism được implemented nếu quality drops below 0.90
6. Cache hit/miss metrics được tracked
7. Quality metrics (similarity scores) được reported

**Prerequisites:** Epic 1 (Phase 1 caching foundation)

**Technical Details:**
- **Code Location:** `backend/core/optimizations/semantic_cache.py`
- **Effort:** 4 hours
- **Expected Savings:** $8-16/month
- **Quality Impact:** ⚠️ <5% (95-100% maintained với monitoring)

---

### Story 2.2: Message History Compression (Quality-Preserving)

**As a** system administrator,  
**I want** to implement message history compression với sliding window và summarization,  
**So that** I can reduce conversation context costs by 10-20% while preserving key information.

**Acceptance Criteria:**
1. `MessageHistoryCompressor` class được implemented
2. Sliding window logic được implemented (keep recent 10 messages)
3. Summarization được implemented cho old messages (quality-checked)
4. Context preservation được tested và validated
5. Token reduction được tracked và reported
6. Quality metrics được monitored (context completeness)
7. Rollback mechanism nếu quality drops

**Prerequisites:** Epic 1 (caching foundation)

**Technical Details:**
- **Code Location:** `backend/core/optimizations/history_compressor.py`
- **Effort:** 4 hours
- **Expected Savings:** $6-12/month
- **Quality Impact:** ⚠️ <5% (95-100% maintained với testing)

---

### Story 2.3: Tool Schema Optimization (Minimal Format)

**As a** system administrator,  
**I want** to optimize tool schema format từ full JSON sang minimal format,  
**So that** I can reduce prompt tokens by 15-25% while maintaining tool calling accuracy.

**Acceptance Criteria:**
1. Tool schema format được changed từ full JSON sang minimal (name + description)
2. Tool calling success rate được tested và validated (must be ≥95%)
3. Rollback mechanism được implemented nếu success rate <95%
4. Token reduction được tracked và reported
5. Tool calling accuracy metrics được monitored
6. Quality validation được performed (tool success rate)

**Prerequisites:** Epic 1 (dual-mode architecture)

**Technical Details:**
- **Code Location:** `backend/core/run.py::PromptManager._format_tools()`
- **Effort:** 2 hours
- **Expected Savings:** $9-15/month
- **Quality Impact:** ⚠️ <5% (95-100% maintained nếu tool calling works)

---

### Story 2.4: Quality Monitoring Framework

**As a** system administrator,  
**I want** to implement quality monitoring framework với auto-rollback,  
**So that** I can ensure optimizations maintain quality và automatically rollback nếu quality drops.

**Acceptance Criteria:**
1. `QualityMonitor` class được implemented với metrics tracking
2. Quality metrics được defined (similarity, tool success rate, error rate, user satisfaction)
3. Quality validation được implemented (automated + human eval)
4. Auto-rollback mechanism được implemented nếu quality drops below thresholds
5. Quality dashboard được created để monitor metrics
6. A/B testing framework được implemented (original vs optimized)
7. Quality reports được generated và logged

**Prerequisites:** Stories 2.1, 2.2, 2.3 (optimizations to monitor)

**Technical Details:**
- **Code Location:** `backend/core/optimizations/quality_monitor.py`
- **Effort:** 3 hours
- **Expected Savings:** Enables safe rollout of Phase 2 optimizations
- **Quality Impact:** ✅ ZERO (monitoring only)

---

## Story Sequencing and Dependencies

**Epic 1 Flow:**
```
1.1 (Prompt Caching) → 1.2 (Redis Caching) → 1.3 (Anthropic Caching) → 1.4 (Dual-Mode)
```

**Epic 2 Flow:**
```
2.1 (Semantic Cache) → 2.2 (History Compression) → 2.3 (Tool Optimization) → 2.4 (Quality Monitoring)
```

**Cross-Epic Dependencies:**
- Epic 2 requires Epic 1 completion (caching foundation)
- Story 2.4 (Quality Monitoring) should be implemented early để monitor other optimizations

---

## Success Metrics

**Epic 1 Success Criteria:**
- ✅ 20-30% cost reduction achieved
- ✅ 100% quality maintained (no degradation)
- ✅ Cache hit rate >30% for prompts
- ✅ Dual-mode switching working
- ✅ Zero production issues

**Epic 2 Success Criteria:**
- ✅ 40-50% total cost reduction achieved
- ✅ 95-100% quality maintained (monitored)
- ✅ Quality monitoring framework operational
- ✅ Auto-rollback tested and working
- ✅ A/B testing framework operational

---

## Notes

- **Quality-First Approach:** Tất cả optimizations được designed để maintain quality
- **Gradual Rollout:** Deploy optimized mode với 5% → 25% → 50% → 100% traffic
- **Feature Flags:** Easy switching và rollback via environment variables
- **Monitoring:** Comprehensive metrics tracking cho cost, quality, và performance
- **Documentation:** All changes được documented với rationale và testing results

---

**For implementation:** Use the `create-story` workflow to generate individual story implementation plans from this epic breakdown.

