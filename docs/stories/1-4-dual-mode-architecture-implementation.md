# Story 1.4: Dual-Mode Architecture Implementation

Status: ready-for-dev

## Story

As a system administrator,  
I want to implement dual-mode architecture (Original + Optimized) với feature flags,  
so that I can switch between modes và rollback anytime nếu có issues.

## Acceptance Criteria

1. `OptimizationMode` enum được created (ORIGINAL, OPTIMIZED, AUTO)
2. `OptimizationConfig` class được implemented với feature flags
3. `PromptManager.build_system_prompt()` được updated để support dual-mode
4. `_build_original_prompt()` method preserves current implementation (no changes)
5. `_build_optimized_prompt()` method applies quality-preserving optimizations
6. Feature flags được configurable via environment variables
7. Mode switching được tested và documented
8. Rollback mechanism được verified (switch to ORIGINAL mode anytime)

## Tasks / Subtasks

- [ ] Task 1: Create OptimizationMode enum và OptimizationConfig class (AC: #1, #2)
  - [ ] Create `OptimizationMode` enum với values: ORIGINAL, OPTIMIZED, AUTO
  - [ ] Create `OptimizationConfig` class trong `backend/core/utils/config.py`
  - [ ] Add `OPTIMIZATION_MODE` configuration với default value (ORIGINAL)
  - [ ] Make mode configurable via environment variable (e.g., `OPTIMIZATION_MODE`)
  - [ ] Add feature flags for individual optimizations (if needed)
  - [ ] Document configuration options
  - [ ] **Testing:** Unit test OptimizationConfig class
  - [ ] **Testing:** Integration test configuration loading

- [ ] Task 2: Update PromptManager.build_system_prompt() for dual-mode (AC: #3)
  - [ ] Modify `PromptManager.build_system_prompt()` to check `OptimizationConfig.OPTIMIZATION_MODE`
  - [ ] Add conditional logic to switch between `_build_original_prompt()` và `_build_optimized_prompt()`
  - [ ] Ensure backward compatibility (default to ORIGINAL mode)
  - [ ] Test mode switching với different configurations
  - [ ] **Testing:** Unit test mode switching logic
  - [ ] **Testing:** Integration test với actual LLM calls

- [ ] Task 3: Implement _build_original_prompt() method (AC: #4)
  - [ ] Extract current prompt building logic từ `build_system_prompt()`
  - [ ] Move to `_build_original_prompt()` method (preserve exact implementation)
  - [ ] Ensure no changes to original logic (100% identical behavior)
  - [ ] Test original prompt generation matches current implementation
  - [ ] **Testing:** Unit test original prompt generation
  - [ ] **Testing:** Integration test prompt structure matches current

- [ ] Task 4: Implement _build_optimized_prompt() method (AC: #5)
  - [ ] Create `_build_optimized_prompt()` method
  - [ ] Apply quality-preserving optimizations from Stories 1.1, 1.2, 1.3:
    - Restructure prompt với static content first (Story 1.1)
    - Enable LiteLLM Redis caching (Story 1.2)
    - Add Anthropic cache_control directives (Story 1.3)
  - [ ] Ensure optimized prompt maintains 100% quality
  - [ ] Test optimized prompt generation
  - [ ] **Testing:** Unit test optimized prompt generation
  - [ ] **Testing:** Integration test optimized prompt structure

- [ ] Task 5: Configure feature flags via environment variables (AC: #6)
  - [ ] Add environment variable `OPTIMIZATION_MODE` (ORIGINAL, OPTIMIZED, AUTO)
  - [ ] Add optional feature flags for individual optimizations (if needed)
  - [ ] Document environment variable configuration
  - [ ] Test configuration loading từ environment variables
  - [ ] **Testing:** Unit test environment variable parsing
  - [ ] **Testing:** Integration test configuration loading

- [ ] Task 6: Test mode switching và rollback (AC: #7, #8)
  - [ ] Test switching from ORIGINAL to OPTIMIZED mode
  - [ ] Test switching from OPTIMIZED back to ORIGINAL mode (rollback)
  - [ ] Test AUTO mode (if implemented)
  - [ ] Verify rollback mechanism works correctly
  - [ ] Document mode switching process
  - [ ] **Testing:** Unit test mode switching
  - [ ] **Testing:** Integration test rollback mechanism
  - [ ] **Testing:** A/B testing framework setup

## Dev Notes

### Requirements Context Summary

**Source:** [docs/epics-optimization.md#story-14-dual-mode-architecture-implementation](docs/epics-optimization.md#story-14-dual-mode-architecture-implementation)

**Epic Goal:** Implement zero quality impact optimizations (caching only) để giảm 20-30% cost mà vẫn duy trì 100% quality.

**Story Context:**
- **Effort:** 2 hours
- **Expected Savings:** Enables all Phase 1 optimizations
- **Quality Impact:** ✅ ZERO (original mode unchanged)
- **Code Location:** `backend/core/utils/config.py`, `backend/core/run.py`
- **Prerequisites:** Stories 1.1, 1.2, 1.3 (caching implementations)

**Technical Requirements:**
- Dual-mode architecture: Original mode (baseline) + Optimized mode (with caching)
- Feature flags: Easy switching và rollback
- Mode switching: Configurable via environment variables
- Rollback mechanism: Switch to ORIGINAL mode anytime

### Learnings from Previous Story

**Previous Story:** [docs/stories/1-3-anthropic-explicit-caching.md](docs/stories/1-3-anthropic-explicit-caching.md)

**Status:** ready-for-dev (not yet implemented)

**Note:** Stories 1.1, 1.2, 1.3 implement individual caching optimizations. Story 1.4 creates the dual-mode architecture framework that enables switching between Original (baseline) và Optimized (with all caching) modes. This story is foundational for safe rollout và rollback capabilities.

### Project Structure Notes

**Current Implementation:**
- System prompt được build trong `backend/core/run.py::PromptManager.build_system_prompt()`
- No existing dual-mode architecture
- No optimization mode switching mechanism

**Optimization Strategy:**
- **Dual-Mode Architecture**: 
  - ORIGINAL mode: Current implementation (no changes)
  - OPTIMIZED mode: Apply all Phase 1 optimizations (Stories 1.1, 1.2, 1.3)
  - AUTO mode: Auto-select based on metrics (future enhancement)
- **Feature Flags**: Environment variable `OPTIMIZATION_MODE` controls mode
- **Rollback**: Switch to ORIGINAL mode anytime via environment variable

**Files to Modify:**
- `backend/core/utils/config.py` - Add `OptimizationConfig` class với `OptimizationMode` enum
- `backend/core/run.py` - Modify `PromptManager.build_system_prompt()` to support dual-mode

**New Files:**
- None (chỉ modifications to existing files)

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

**Dual-Mode Requirements:**
- ORIGINAL mode: Preserve current implementation exactly (no changes)
- OPTIMIZED mode: Apply quality-preserving optimizations (Stories 1.1, 1.2, 1.3)
- AUTO mode: Auto-select based on metrics (optional, future enhancement)
- Rollback: Switch to ORIGINAL mode anytime

### Testing Standards

**Quality Validation:**
- Compare ORIGINAL vs OPTIMIZED mode responses
- Verify ORIGINAL mode maintains 100% identical behavior
- Verify OPTIMIZED mode maintains 100% quality
- Test mode switching không break functionality

**Performance Testing:**
- Measure cost savings với OPTIMIZED mode
- Monitor quality metrics (similarity, error rate)
- Test rollback mechanism (switch back to ORIGINAL)
- Test với different configurations

**Integration Testing:**
- Test với existing LLM calls
- Verify no breaking changes
- Test với different models
- Test với different agent configurations
- Test mode switching trong production-like environment

### References

- [Source: docs/epics-optimization.md#story-14-dual-mode-architecture-implementation](docs/epics-optimization.md#story-14-dual-mode-architecture-implementation)
- [Source: docs/optimization-master-plan-v1.1.md#phase-1-quality-preserving-quick-wins](docs/optimization-master-plan-v1.1.md#phase-1-quality-preserving-quick-wins)
- [Source: docs/optimization-master-plan-v1.1.md#dual-mode-architecture](docs/optimization-master-plan-v1.1.md#dual-mode-architecture)
- [Source: backend/core/run.py::PromptManager.build_system_prompt()](backend/core/run.py#L326-L491)
- [Source: backend/core/utils/config.py](backend/core/utils/config.py) - Configuration management
- [Source: docs/stories/1-3-anthropic-explicit-caching.md](docs/stories/1-3-anthropic-explicit-caching.md) - Previous story

## Dev Agent Record

### Context Reference

- [docs/stories/1-4-dual-mode-architecture-implementation.context.xml](docs/stories/1-4-dual-mode-architecture-implementation.context.xml)

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-11-07 | 1.0 | Initial story draft | BMAD Architect Agent |

