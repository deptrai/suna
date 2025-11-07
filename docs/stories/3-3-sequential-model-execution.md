# Story 3.3: Sequential Model Execution

Status: ready-for-dev

## Story

As a system administrator,  
I want to implement sequential model execution for multi-step workflows,  
so that I can enable complex workflows where different models handle different steps và maximize cost efficiency.

## Acceptance Criteria

1. `MultiModelOrchestrator` class được implemented trong `backend/core/optimizations/multi_model_orchestrator.py`
2. Sequential chaining được implemented để execute models in sequence
3. Workflow definition được supported (step-by-step model execution)
4. Intermediate results được passed between steps
5. Error handling được implemented for each step
6. End-to-end workflow execution được tested và validated

## Tasks / Subtasks

- [ ] Task 1: Define workflow structure (AC: #3)
  - [ ] Define workflow format: Use Python dict for programmatic workflows (primary), JSON/YAML for configuration-based workflows (optional)
  - [ ] Define step structure (model, input, output, error handling):
    ```python
    {
      "steps": [
        {
          "id": "step_1",
          "model": "openai-compatible/gpt-4o-mini",
          "input": "user_query",
          "prompt_template": "Analyze: {input}",
          "output_key": "analysis_result",
          "error_handling": {"retry": 2, "fallback_model": "openai-compatible/qwen3-30b"}
        },
        {
          "id": "step_2",
          "model": "openai-compatible/gpt-4o",
          "input": "{step_1.output_key}",
          "prompt_template": "Create plan based on: {input}",
          "output_key": "plan_result"
        }
      ]
    }
    ```
  - [ ] Create example workflows
  - [ ] Test workflow definition format
  - [ ] **Testing:** Unit test workflow parsing
  - [ ] **Testing:** Integration test workflow structure

- [ ] Task 2: Implement MultiModelOrchestrator class (AC: #1)
  - [ ] Create `backend/core/optimizations/multi_model_orchestrator.py`
  - [ ] Implement `MultiModelOrchestrator` class
  - [ ] Integrate với ModelRouter (Story 3.2)
  - [ ] Test MultiModelOrchestrator class với sample workflows
  - [ ] **Testing:** Unit test MultiModelOrchestrator class
  - [ ] **Testing:** Integration test với ModelRouter

- [ ] Task 3: Implement sequential chaining (AC: #2)
  - [ ] Implement sequential execution logic
  - [ ] Execute models in order (step 1 → step 2 → step 3)
  - [ ] Handle step dependencies
  - [ ] Test sequential chaining với sample workflows
  - [ ] **Testing:** Unit test sequential execution
  - [ ] **Testing:** Integration test với multi-step workflows

- [ ] Task 4: Implement intermediate result passing (AC: #4)
  - [ ] Pass output from step N to input of step N+1
  - [ ] Handle result transformation (if needed)
  - [ ] Test result passing với sample workflows
  - [ ] **Testing:** Unit test result passing
  - [ ] **Testing:** Integration test với complex workflows

- [ ] Task 5: Implement error handling (AC: #5)
  - [ ] Handle errors at each step
  - [ ] Implement retry logic (if needed)
  - [ ] Implement fallback to alternative model (if needed)
  - [ ] Log error events
  - [ ] Test error handling với failure scenarios
  - [ ] **Testing:** Unit test error handling
  - [ ] **Testing:** Integration test error scenarios

- [ ] Task 6: Test end-to-end workflow execution (AC: #6)
  - [ ] Test complete workflows từ start to finish
  - [ ] Validate final results
  - [ ] Measure cost savings vs single-model approach
  - [ ] Measure quality impact
  - [ ] Document workflow execution results
  - [ ] **Testing:** End-to-end test với real workflows
  - [ ] **Testing:** Integration test với different workflow types

## Dev Notes

### Requirements Context Summary

**Source:** [docs/epics-optimization.md#epic-3-multi-model-orchestration](docs/epics-optimization.md#epic-3-multi-model-orchestration)

**Epic Goal:** Achieve 40-50% cost reduction với quality maintained at 80-85% (acceptable trade-off) by routing tasks to appropriate models based on complexity.

**Story Context:**
- **Effort:** 3 hours
- **Expected Savings:** $36-45/month (enables multi-model workflows)
- **Quality Impact:** ⚠️ 10-15% (but cost savings 40-50%)
- **Code Location:** `backend/core/optimizations/multi_model_orchestrator.py` (new file)
- **Prerequisites:** Story 3.2 (Model Selection Rules), Story 1.4 (Dual-mode architecture)

**Technical Requirements:**
- Sequential chaining: Execute models in sequence
- Workflow definition: Step-by-step model execution
- Intermediate results: Pass results between steps
- Error handling: Handle failures at each step

### Learnings from Previous Story

**Previous Story:** [docs/stories/3-2-model-selection-rules.md](docs/stories/3-2-model-selection-rules.md)

**Status:** drafted (not yet implemented)

**Note:** Story 3.2 provides model routing. Story 3.3 enables multi-step workflows where different models handle different steps. This story enables complex workflows like "analyze → plan → execute → synthesize".

### Project Structure Notes

**Current Implementation:**
- Single model per request
- No multi-step workflows
- No sequential model chaining

**Optimization Strategy:**
- **Sequential Chaining**: Execute models in sequence (step 1 → step 2 → step 3)
- **Workflow Definition**: Define workflows with steps (model, input, output)
- **Intermediate Results**: Pass output from step N to input of step N+1
- **Error Handling**: Handle failures at each step with retry/fallback

**Example Workflow:**
```
Step 1: gpt-4o-mini ($0.15/$0.60)
  Input: User question
  Task: Analyze question, extract intent
  Output: Structured intent + key topics

Step 2: gpt-4o ($2.50/$10.00)
  Input: Structured intent from Step 1
  Task: Create research plan
  Output: Detailed plan with subtasks

Step 3: qwen3-30b ($0.10/$0.50)
  Input: Research plan from Step 2
  Task: Execute research tasks
  Output: Raw research data

Step 4: claude-sonnet ($3.00/$15.00)
  Input: Research plan + raw data from Step 3
  Task: Synthesize, analyze, generate report
  Output: Comprehensive report
```

**Files to Create:**
- `backend/core/optimizations/multi_model_orchestrator.py` - New MultiModelOrchestrator class

**Files to Modify:**
- `backend/core/run.py` - Integrate orchestrator vào agent execution flow
- `backend/core/services/llm.py` - Support sequential LLM calls
- `backend/core/utils/config.py` - Add orchestrator configuration

**Dependencies:**
- ModelRouter (Story 3.2) - Provides model selection
- LLM service - Provides LLM API calls

### Architecture Constraints

**From:** [docs/optimization-master-plan-v1.1.md](docs/optimization-master-plan-v1.1.md)

**Key Principles:**
- Quality-first approach: Acceptable quality trade-off (80-85%) for 40-50% cost savings
- Dual-mode architecture: Original mode (baseline) + Optimized mode (with orchestration)
- Feature flags: Easy switching và rollback
- Gradual rollout: 5% → 25% → 50% → 100% traffic

**LLM Integration:**
- LiteLLM được sử dụng cho multi-provider support
- OpenAI Compatible API (v98store) được sử dụng
- Current models: gpt-4o-mini, qwen3-30b, deepseek-v3-1, qwen3-235b, claude-haiku-4-5

**Orchestration Requirements:**
- Sequential chaining: Execute models in sequence
- Workflow definition: Step-by-step model execution
- Intermediate results: Pass results between steps
- Error handling: Handle failures at each step

### Testing Standards

**Quality Validation:**
- Test end-to-end workflows
- Verify final results quality (target: 80-85%)
- Compare với single-model approach
- Monitor quality impact

**Performance Testing:**
- Measure workflow execution time
- Track cost savings (target: 40-50%)
- Test với high-volume scenarios
- Compare với single-model approach

**Integration Testing:**
- Test với ModelRouter (Story 3.2)
- Test với existing LLM calls
- Verify no breaking changes
- Test với different workflows
- Test với different models
- Test error scenarios

### References

- [Source: docs/epics-optimization.md#epic-3-multi-model-orchestration](docs/epics-optimization.md#epic-3-multi-model-orchestration)
- [Source: docs/optimization-master-plan-v1.1.md#phase-3-multi-model-orchestration](docs/optimization-master-plan-v1.1.md#phase-3-multi-model-orchestration)
- [Source: docs/multi-model-orchestration-research-guidance.md](docs/multi-model-orchestration-research-guidance.md)
- [Source: backend/core/run.py::run_agent()](backend/core/run.py) - Agent execution flow
- [Source: backend/core/services/llm.py::make_llm_api_call()](backend/core/services/llm.py) - LLM API call handler

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
| 2025-11-07 | 1.1 | Specified workflow definition format với example structure | BMAD Architect Agent |

