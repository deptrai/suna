# Story 3.2: Model Selection Rules

Status: ready-for-dev

## Story

As a system administrator,  
I want to implement model selection rules based on task complexity,  
so that I can route tasks to optimal models và achieve 40-50% cost reduction với acceptable quality trade-off.

## Acceptance Criteria

1. `ModelRouter` class được implemented trong `backend/core/optimizations/model_router.py`
2. Routing rules được defined để map complexity levels to models
3. Model selection logic được implemented based on complexity
4. Routing decisions được logged và monitored
5. Fallback mechanism được implemented nếu selected model fails
6. Cost savings được measured và tracked

## Tasks / Subtasks

- [ ] Task 1: Define routing rules (AC: #2)
  - [ ] Map complexity levels to models:
    - simple → gpt-4o-mini, qwen3-30b (cheap models)
    - medium → deepseek-v3-1, claude-haiku-4-5 (balanced models)
    - complex → qwen3-235b (powerful but cheaper)
    - very_complex → gpt-4o, claude-sonnet (premium models)
  - [ ] Document routing rules và rationale
  - [ ] Create routing decision matrix
  - [ ] Test routing rules với sample tasks
  - [ ] **Testing:** Unit test routing rules
  - [ ] **Testing:** Integration test routing decisions

- [ ] Task 2: Implement ModelRouter class (AC: #1)
  - [ ] Create `backend/core/optimizations/model_router.py`
  - [ ] Implement `ModelRouter` class với routing logic
  - [ ] Integrate với TaskClassifier (Story 3.1)
  - [ ] Test ModelRouter class với sample tasks
  - [ ] **Testing:** Unit test ModelRouter class
  - [ ] **Testing:** Integration test với TaskClassifier

- [ ] Task 3: Implement model selection logic (AC: #3)
  - [ ] Get complexity level từ TaskClassifier
  - [ ] Apply routing rules to select model
  - [ ] Handle multiple models matching same complexity level:
    - Prefer cheaper model if multiple models match (e.g., simple → prefer gpt-4o-mini over qwen3-30b if both available)
    - Consider model availability (check if model is enabled và accessible)
    - Consider model capabilities (if task requires specific features like vision, prefer model with those capabilities)
    - Use round-robin hoặc random selection if all factors equal
  - [ ] Handle edge cases (unknown complexity, model unavailable)
  - [ ] Test selection logic với different complexity levels
  - [ ] **Testing:** Unit test selection logic
  - [ ] **Testing:** Integration test với different scenarios

- [ ] Task 4: Implement logging và monitoring (AC: #4)
  - [ ] Log routing decisions (complexity → model selected)
  - [ ] Track routing metrics (model distribution, routing accuracy)
  - [ ] Add routing metrics to monitoring dashboard
  - [ ] Test logging với sample requests
  - [ ] **Testing:** Unit test logging logic
  - [ ] **Testing:** Integration test metrics tracking

- [ ] Task 5: Implement fallback mechanism (AC: #5)
  - [ ] Add fallback logic nếu selected model fails
  - [ ] Fallback to next best model based on complexity
  - [ ] Log fallback events
  - [ ] Test fallback mechanism với failure scenarios
  - [ ] **Testing:** Unit test fallback logic
  - [ ] **Testing:** Integration test fallback scenarios

- [ ] Task 6: Measure và track cost savings (AC: #6)
  - [ ] Track cost per request (before vs after routing)
  - [ ] Calculate cost savings percentage
  - [ ] Log cost metrics
  - [ ] Add cost metrics to monitoring dashboard
  - [ ] Test cost tracking với sample requests
  - [ ] **Testing:** Unit test cost calculation
  - [ ] **Testing:** Integration test cost tracking

## Dev Notes

### Requirements Context Summary

**Source:** [docs/epics-optimization.md#epic-3-multi-model-orchestration](docs/epics-optimization.md#epic-3-multi-model-orchestration)

**Epic Goal:** Achieve 40-50% cost reduction với quality maintained at 80-85% (acceptable trade-off) by routing tasks to appropriate models based on complexity.

**Story Context:**
- **Effort:** 2 hours
- **Expected Savings:** $36-45/month (40-50% cost reduction)
- **Quality Impact:** ⚠️ 10-15% (cheaper models for simple tasks, acceptable trade-off)
- **Code Location:** `backend/core/optimizations/model_router.py` (new file)
- **Prerequisites:** Story 3.1 (Task Complexity Classification), Story 1.4 (Dual-mode architecture)

**Technical Requirements:**
- Routing rules: Map complexity levels to models
- Model selection: Based on complexity from TaskClassifier
- Fallback mechanism: Next best model if selected model fails
- Cost tracking: Measure savings

### Learnings from Previous Story

**Previous Story:** [docs/stories/3-1-task-complexity-classification.md](docs/stories/3-1-task-complexity-classification.md)

**Status:** drafted (not yet implemented)

**Note:** Story 3.1 provides complexity classification. Story 3.2 uses classification results to route to appropriate models. This story enables cost optimization through intelligent model selection.

### Project Structure Notes

**Current Implementation:**
- Model selection is currently based on user tier (free/paid) hoặc default model
- No complexity-based routing
- All tasks use same model regardless of complexity

**Optimization Strategy:**
- **Routing Rules**: Map complexity levels to optimal models
  - simple → gpt-4o-mini, qwen3-30b (cheap, fast)
  - medium → deepseek-v3-1, claude-haiku-4-5 (balanced)
  - complex → qwen3-235b (powerful but cheaper than premium)
  - very_complex → gpt-4o, claude-sonnet (premium, high quality)
- **Selection Logic**: Get complexity from TaskClassifier, apply routing rules
- **Fallback**: If selected model fails, fallback to next best model
- **Cost Tracking**: Measure cost savings from routing

**Files to Create:**
- `backend/core/optimizations/model_router.py` - New ModelRouter class

**Files to Modify:**
- `backend/core/run.py` - Integrate routing vào agent execution flow
- `backend/core/services/llm.py` - Use routed model for LLM calls
- `backend/core/utils/config.py` - Add routing configuration

**Dependencies:**
- TaskClassifier (Story 3.1) - Provides complexity classification
- Model registry - Provides available models và capabilities

### Architecture Constraints

**From:** [docs/optimization-master-plan-v1.1.md](docs/optimization-master-plan-v1.1.md)

**Key Principles:**
- Quality-first approach: Acceptable quality trade-off (80-85%) for 40-50% cost savings
- Dual-mode architecture: Original mode (baseline) + Optimized mode (with routing)
- Feature flags: Easy switching và rollback
- Gradual rollout: 5% → 25% → 50% → 100% traffic

**LLM Integration:**
- LiteLLM được sử dụng cho multi-provider support
- OpenAI Compatible API (v98store) được sử dụng
- Current models: gpt-4o-mini, qwen3-30b, deepseek-v3-1, qwen3-235b, claude-haiku-4-5

**Routing Requirements:**
- Complexity-based routing: Map complexity levels to models
- Fallback mechanism: Next best model if selected model fails
- Cost tracking: Measure savings from routing
- Quality monitoring: Track quality impact (target: 80-85%)

### Testing Standards

**Quality Validation:**
- Test routing decisions với different complexity levels
- Verify correct model selection
- Test fallback mechanism
- Monitor quality impact (target: 80-85%)

**Performance Testing:**
- Measure routing overhead (should be <50ms)
- Track cost savings (target: 40-50%)
- Test với high-volume scenarios

**Integration Testing:**
- Test với TaskClassifier (Story 3.1)
- Test với existing LLM calls
- Verify no breaking changes
- Test với different models
- Test với different agent configurations
- Test fallback scenarios

### References

- [Source: docs/epics-optimization.md#epic-3-multi-model-orchestration](docs/epics-optimization.md#epic-3-multi-model-orchestration)
- [Source: docs/optimization-master-plan-v1.1.md#phase-3-multi-model-orchestration](docs/optimization-master-plan-v1.1.md#phase-3-multi-model-orchestration)
- [Source: docs/multi-model-orchestration-research-guidance.md](docs/multi-model-orchestration-research-guidance.md)
- [Source: backend/core/run.py::run_agent()](backend/core/run.py) - Agent execution flow
- [Source: backend/core/ai_models/manager.py::get_default_model_for_user()](backend/core/ai_models/manager.py) - Current model selection logic
- [Source: backend/core/ai_models/registry.py](backend/core/ai_models/registry.py) - Model registry với available models

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-11-07 | 1.0 | Initial story draft | BMAD Architect Agent |
| 2025-11-07 | 1.1 | Clarified model selection logic for multiple matches | BMAD Architect Agent |

