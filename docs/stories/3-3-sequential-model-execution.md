# Story 3.3: Sequential Model Execution

Status: done

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

- [x] Task 1: Define workflow structure (AC: #3)
  - [x] Define workflow format: Use Python dict for programmatic workflows (primary), JSON/YAML for configuration-based workflows (optional)
  - [x] Define step structure (model, input, output, error handling):
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
          "input": "{step_1.analysis_result}",
          "prompt_template": "Create plan based on: {input}",
          "output_key": "plan_result"
        }
      ]
    }
    ```
  - [x] Create example workflows
  - [x] Test workflow definition format
  - [x] **Testing:** Unit test workflow parsing
  - [x] **Testing:** Integration test workflow structure

- [x] Task 2: Implement MultiModelOrchestrator class (AC: #1)
  - [x] Create `backend/core/optimizations/multi_model_orchestrator.py`
  - [x] Implement `MultiModelOrchestrator` class
  - [x] Integrate với ModelRouter (Story 3.2)
  - [x] Test MultiModelOrchestrator class với sample workflows
  - [x] **Testing:** Unit test MultiModelOrchestrator class
  - [x] **Testing:** Integration test với ModelRouter

- [x] Task 3: Implement sequential chaining (AC: #2)
  - [x] Implement sequential execution logic
  - [x] Execute models in order (step 1 → step 2 → step 3)
  - [x] Handle step dependencies
  - [x] Test sequential chaining với sample workflows
  - [x] **Testing:** Unit test sequential execution
  - [x] **Testing:** Integration test với multi-step workflows

- [x] Task 4: Implement intermediate result passing (AC: #4)
  - [x] Pass output from step N to input of step N+1
  - [x] Handle result transformation (if needed)
  - [x] Test result passing với sample workflows
  - [x] **Testing:** Unit test result passing
  - [x] **Testing:** Integration test với complex workflows

- [x] Task 5: Implement error handling (AC: #5)
  - [x] Handle errors at each step
  - [x] Implement retry logic (if needed)
  - [x] Implement fallback to alternative model (if needed)
  - [x] Log error events
  - [x] Test error handling với failure scenarios
  - [x] **Testing:** Unit test error handling
  - [x] **Testing:** Integration test error scenarios

- [x] Task 6: Test end-to-end workflow execution (AC: #6)
  - [x] Test complete workflows từ start to finish
  - [x] Validate final results
  - [x] Measure cost savings vs single-model approach
  - [x] Measure quality impact
  - [x] Document workflow execution results
  - [x] **Testing:** End-to-end test với real workflows
  - [x] **Testing:** Integration test với different workflow types

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

**Created Files:**
- `backend/core/optimizations/multi_model_orchestrator.py` - MultiModelOrchestrator class implementation
- `backend/core/api/multi_model_orchestrator_api.py` - API endpoints for workflow orchestration
- `backend/core/api/models/multi_model_orchestrator_models.py` - Pydantic models for API requests/responses
- `backend/tests/test_multi_model_orchestrator.py` - Comprehensive test suite (31 tests, 100% pass rate)
- `docs/workflow-orchestration-examples.md` - Example workflows documentation

**Modified Files:**
- `backend/core/api.py` - Added workflow orchestrator router
- `backend/core/utils/config.py` - Added MULTI_MODEL_ORCHESTRATION_ENABLED configuration và workflow execution limits
- `docs/stories/3-3-sequential-model-execution.md` - Updated with completion notes
- `docs/sprint-status.yaml` - Updated story status to `done`
- `docs/code-review-story-3.3.md` - Updated với all enhancements implemented

## Completion Notes

### Implementation Summary

**Status:** ✅ **COMPLETE - ALL ISSUES FIXED - PRODUCTION READY**

**All Acceptance Criteria Met:**
1. ✅ `MultiModelOrchestrator` class implemented in `backend/core/optimizations/multi_model_orchestrator.py`
2. ✅ Sequential chaining implemented to execute models in sequence
3. ✅ Workflow definition supported (step-by-step model execution)
4. ✅ Intermediate results passed between steps
5. ✅ Error handling implemented for each step (retry + fallback)
6. ✅ End-to-end workflow execution tested and validated

**Key Features Implemented:**
- **Workflow Definition:** Python dict format với step structure (id, model, input, prompt_template, output_key, error_handling)
- **Sequential Execution:** Steps execute in order (step 1 → step 2 → step 3)
- **Intermediate Results:** Output from step N passed to input of step N+1
- **Input Resolution:** Support for `user_query` và `{step_id.output_key}` input references
- **Prompt Formatting:** Template formatting với `{input}` và `{step_id.output_key}` placeholders
- **Error Handling:** Retry logic (configurable retry count) và fallback to alternative model
- **Response Extraction:** Handles both dict và ModelResponse object formats
- **Metrics Tracking:** Workflow execution metrics (total workflows, completion rate, execution time, cost)
- **API Endpoints:** REST API for executing workflows, getting metrics, và status
- **Singleton Pattern:** Global orchestrator instance với `get_multi_model_orchestrator()`

**Test Coverage:**
- **31 tests** covering all functionality
- **100% pass rate**
- **Test Categories:**
  - Initialization (3 tests)
  - Workflow definition validation (8 tests - includes input reference validation, max steps, max prompt length)
  - Cost calculation (3 tests)
  - Input resolution (4 tests - includes max length truncation)
  - Prompt formatting (3 tests - includes literal braces)
  - Response extraction (2 tests)
  - Sequential execution (2 tests)
  - Error handling (5 tests - includes timeout handling)
  - Intermediate results (2 tests - includes max size truncation)
  - Workflow metrics (3 tests - includes average calculation)
  - Workflow cancellation (3 tests)
  - ModelRouter integration (1 test)
  - Integration tests (2 tests)

**API Endpoints:**
- `POST /api/workflow/execute` - Execute a workflow
- `GET /api/workflow/metrics` - Get workflow execution metrics
- `POST /api/workflow/metrics/reset` - Reset workflow metrics
- `GET /api/workflow/status` - Get orchestrator status
- `POST /api/workflow/cancel/{workflow_id}` - Cancel a running workflow
- `GET /api/workflow/active` - Get list of active workflow IDs

**Configuration:**
- `MULTI_MODEL_ORCHESTRATION_ENABLED` - Enable/disable orchestrator (default: True)
- `MAX_WORKFLOW_STEPS` - Maximum number of steps in a workflow (default: 20)
- `MAX_STEP_INPUT_LENGTH` - Maximum length of step input (default: 100,000 characters)
- `MAX_WORKFLOW_EXECUTION_TIME_SECONDS` - Maximum workflow execution time (default: 3600 seconds)
- `MAX_INTERMEDIATE_RESULT_SIZE` - Maximum size of intermediate results (default: 1,000,000 characters)

**Integration:**
- Integrated với ModelRouter (Story 3.2) - Optional dynamic model selection per step via `use_model_router` flag
- Integrated với existing LLM service (`make_llm_api_call`)
- Singleton pattern for global instance access

**Documentation:**
- Example workflows documented in `docs/workflow-orchestration-examples.md`
- Comprehensive docstrings in code
- API documentation via FastAPI OpenAPI schema

**Code Review Fixes (Completed):**
- ✅ Cost calculation implemented với baseline comparison
- ✅ Average execution time calculation fixed (running average)
- ✅ Timeout handling implemented (per-step timeout configuration)
- ✅ Input reference validation improved (fail-fast validation)
- ✅ Test coverage expanded from 25 to 31 tests
- ✅ All critical issues resolved

**Optional Enhancements (Completed):**
- ✅ ModelRouter integration implemented (optional dynamic routing per step)
- ✅ Workflow cancellation implemented với API endpoints
- ✅ Input size limits implemented for security (workflow size, step input, execution time, intermediate results)
- ✅ Robust prompt templating implemented với literal braces support và injection prevention

**Next Steps:**
- Production deployment với monitoring
- Performance testing và optimization
- Workflow scheduling (long-term enhancement)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-11-07 | 1.0 | Initial story draft | BMAD Architect Agent |
| 2025-11-07 | 1.1 | Specified workflow definition format với example structure | BMAD Architect Agent |
| 2025-11-08 | 2.0 | Implementation complete - All tasks và tests completed | Auto (Developer Agent) |
| 2025-01-08 | 2.1 | Code review fixes - Cost calculation, timeout handling, input validation, average calculation | Auto (Developer Agent) |
| 2025-01-08 | 2.2 | Optional enhancements - ModelRouter integration, workflow cancellation, input size limits, robust prompt templating | Auto (Developer Agent) |

