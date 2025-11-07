# Story 2.3: Tool Schema Optimization (Minimal Format)

Status: ready-for-dev

## Story

As a system administrator,  
I want to optimize tool schema representation in system prompt to minimal format,  
so that I can reduce prompt token count without negatively impacting tool calling accuracy.

## Acceptance Criteria

1. `_format_tools()` function trong `backend/core/run.py` được modified to output minimal format
2. Minimal format includes only: tool name + brief description
3. Tool calling success rate được monitored và remains above 95%
4. Rollback mechanism được implemented nếu tool calling accuracy drops
5. Token reduction from tool schemas được measured
6. Quality maintained at 95-100% (tool calling accuracy)

## Tasks / Subtasks

- [ ] Task 1: Analyze current tool schema format (AC: #1)
  - [ ] Review current tool schema formatting logic trong `backend/core/run.py::PromptManager.build_system_prompt()` (lines 442-477)
  - [ ] Identify current format components (full JSON schema với name, description, parameters, examples, etc.)
  - [ ] Measure current token count for tool schemas
  - [ ] Document current format structure
  - [ ] **Testing:** Unit test current tool schema format
  - [ ] **Testing:** Integration test current tool calling

- [ ] Task 2: Design minimal format (AC: #2)
  - [ ] Design minimal format: name + brief description only
  - [ ] Remove unnecessary fields (detailed parameters, examples, etc.)
  - [ ] Ensure essential information is preserved
  - [ ] Test minimal format với sample tools
  - [ ] **Testing:** Unit test minimal format generation
  - [ ] **Testing:** Integration test format validation

- [ ] Task 3: Implement minimal format (AC: #1, #2)
  - [ ] Extract tool schema formatting logic từ `build_system_prompt()` into `_format_tools()` method (if needed)
  - [ ] Modify tool schema formatting to output minimal format (name + description only)
  - [ ] Ensure backward compatibility (can switch between formats)
  - [ ] Test minimal format với existing tools
  - [ ] **Testing:** Unit test minimal format implementation
  - [ ] **Testing:** Integration test với actual tool calls

- [ ] Task 4: Monitor tool calling success rate (AC: #3)
  - [ ] Track tool calling success rate (successful calls / total calls)
  - [ ] Set threshold: 95% success rate required
  - [ ] Log tool calling metrics
  - [ ] Add metrics to monitoring dashboard
  - [ ] Test monitoring với sample tool calls
  - [ ] **Testing:** Unit test tool calling metrics
  - [ ] **Testing:** Integration test metrics tracking

- [ ] Task 5: Implement rollback mechanism (AC: #4)
  - [ ] Add rollback logic nếu tool calling accuracy drops below 95%
  - [ ] Fallback to full format nếu minimal format fails
  - [ ] Log rollback events
  - [ ] Test rollback mechanism với degraded accuracy scenarios
  - [ ] **Testing:** Unit test rollback logic
  - [ ] **Testing:** Integration test rollback mechanism

- [ ] Task 6: Measure token reduction (AC: #5)
  - [ ] Track token count before và after optimization
  - [ ] Calculate token reduction percentage
  - [ ] Log token reduction metrics
  - [ ] Test với different tool sets
  - [ ] **Testing:** Unit test token counting
  - [ ] **Testing:** Integration test token reduction measurement

- [ ] Task 7: Quality validation (AC: #6)
  - [ ] Compare tool calling với minimal vs full format
  - [ ] Verify 95-100% tool calling accuracy maintained
  - [ ] Document quality validation results
  - [ ] Add quality checks to monitoring
  - [ ] **Testing:** Automated tool calling accuracy testing
  - [ ] **Testing:** A/B testing framework setup

## Dev Notes

### Requirements Context Summary

**Source:** [docs/epics-optimization.md#story-23-tool-schema-optimization-minimal-format](docs/epics-optimization.md#story-23-tool-schema-optimization-minimal-format)

**Epic Goal:** Implement minimal quality impact optimizations (<5%) để đạt 40-50% total cost reduction với quality monitoring và auto-rollback.

**Story Context:**
- **Effort:** 2 hours
- **Expected Savings:** $3-6/month (token reduction from tool schemas)
- **Quality Impact:** ⚠️ MINIMAL (<5% quality impact acceptable)
- **Code Location:** `backend/core/run.py::_format_tools()` method
- **Prerequisites:** Story 1.4 (Dual-mode architecture)

**Technical Requirements:**
- Minimal format: name + brief description only
- Tool calling success rate: 95% required
- Rollback mechanism: Fallback to full format nếu accuracy drops
- Token reduction measurement

### Learnings from Previous Story

**Previous Story:** [docs/stories/2-2-message-history-compression-quality-preserving.md](docs/stories/2-2-message-history-compression-quality-preserving.md)

**Status:** drafted (not yet implemented)

**Note:** Story 2.2 focuses on message history compression. Story 2.3 focuses on tool schema optimization. Both stories are part of Phase 2 quality-preserving optimizations. Story 2.3 can work independently hoặc enhance other optimizations.

### Project Structure Notes

**Current Implementation:**
- Tool schemas được formatted trong `backend/core/run.py::_format_tools()` method
- Current format includes: name, description, parameters, examples, etc.
- Tool schemas can be large (1,500+ tokens for many tools)

**Optimization Strategy:**
- **Minimal Format**: Only include tool name + brief description
- **Remove**: Detailed parameters, examples, type information
- **Preserve**: Essential information for tool selection
- **Rollback**: Fallback to full format nếu accuracy drops
- **Token Reduction**: Measure và track token reduction

**Files to Modify:**
- `backend/core/run.py` - Modify tool schema formatting logic trong `PromptManager.build_system_prompt()` method (lines 442-477)
- May need to extract tool schema formatting into separate `_format_tools()` method for optimization

**New Files:**
- None (chỉ modifications to existing method)

**Dependencies:**
- Tool registry (existing)
- Tool calling infrastructure (existing)
- Quality monitoring (Story 2.4 will enhance this)

### Architecture Constraints

**From:** [docs/optimization-master-plan-v1.1.md](docs/optimization-master-plan-v1.1.md)

**Key Principles:**
- Quality-first approach: Minimal quality impact (<5%) acceptable
- Dual-mode architecture: Original mode (baseline) + Optimized mode (with minimal format)
- Feature flags: Easy switching và rollback
- Quality monitoring: Continuous quality validation với auto-rollback

**LLM Integration:**
- LiteLLM được sử dụng cho multi-provider support
- OpenAI Compatible API (v98store) được sử dụng
- Current models: gpt-4o-mini, qwen3-30b, deepseek-v3-1, qwen3-235b, claude-haiku-4-5

**Tool Schema Requirements:**
- Minimal format: name + brief description only
- Tool calling success rate: 95% required
- Rollback: Fallback to full format nếu accuracy drops
- Token reduction: Measure và track

### Testing Standards

**Quality Validation:**
- Compare tool calling với minimal vs full format
- Verify 95-100% tool calling accuracy maintained
- Test với multiple tool types
- Monitor tool calling success rate

**Performance Testing:**
- Measure token reduction
- Track cost savings
- Monitor tool calling latency
- Test với different tool sets

**Integration Testing:**
- Test với existing LLM calls
- Verify no breaking changes
- Test với different models
- Test với different agent configurations
- Test với different tool sets
- Test rollback mechanism

### References

- [Source: docs/epics-optimization.md#story-23-tool-schema-optimization-minimal-format](docs/epics-optimization.md#story-23-tool-schema-optimization-minimal-format)
- [Source: docs/optimization-master-plan-v1.1.md#phase-2-quality-preserving-medium-optimizations](docs/optimization-master-plan-v1.1.md#phase-2-quality-preserving-medium-optimizations)
- [Source: docs/research-prompt-optimization.md#3-tool-schema-optimization](docs/research-prompt-optimization.md#3-tool-schema-optimization)
- [Source: backend/core/run.py::PromptManager.build_system_prompt()](backend/core/run.py#L442-L477) - Tool schema formatting happens inline here (lines 442-477)
- [Source: backend/core/services/llm.py::make_llm_api_call()](backend/core/services/llm.py#L180-L303)
- [Source: docs/stories/2-2-message-history-compression-quality-preserving.md](docs/stories/2-2-message-history-compression-quality-preserving.md) - Previous story

## Dev Agent Record

### Context Reference

- [docs/stories/2-3-tool-schema-optimization-minimal-format.context.xml](docs/stories/2-3-tool-schema-optimization-minimal-format.context.xml)

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-11-07 | 1.0 | Initial story draft | BMAD Architect Agent |

