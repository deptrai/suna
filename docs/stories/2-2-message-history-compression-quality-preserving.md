# Story 2.2: Message History Compression (Quality-Preserving)

Status: ready-for-dev

## Story

As a system administrator,  
I want to implement message history compression using sliding window và summarization,  
so that I can reduce prompt token count for long conversations while preserving critical context và quality.

## Acceptance Criteria

1. `MessageHistoryCompressor` class được implemented trong `backend/core/optimizations/history_compressor.py`
2. Sliding window được implemented để keep recent messages
3. Older messages được summarized using LLM với quality checks
4. Context preservation được tested through conversation flow
5. Token reduction for message history được measured
6. Quality maintained at 95-100% (monitored)

## Tasks / Subtasks

- [ ] Task 1: Implement MessageHistoryCompressor class (AC: #1)
  - [ ] Create `backend/core/optimizations/history_compressor.py`
  - [ ] Implement `MessageHistoryCompressor` class
  - [ ] Integrate với existing LLM calls for summarization
  - [ ] Test MessageHistoryCompressor class với sample conversations
  - [ ] **Testing:** Unit test MessageHistoryCompressor class
  - [ ] **Testing:** Integration test với LLM calls

- [ ] Task 2: Implement sliding window (AC: #2)
  - [ ] Define sliding window size (e.g., keep last 10 messages)
  - [ ] Implement logic to keep recent messages unchanged
  - [ ] Test sliding window với different conversation lengths
  - [ ] **Testing:** Unit test sliding window logic
  - [ ] **Testing:** Integration test với long conversations

- [ ] Task 3: Implement message summarization (AC: #3)
  - [ ] Create summarization prompt template
  - [ ] Use LLM to summarize older messages
  - [ ] Implement quality checks on summaries
  - [ ] Test summarization với sample conversations
  - [ ] **Testing:** Unit test summarization logic
  - [ ] **Testing:** Integration test summarization quality

- [ ] Task 4: Test context preservation (AC: #4)
  - [ ] Test conversation flow với compressed history
  - [ ] Verify critical context is preserved
  - [ ] Test với different conversation types
  - [ ] Document context preservation results
  - [ ] **Testing:** Integration test conversation flow
  - [ ] **Testing:** Quality validation tests

- [ ] Task 5: Measure token reduction (AC: #5)
  - [ ] Track token count before và after compression
  - [ ] Calculate token reduction percentage
  - [ ] Log token reduction metrics
  - [ ] Test với different conversation lengths
  - [ ] **Testing:** Unit test token counting
  - [ ] **Testing:** Integration test token reduction measurement

- [ ] Task 6: Quality validation (AC: #6)
  - [ ] Compare compressed vs non-compressed responses
  - [ ] Verify 95-100% quality maintained (semantic similarity check)
  - [ ] Document quality validation results
  - [ ] Add quality checks to monitoring
  - [ ] **Testing:** Automated similarity testing (semantic similarity check)
  - [ ] **Testing:** A/B testing framework setup

## Dev Notes

### Requirements Context Summary

**Source:** [docs/epics-optimization.md#story-22-message-history-compression-quality-preserving](docs/epics-optimization.md#story-22-message-history-compression-quality-preserving)

**Epic Goal:** Implement minimal quality impact optimizations (<5%) để đạt 40-50% total cost reduction với quality monitoring và auto-rollback.

**Story Context:**
- **Effort:** 3 hours
- **Expected Savings:** $5-10/month (token reduction for long conversations)
- **Quality Impact:** ⚠️ MINIMAL (<5% quality impact acceptable)
- **Code Location:** `backend/core/optimizations/history_compressor.py` (new file)
- **Prerequisites:** Story 1.4 (Dual-mode architecture)

**Technical Requirements:**
- Sliding window để keep recent messages
- LLM summarization for older messages
- Quality checks on summaries
- Context preservation testing
- Token reduction measurement

### Learnings from Previous Story

**Previous Story:** [docs/stories/2-1-semantic-response-caching-quality-controlled.md](docs/stories/2-1-semantic-response-caching-quality-controlled.md)

**Status:** drafted (not yet implemented)

**Note:** Story 2.1 focuses on semantic caching. Story 2.2 focuses on message history compression. Both stories are part of Phase 2 quality-preserving optimizations. Story 2.2 can work independently hoặc enhance Story 2.1.

### Project Structure Notes

**Current Implementation:**
- Message history được stored trong database
- No existing compression implementation
- LLM calls use full message history

**Optimization Strategy:**
- **Sliding Window**: Keep last N messages unchanged (e.g., last 10 messages)
- **Summarization**: Summarize older messages using LLM
- **Quality Checks**: Validate summary quality before using
- **Context Preservation**: Ensure critical context is maintained
- **Token Reduction**: Measure và track token reduction

**Files to Create:**
- `backend/core/optimizations/history_compressor.py` - New MessageHistoryCompressor class

**Files to Modify:**
- `backend/core/run.py` - Integrate history compression vào prompt building
- `backend/core/utils/config.py` - Add compression configuration

**Dependencies:**
- LLM for summarization (can use existing LLM infrastructure)
- Quality monitoring (Story 2.4 will enhance this)

### Architecture Constraints

**From:** [docs/optimization-master-plan-v1.1.md](docs/optimization-master-plan-v1.1.md)

**Key Principles:**
- Quality-first approach: Minimal quality impact (<5%) acceptable
- Dual-mode architecture: Original mode (baseline) + Optimized mode (with compression)
- Feature flags: Easy switching và rollback
- Quality monitoring: Continuous quality validation

**LLM Integration:**
- LiteLLM được sử dụng cho multi-provider support
- OpenAI Compatible API (v98store) được sử dụng
- Current models: gpt-4o-mini, qwen3-30b, deepseek-v3-1, qwen3-235b, claude-haiku-4-5

**Compression Requirements:**
- Sliding window size: Configurable (default: last 10 messages)
- Summarization model: Can use same LLM hoặc dedicated summarization model
- Quality threshold: 95% similarity required
- Context preservation: Critical context must be maintained

### Testing Standards

**Quality Validation:**
- Compare compressed vs non-compressed responses
- Verify 95-100% quality maintained (semantic similarity check)
- Test với multiple conversation types
- Monitor context preservation

**Performance Testing:**
- Measure token reduction
- Track cost savings
- Monitor latency impact (summarization adds latency)
- Test với different conversation lengths

**Integration Testing:**
- Test với existing LLM calls
- Verify no breaking changes
- Test với different models
- Test với different agent configurations
- Test với long conversations (>50 messages)

### References

- [Source: docs/epics-optimization.md#story-22-message-history-compression-quality-preserving](docs/epics-optimization.md#story-22-message-history-compression-quality-preserving)
- [Source: docs/optimization-master-plan-v1.1.md#phase-2-quality-preserving-medium-optimizations](docs/optimization-master-plan-v1.1.md#phase-2-quality-preserving-medium-optimizations)
- [Source: docs/research-prompt-optimization.md#6-message-compression](docs/research-prompt-optimization.md#6-message-compression)
- [Source: backend/core/run.py::PromptManager.build_system_prompt()](backend/core/run.py#L326-L491)
- [Source: backend/core/services/llm.py::make_llm_api_call()](backend/core/services/llm.py#L180-L303)
- [Source: docs/stories/2-1-semantic-response-caching-quality-controlled.md](docs/stories/2-1-semantic-response-caching-quality-controlled.md) - Previous story

## Dev Agent Record

### Context Reference

- [docs/stories/2-2-message-history-compression-quality-preserving.context.xml](docs/stories/2-2-message-history-compression-quality-preserving.context.xml)

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-11-07 | 1.0 | Initial story draft | BMAD Architect Agent |

