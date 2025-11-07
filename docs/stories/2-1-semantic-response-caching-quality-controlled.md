# Story 2.1: Semantic Response Caching (Quality-Controlled)

Status: ready-for-dev

## Story

As a system administrator,  
I want to implement semantic response caching với high similarity threshold,  
so that I can reduce API calls by 20-40% for semantically similar queries while maintaining response quality.

## Acceptance Criteria

1. `SemanticCache` class được implemented trong `backend/core/optimizations/semantic_cache.py`
2. Semantic similarity threshold được configured (default 0.95, configurable)
3. Quality validation được integrated để monitor impact
4. System có thể auto-disable semantic caching nếu quality drops below threshold
5. Cache hit rate và false positive rate được monitored
6. Quality maintained at 95-100% (monitored)

## Tasks / Subtasks

- [ ] Task 1: Implement SemanticCache class (AC: #1)
  - [ ] Create `backend/core/optimizations/semantic_cache.py`
  - [ ] Implement `SemanticCache` class với vector similarity search
  - [ ] Integrate với existing Redis infrastructure
  - [ ] Implement cache key generation với semantic hash
  - [ ] Test SemanticCache class với sample queries
  - [ ] **Testing:** Unit test SemanticCache class
  - [ ] **Testing:** Integration test với Redis

- [ ] Task 2: Configure similarity threshold (AC: #2)
  - [ ] Set default similarity threshold to 0.95 (95% similarity)
  - [ ] Make threshold configurable via environment variable
  - [ ] Document threshold configuration và best practices
  - [ ] Test với different threshold values (0.90, 0.95, 0.98)
  - [ ] **Testing:** Unit test threshold configuration
  - [ ] **Testing:** Integration test threshold behavior

- [ ] Task 3: Integrate quality validation (AC: #3)
  - [ ] Implement quality validation checks (human evaluation on samples)
  - [ ] Monitor quality metrics (response_similarity, error_rate)
  - [ ] Set quality threshold (e.g., 95% similarity required)
  - [ ] Test quality validation với sample requests
  - [ ] **Testing:** Unit test quality validation logic
  - [ ] **Testing:** Integration test quality monitoring

- [ ] Task 4: Implement auto-disable mechanism (AC: #4)
  - [ ] Add auto-disable logic nếu quality drops below threshold
  - [ ] Log quality degradation events
  - [ ] Fallback to exact match caching nếu semantic caching disabled
  - [ ] Test auto-disable mechanism với degraded quality scenarios
  - [ ] **Testing:** Unit test auto-disable logic
  - [ ] **Testing:** Integration test fallback mechanism

- [ ] Task 5: Monitor cache metrics (AC: #5)
  - [ ] Track cache_hit_rate (semantic matches)
  - [ ] Track false_positive_rate (incorrect matches)
  - [ ] Log cache metrics (hits, misses, false positives)
  - [ ] Add cache metrics to monitoring dashboard
  - [ ] Test metrics tracking với sample requests
  - [ ] **Testing:** Unit test cache metrics extraction
  - [ ] **Testing:** Integration test metrics logging

- [ ] Task 6: Quality validation testing (AC: #6)
  - [ ] Compare semantic cached vs non-cached responses
  - [ ] Verify 95-100% quality maintained (semantic similarity check)
  - [ ] Document quality validation results
  - [ ] Add quality checks to monitoring
  - [ ] **Testing:** Automated similarity testing (semantic similarity check)
  - [ ] **Testing:** A/B testing framework setup

## Dev Notes

### Requirements Context Summary

**Source:** [docs/epics-optimization.md#story-21-semantic-response-caching-quality-controlled](docs/epics-optimization.md#story-21-semantic-response-caching-quality-controlled)

**Epic Goal:** Implement minimal quality impact optimizations (<5%) để đạt 40-50% total cost reduction với quality monitoring và auto-rollback.

**Story Context:**
- **Effort:** 4 hours
- **Expected Savings:** $8-15/month (additional 20-40% API call reduction)
- **Quality Impact:** ⚠️ MINIMAL (<5% quality impact acceptable)
- **Code Location:** `backend/core/optimizations/semantic_cache.py` (new file)
- **Prerequisites:** Story 1.2 (LiteLLM Redis caching foundation), Story 1.4 (Dual-mode architecture)

**Technical Requirements:**
- Semantic caching requires vector similarity search
- High similarity threshold (0.95) để ensure quality
- Quality validation và monitoring required
- Auto-disable mechanism nếu quality degrades
- Cache metrics tracking (hit rate, false positive rate)

### Learnings from Previous Story

**Previous Story:** [docs/stories/1-4-dual-mode-architecture-implementation.md](docs/stories/1-4-dual-mode-architecture-implementation.md)

**Status:** ready-for-dev (not yet implemented)

**Note:** Story 1.2 implements exact match caching (100% quality). Story 2.1 adds semantic caching (95-100% quality) for semantically similar queries. This story requires quality monitoring và auto-disable mechanism to ensure quality is maintained.

### Project Structure Notes

**Current Implementation:**
- Exact match caching exists trong Story 1.2 (LiteLLM Redis caching)
- Redis infrastructure is available
- No existing semantic caching implementation
- No vector similarity search implementation

**Optimization Strategy:**
- **Semantic Similarity**: Use vector embeddings để find semantically similar queries
- **High Threshold**: Default 0.95 (95% similarity) để ensure quality
- **Quality Monitoring**: Track quality metrics và auto-disable nếu quality drops
- **Fallback**: Fallback to exact match caching nếu semantic caching disabled
- **Metrics**: Track cache_hit_rate và false_positive_rate

**Files to Create:**
- `backend/core/optimizations/semantic_cache.py` - New SemanticCache class

**Files to Modify:**
- `backend/core/services/llm.py` - Integrate semantic caching vào LLM calls
- `backend/core/utils/config.py` - Add semantic cache configuration

**Dependencies:**
- Vector similarity library (e.g., `sentence-transformers`, `faiss`, or `chromadb`)
- Redis for cache storage
- Quality monitoring framework (Story 2.4 will enhance this)

### Architecture Constraints

**From:** [docs/optimization-master-plan-v1.1.md](docs/optimization-master-plan-v1.1.md)

**Key Principles:**
- Quality-first approach: Minimal quality impact (<5%) acceptable
- Dual-mode architecture: Original mode (baseline) + Optimized mode (with semantic caching)
- Feature flags: Easy switching và rollback
- Quality monitoring: Continuous quality validation với auto-disable

**LLM Integration:**
- LiteLLM được sử dụng cho multi-provider support
- OpenAI Compatible API (v98store) được sử dụng
- Current models: gpt-4o-mini, qwen3-30b, deepseek-v3-1, qwen3-235b, claude-haiku-4-5

**Semantic Caching Requirements:**
- Similarity threshold: Default 0.95 (configurable)
- Quality threshold: 95% similarity required
- Auto-disable: If quality drops below threshold
- Metrics: Track hit rate và false positive rate

**Vector Similarity:**
- Need to choose vector similarity library
- Embeddings can be generated using existing LLM or dedicated embedding model
- Cache vectors in Redis hoặc dedicated vector database

### Testing Standards

**Quality Validation:**
- Compare semantic cached vs non-cached responses
- Verify 95-100% quality maintained (semantic similarity check)
- Test với multiple query types
- Monitor false positive rate

**Performance Testing:**
- Measure cache hit rate (semantic matches)
- Track cost savings
- Monitor latency improvement
- Test với different similarity thresholds

**Integration Testing:**
- Test với existing LLM calls
- Verify no breaking changes
- Test với different models
- Test với different agent configurations
- Test auto-disable mechanism
- Test fallback to exact match caching

### References

- [Source: docs/epics-optimization.md#story-21-semantic-response-caching-quality-controlled](docs/epics-optimization.md#story-21-semantic-response-caching-quality-controlled)
- [Source: docs/optimization-master-plan-v1.1.md#phase-2-quality-preserving-medium-optimizations](docs/optimization-master-plan-v1.1.md#phase-2-quality-preserving-medium-optimizations)
- [Source: docs/research-prompt-optimization.md#54-semantic-response-caching](docs/research-prompt-optimization.md#54-semantic-response-caching)
- [Source: backend/core/services/llm.py::make_llm_api_call()](backend/core/services/llm.py#L180-L303)
- [Source: backend/core/services/redis.py](backend/core/services/redis.py) - Redis infrastructure
- [Source: docs/stories/1-4-dual-mode-architecture-implementation.md](docs/stories/1-4-dual-mode-architecture-implementation.md) - Previous story

## Dev Agent Record

### Context Reference

- [docs/stories/2-1-semantic-response-caching-quality-controlled.context.xml](docs/stories/2-1-semantic-response-caching-quality-controlled.context.xml)

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-11-07 | 1.0 | Initial story draft | BMAD Architect Agent |

