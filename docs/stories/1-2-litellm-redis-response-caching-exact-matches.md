# Story 1.2: LiteLLM Redis Response Caching (Exact Matches)

Status: ready-for-dev

## Story

As a system administrator,  
I want to configure LiteLLM Redis caching for exact response matches,  
so that I can reduce API calls by 10-20% for duplicate queries without quality impact.

## Acceptance Criteria

1. Redis instance được setup và configured cho LiteLLM
2. LiteLLM Redis caching được enable với exact match strategy (no semantic)
3. Cache keys được namespaced để prevent cross-contamination
4. Cache TTL được configured appropriately (default 1 hour)
5. Cache hit/miss metrics được tracked và logged
6. No quality degradation (exact matches = same responses)

## Tasks / Subtasks

- [ ] Task 1: Setup Redis instance và configuration (AC: #1)
  - [ ] Verify Redis is running và accessible
  - [ ] Check Redis connection configuration trong environment variables
  - [ ] Configure Redis connection parameters (host, port, password if needed)
  - [ ] Test Redis connectivity từ backend service
  - [ ] **Testing:** Unit test Redis connection
  - [ ] **Testing:** Integration test Redis availability

- [ ] Task 2: Configure LiteLLM Redis caching (AC: #2)
  - [ ] Review LiteLLM caching documentation và configuration options
  - [ ] Configure LiteLLM to use Redis for caching (exact match only, no semantic)
  - [ ] Set cache type to "redis" (not "redis-semantic")
  - [ ] Verify caching is enabled trong LiteLLM configuration
  - [ ] Test caching với sample LLM calls
  - [ ] **Testing:** Unit test LiteLLM cache configuration
  - [ ] **Testing:** Integration test cache hit/miss behavior

- [ ] Task 3: Implement cache key namespacing (AC: #3)
  - [ ] Design cache key namespace strategy (e.g., "litellm:cache:{model}:{hash}")
  - [ ] Implement cache key generation với namespace prefix
  - [ ] Ensure cache keys are unique và prevent cross-contamination
  - [ ] Test cache key generation với different models và queries
  - [ ] **Testing:** Unit test cache key generation
  - [ ] **Testing:** Integration test namespace isolation

- [ ] Task 4: Configure cache TTL (AC: #4)
  - [ ] Set default cache TTL to 1 hour (3600 seconds)
  - [ ] Make TTL configurable via environment variable
  - [ ] Document TTL configuration và best practices
  - [ ] Test cache expiration với TTL
  - [ ] **Testing:** Unit test TTL configuration
  - [ ] **Testing:** Integration test cache expiration

- [ ] Task 5: Implement cache metrics tracking (AC: #5)
  - [ ] Extract cache hit/miss information từ LiteLLM responses
  - [ ] Log cache metrics (cache_hits, cache_misses, cache_hit_rate)
  - [ ] Add cache metrics to monitoring dashboard
  - [ ] Create cache metrics reporting
  - [ ] Test metrics tracking với sample requests
  - [ ] **Testing:** Unit test cache metrics extraction
  - [ ] **Testing:** Integration test metrics logging

- [ ] Task 6: Quality validation (AC: #6)
  - [ ] Compare cached vs non-cached responses
  - [ ] Verify 100% similarity (exact matches = same responses)
  - [ ] Document quality validation results
  - [ ] Add quality checks to monitoring
  - [ ] **Testing:** Automated similarity testing (exact match verification)
  - [ ] **Testing:** A/B testing framework setup

## Dev Notes

### Requirements Context Summary

**Source:** [docs/epics-optimization.md#story-12-litellm-redis-response-caching-exact-matches](docs/epics-optimization.md#story-12-litellm-redis-response-caching-exact-matches)

**Epic Goal:** Implement zero quality impact optimizations (caching only) để giảm 20-30% cost mà vẫn duy trì 100% quality.

**Story Context:**
- **Effort:** 2 hours
- **Expected Savings:** $5-10/month
- **Quality Impact:** ✅ ZERO (100% maintained)
- **Code Location:** `backend/core/services/llm.py`
- **Prerequisites:** Story 1.1 (prompt caching foundation)

**Technical Requirements:**
- LiteLLM Redis caching requires Redis instance running
- Exact match strategy (no semantic matching) để ensure quality
- Cache keys must be namespaced để prevent conflicts
- Default TTL: 1 hour (configurable)
- Cache metrics must be tracked và logged

### Learnings from Previous Story

**Previous Story:** [docs/stories/1-1-enable-openai-prompt-caching.md](docs/stories/1-1-enable-openai-prompt-caching.md)

**Status:** ready-for-dev (not yet implemented)

**Note:** Story 1.1 focuses on OpenAI prompt caching (restructuring prompt order). Story 1.2 builds on this foundation by adding LiteLLM Redis response caching for exact query matches. Both stories are part of Phase 1 quality-preserving optimizations.

### Project Structure Notes

**Current Implementation:**
- LLM API calls được handled trong `backend/core/services/llm.py::make_llm_api_call()`
- LiteLLM được sử dụng cho multi-provider support
- Redis instance should already be running (used for Dramatiq workers)
- No existing LiteLLM caching configuration

**Optimization Strategy:**
- **Exact Match Only**: Use "redis" cache type (not "redis-semantic") để ensure 100% quality
- **Namespace Strategy**: Use prefix "litellm:cache:" để prevent conflicts với other Redis keys
- **TTL Configuration**: Default 1 hour, configurable via environment variable
- **Metrics Tracking**: Extract cache hit/miss từ LiteLLM response metadata

**Files to Modify:**
- `backend/core/services/llm.py` - Add LiteLLM Redis caching configuration
- `backend/core/utils/config.py` - Add cache TTL configuration (if needed)

**New Files:**
- None (chỉ configuration changes)

### Architecture Constraints

**From:** [docs/optimization-master-plan-v1.1.md](docs/optimization-master-plan-v1.1.md)

**Key Principles:**
- Quality-first approach: Zero quality impact required
- Dual-mode architecture: Original mode (baseline) + Optimized mode (with caching)
- Feature flags: Easy switching và rollback
- Gradual rollout: 5% → 25% → 50% → 100% traffic

**LLM Integration:**
- LiteLLM được sử dụng cho multi-provider support
- OpenAI Compatible API (v98store) được sử dụng
- Current models: gpt-4o-mini, qwen3-30b, deepseek-v3-1, qwen3-235b, claude-haiku-4-5

**Caching Requirements:**
- LiteLLM Redis caching: Exact match only (no semantic)
- Cache TTL: 1 hour default (configurable)
- Cache keys: Namespaced để prevent conflicts
- Cache metrics: Track hit/miss rates

**Redis Infrastructure:**
- Redis should already be running (used for Dramatiq message broker)
- Connection configuration via environment variables
- No additional Redis setup required

### Testing Standards

**Quality Validation:**
- Compare cached vs non-cached responses
- Verify 100% similarity (exact match = same response)
- Test với multiple query types
- Monitor cache hit rate

**Performance Testing:**
- Measure cache hit rate
- Track cost savings
- Monitor latency improvement
- Test với different query patterns

**Integration Testing:**
- Test với existing LLM calls
- Verify no breaking changes
- Test với different models (OpenAI Compatible)
- Test với different agent configurations
- Test cache expiration với TTL

### References

- [Source: docs/epics-optimization.md#story-12-litellm-redis-response-caching-exact-matches](docs/epics-optimization.md#story-12-litellm-redis-response-caching-exact-matches)
- [Source: docs/optimization-master-plan-v1.1.md#phase-1-quality-preserving-quick-wins](docs/optimization-master-plan-v1.1.md#phase-1-quality-preserving-quick-wins)
- [Source: docs/research-prompt-optimization.md#53-litellm-universal-caching](docs/research-prompt-optimization.md#53-litellm-universal-caching)
- [Source: backend/core/services/llm.py::make_llm_api_call()](backend/core/services/llm.py#L180-L303)
- [Source: backend/core/utils/config.py](backend/core/utils/config.py) - Configuration management
- [Source: docs/stories/1-1-enable-openai-prompt-caching.md](docs/stories/1-1-enable-openai-prompt-caching.md) - Previous story

## Dev Agent Record

### Context Reference

- [docs/stories/1-2-litellm-redis-response-caching-exact-matches.context.xml](docs/stories/1-2-litellm-redis-response-caching-exact-matches.context.xml)

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-11-07 | 1.0 | Initial story draft | BMAD Architect Agent |

