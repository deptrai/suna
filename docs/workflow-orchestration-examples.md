# Workflow Orchestration Examples

This document provides examples of multi-step workflows using the `MultiModelOrchestrator` (Story 3.3).

## Table of Contents

- [Basic Two-Step Workflow](#basic-two-step-workflow)
- [Three-Step Analysis Workflow](#three-step-analysis-workflow)
- [Workflow với Error Handling](#workflow-with-error-handling)
- [Complex Multi-Step Workflow](#complex-multi-step-workflow)
- [API Usage Examples](#api-usage-examples)

## Basic Two-Step Workflow

**Use Case:** Analyze a question và create a plan.

```python
workflow = {
    "steps": [
        {
            "id": "step_1",
            "model": "openai-compatible/gpt-4o-mini",
            "input": "user_query",
            "prompt_template": "Analyze the following question and extract key topics: {input}",
            "output_key": "analysis_result"
        },
        {
            "id": "step_2",
            "model": "openai-compatible/gpt-4o",
            "input": "{step_1.analysis_result}",
            "prompt_template": "Create a detailed plan based on this analysis: {input}",
            "output_key": "plan_result"
        }
    ]
}

# Execute workflow
from core.optimizations.multi_model_orchestrator import get_multi_model_orchestrator

orchestrator = get_multi_model_orchestrator()
result = await orchestrator.execute_workflow(
    workflow=workflow,
    initial_input="How do I learn Python programming?",
    user_id="user-123"
)

print(f"Final output: {result.final_output}")
print(f"Status: {result.status}")
print(f"Total execution time: {result.total_execution_time_ms}ms")
```

## Three-Step Analysis Workflow

**Use Case:** Analyze → Research → Synthesize.

```python
workflow = {
    "steps": [
        {
            "id": "analyze",
            "model": "openai-compatible/gpt-4o-mini",
            "input": "user_query",
            "prompt_template": "Analyze this question and identify key research areas: {input}",
            "output_key": "research_areas",
            "error_handling": {
                "retry": 1,
                "fallback_model": "openai-compatible/qwen3-30b-a3b-instruct-2507"
            }
        },
        {
            "id": "research",
            "model": "openai-compatible/qwen3-30b-a3b-instruct-2507",
            "input": "{analyze.research_areas}",
            "prompt_template": "Research the following topics và provide detailed information: {input}",
            "output_key": "research_data"
        },
        {
            "id": "synthesize",
            "model": "openai-compatible/gpt-4o",
            "input": "{research.research_data}",
            "prompt_template": "Synthesize this research into a comprehensive answer: {input}",
            "output_key": "final_answer"
        }
    ]
}

result = await orchestrator.execute_workflow(
    workflow=workflow,
    initial_input="What are the benefits of using TypeScript over JavaScript?",
    user_id="user-123"
)
```

## Workflow với Error Handling

**Use Case:** Workflow với retry và fallback models.

```python
workflow = {
    "steps": [
        {
            "id": "step_1",
            "model": "openai-compatible/gpt-4o-mini",
            "input": "user_query",
            "prompt_template": "Analyze: {input}",
            "output_key": "analysis",
            "error_handling": {
                "retry": 2,  # Retry up to 2 times
                "fallback_model": "openai-compatible/qwen3-30b-a3b-instruct-2507"  # Fallback if primary fails
            }
        },
        {
            "id": "step_2",
            "model": "openai-compatible/gpt-4o",
            "input": "{step_1.analysis}",
            "prompt_template": "Create plan: {input}",
            "output_key": "plan",
            "error_handling": {
                "retry": 1,
                "fallback_model": "openai-compatible/gpt-4o-mini"
            }
        }
    ]
}
```

## Complex Multi-Step Workflow

**Use Case:** Multi-step research và analysis workflow.

```python
workflow = {
    "steps": [
        {
            "id": "extract_intent",
            "model": "openai-compatible/gpt-4o-mini",
            "input": "user_query",
            "prompt_template": "Extract the intent và key requirements from: {input}",
            "output_key": "intent"
        },
        {
            "id": "create_plan",
            "model": "openai-compatible/gpt-4o",
            "input": "{extract_intent.intent}",
            "prompt_template": "Create a detailed research plan based on: {input}",
            "output_key": "research_plan"
        },
        {
            "id": "execute_research",
            "model": "openai-compatible/qwen3-30b-a3b-instruct-2507",
            "input": "{create_plan.research_plan}",
            "prompt_template": "Execute research tasks: {input}",
            "output_key": "research_results"
        },
        {
            "id": "synthesize",
            "model": "openai-compatible/gpt-4o",
            "input": "Research plan: {create_plan.research_plan}\nResearch results: {execute_research.research_results}",
            "prompt_template": "Synthesize the research into a comprehensive report: {input}",
            "output_key": "final_report"
        }
    ]
}
```

## API Usage Examples

### Execute Workflow via API

```bash
curl -X POST "http://localhost:8000/api/workflow/execute" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": {
      "steps": [
        {
          "id": "step_1",
          "model": "openai-compatible/gpt-4o-mini",
          "input": "user_query",
          "prompt_template": "Analyze: {input}",
          "output_key": "analysis_result"
        },
        {
          "id": "step_2",
          "model": "openai-compatible/gpt-4o",
          "input": "{step_1.analysis_result}",
          "prompt_template": "Create plan: {input}",
          "output_key": "plan_result"
        }
      ]
    },
    "initial_input": "How do I learn Python?",
    "workflow_id": "workflow-001"
  }'
```

### Get Workflow Metrics

```bash
curl -X GET "http://localhost:8000/api/workflow/metrics" \
  -H "Authorization: Bearer <token>"
```

### Get Orchestrator Status

```bash
curl -X GET "http://localhost:8000/api/workflow/status" \
  -H "Authorization: Bearer <token>"
```

## Input Reference Format

### Using `user_query`

Use `"input": "user_query"` to use the initial workflow input:

```python
{
    "id": "step_1",
    "model": "openai-compatible/gpt-4o-mini",
    "input": "user_query",  # Uses initial_input
    "prompt_template": "Analyze: {input}",
    "output_key": "analysis"
}
```

### Using Previous Step Output

Use `"input": "{step_id.output_key}"` to reference a previous step's output:

```python
{
    "id": "step_2",
    "model": "openai-compatible/gpt-4o",
    "input": "{step_1.analysis}",  # Uses step_1's analysis output
    "prompt_template": "Create plan: {input}",
    "output_key": "plan"
}
```

### Using Multiple Intermediate Results

You can reference multiple intermediate results in the prompt template:

```python
{
    "id": "step_3",
    "model": "openai-compatible/gpt-4o",
    "input": "{step_1.analysis}",
    "prompt_template": "Synthesize:\nAnalysis: {input}\nPlan: {step_2.plan}",
    "output_key": "synthesis"
}
```

## Error Handling

### Retry Logic

Configure retry count for each step:

```python
{
    "id": "step_1",
    "model": "openai-compatible/gpt-4o-mini",
    "input": "user_query",
    "prompt_template": "Analyze: {input}",
    "output_key": "analysis",
    "error_handling": {
        "retry": 2  # Retry up to 2 times on failure
    }
}
```

### Fallback Model

Specify a fallback model if the primary model fails:

```python
{
    "id": "step_1",
    "model": "openai-compatible/gpt-4o-mini",
    "input": "user_query",
    "prompt_template": "Analyze: {input}",
    "output_key": "analysis",
    "error_handling": {
        "retry": 1,
        "fallback_model": "openai-compatible/qwen3-30b-a3b-instruct-2507"
    }
}
```

## Best Practices

1. **Use cheaper models for simple steps:** Use `gpt-4o-mini` for analysis và extraction tasks.
2. **Use expensive models for complex steps:** Use `gpt-4o` for synthesis và planning tasks.
3. **Configure error handling:** Always specify `retry` và `fallback_model` for production workflows.
4. **Test workflows:** Test workflows với sample inputs before deploying to production.
5. **Monitor metrics:** Track workflow execution metrics để optimize cost và performance.

## Cost Optimization Tips

1. **Use cheaper models early:** Use `gpt-4o-mini` for initial analysis to reduce cost.
2. **Batch processing:** Process multiple items in a single workflow when possible.
3. **Cache intermediate results:** Cache step outputs if they can be reused.
4. **Optimize prompt templates:** Keep prompts concise để reduce token usage.

## Troubleshooting

### Workflow Fails at Step N

**Issue:** Workflow stops at a specific step.

**Solutions:**
- Check error handling configuration (retry count, fallback model)
- Verify step input references are correct
- Check model availability và API keys
- Review step output format

### Intermediate Results Not Passed

**Issue:** Step N+1 doesn't receive output from step N.

**Solutions:**
- Verify `output_key` matches input reference format: `{step_id.output_key}`
- Check that step N completed successfully
- Verify intermediate results are stored correctly

### Workflow Execution Timeout

**Issue:** Workflow takes too long to execute.

**Solutions:**
- Reduce number of steps
- Use faster models for initial steps
- Optimize prompt templates
- Check network latency

