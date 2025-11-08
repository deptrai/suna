# Story 3.2 Cost Calculation Enhancement - Actual Token Tracking

**Date:** 2025-11-08  
**Story:** [3-2-model-selection-rules.md](stories/3-2-model-selection-rules.md)  
**Status:** ✅ **COMPLETE**

---

## Overview

This document details the implementation of actual token-based cost calculation for Story 3.2 (Model Selection Rules). This enhancement replaces the previous 1:1 input/output token ratio assumption with actual token usage tracking from LLM responses.

---

## Problem Statement

**Previous Implementation:**
- Cost calculation assumed 1:1 input/output token ratio
- Used average of input and output costs per million tokens
- Not accurate for real-world usage where input/output ratios vary

**Enhancement Goal:**
- Track actual input and output tokens from LLM responses
- Calculate costs based on real token usage
- Provide accurate cost savings metrics

---

## Implementation Details

### 1. Routing ID Generation

**Location:** `backend/core/optimizations/model_router.py`

- Added `routing_id: Optional[str]` field to `RoutingResult` dataclass
- Generate unique `routing_id` using `uuid.uuid4()` in `route()` method
- Store routing information in `_active_routings` dictionary for later token tracking

**Code:**
```398:407:backend/core/optimizations/model_router.py
        # Generate unique routing ID for token usage tracking (Story 3.2 enhancement)
        routing_id = str(uuid.uuid4())
        
        # Store routing information for later token usage update
        self._active_routings[routing_id] = {
            "model_id": selected_model.id,
            "complexity": complexity,
            "timestamp": datetime.now(timezone.utc),
            "baseline_model_id": "anthropic/claude-sonnet-4-5-20250929"  # Premium baseline
        }
```

### 2. Token Usage Tracking in Metrics

**Location:** `backend/core/optimizations/model_router.py`

- Added token tracking fields to `RoutingMetrics`:
  - `total_input_tokens: int = 0`
  - `total_output_tokens: int = 0`
  - `routings_with_token_data: int = 0`

**Code:**
```67:70:backend/core/optimizations/model_router.py
    # Story 3.2 enhancement: Actual token tracking
    total_input_tokens: int = 0  # Actual input tokens from LLM responses
    total_output_tokens: int = 0  # Actual output tokens from LLM responses
    routings_with_token_data: int = 0  # Count of routings with actual token data
```

### 3. Cost Update Method

**Location:** `backend/core/optimizations/model_router.py`

- Added `update_cost_with_tokens()` method to update cost metrics với actual token usage
- Calculates actual costs based on real input/output tokens
- Updates cost savings percentage based on actual costs
- Removes routing_id from `_active_routings` after updating

**Code:**
```615:699:backend/core/optimizations/model_router.py
    def update_cost_with_tokens(
        self,
        routing_id: str,
        input_tokens: int,
        output_tokens: int
    ) -> None:
        """
        Update cost metrics with actual token usage (Story 3.2 enhancement).
        
        This method should be called after LLM API call completes với actual token usage.
        
        Args:
            routing_id: Unique routing ID from RoutingResult
            input_tokens: Actual input tokens from LLM response
            output_tokens: Actual output tokens from LLM response
        """
        # ... implementation ...
```

### 4. Thread Manager Integration

**Location:** `backend/core/agentpress/thread_manager.py`

- Added `_thread_routing_ids` dictionary to track routing_id per thread
- Store routing_id when routing happens in `_execute_run()`
- Extract routing_id in `_handle_billing()` and call `update_cost_with_tokens()`
- Handle both initial routing and fallback routing

**Code:**
```36:37:backend/core/agentpress/thread_manager.py
        # Story 3.2 enhancement: Track routing_id per thread for cost calculation
        self._thread_routing_ids: Dict[str, Optional[str]] = {}  # thread_id -> routing_id
```

```132:154:backend/core/agentpress/thread_manager.py
            # Story 3.2 enhancement: Update model router cost metrics với actual tokens
            # Get routing_id from thread routing IDs or message content
            routing_id = self._thread_routing_ids.get(thread_id) or content.get("routing_id")
            if routing_id and (prompt_tokens > 0 or completion_tokens > 0):
                # Clear routing_id after use (one-time use per thread)
                if thread_id in self._thread_routing_ids:
                    del self._thread_routing_ids[thread_id]
                try:
                    from core.utils.config import OptimizationConfig, OptimizationMode
                    from core.optimizations.model_router import get_model_router
                    
                    if OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.OPTIMIZED:
                        model_router = get_model_router()
                        # Update cost metrics với actual token usage
                        # Note: prompt_tokens = input_tokens, completion_tokens = output_tokens
                        model_router.update_cost_with_tokens(
                            routing_id=routing_id,
                            input_tokens=prompt_tokens,
                            output_tokens=completion_tokens
                        )
```

### 5. Metrics API Updates

**Location:** `backend/core/optimizations/model_router.py`

- Updated `get_metrics()` to include token tracking data:
  - `total_input_tokens`
  - `total_output_tokens`
  - `routings_with_token_data`
  - `token_data_coverage` (percentage of routings with token data)

**Code:**
```606:613:backend/core/optimizations/model_router.py
            # Story 3.2 enhancement: Actual token tracking
            "total_input_tokens": self.metrics.total_input_tokens,
            "total_output_tokens": self.metrics.total_output_tokens,
            "routings_with_token_data": self.metrics.routings_with_token_data,
            "token_data_coverage": (
                (self.metrics.routings_with_token_data / total * 100) if total > 0 else 0.0
            ),
```

---

## Cost Calculation Formula

### Previous (Estimated)
```
cost = (input_cost_per_million + output_cost_per_million) / 2
```

### New (Actual)
```
baseline_cost = (input_tokens / 1_000_000) * baseline_input_cost_per_million +
                (output_tokens / 1_000_000) * baseline_output_cost_per_million

selected_cost = (input_tokens / 1_000_000) * selected_input_cost_per_million +
                (output_tokens / 1_000_000) * selected_output_cost_per_million

cost_savings = ((baseline_cost - selected_cost) / baseline_cost) * 100
```

---

## Test Coverage

### New Test Added
- `test_update_cost_with_tokens()` - Verifies actual token-based cost calculation

### Updated Test
- `test_cost_savings_calculation()` - Updated to include token tracking verification

### Test Results
- **21 tests passing** (100% pass rate)
- **2 tests** in `TestCostTracking` class
- All tests verify actual token tracking functionality

---

## Files Modified

1. **`backend/core/optimizations/model_router.py`**
   - Added `routing_id` field to `RoutingResult`
   - Added token tracking fields to `RoutingMetrics`
   - Added `_active_routings` dictionary for routing tracking
   - Added `update_cost_with_tokens()` method
   - Updated `get_metrics()` to include token tracking data
   - Updated `reset_metrics()` to clear `_active_routings`

2. **`backend/core/agentpress/thread_manager.py`**
   - Added `_thread_routing_ids` dictionary
   - Store routing_id when routing happens
   - Extract routing_id in `_handle_billing()` and update cost metrics
   - Handle fallback routing_id storage

3. **`backend/tests/test_model_router.py`**
   - Added `test_update_cost_with_tokens()` test
   - Updated `test_cost_savings_calculation()` test

---

## Benefits

### Accuracy
- **Accurate cost calculation** based on real token usage
- **No assumptions** about input/output token ratios
- **Real-world cost tracking** reflects actual API costs

### Metrics
- **Token data coverage** - Track percentage of routings with actual token data
- **Total token usage** - Track cumulative input/output tokens
- **Cost savings** - More accurate cost savings percentage

### Performance
- **Non-blocking** - Token tracking doesn't block LLM calls
- **Efficient** - Uses dictionary lookup for routing_id tracking
- **Cleanup** - Automatically removes routing_id after use

---

## Usage

### Automatic Tracking
Token usage is automatically tracked when:
1. Model routing is enabled (`OPTIMIZATION_MODE == OPTIMIZED`)
2. Routing happens (`routing_result.decision == "routed"`)
3. LLM response completes với token usage information

### Manual Update (if needed)
```python
from core.optimizations.model_router import get_model_router

model_router = get_model_router()
model_router.update_cost_with_tokens(
    routing_id="routing-id-from-routing-result",
    input_tokens=1000,
    output_tokens=500
)
```

### Metrics Retrieval
```python
metrics = model_router.get_metrics()
print(f"Total input tokens: {metrics['total_input_tokens']}")
print(f"Total output tokens: {metrics['total_output_tokens']}")
print(f"Token data coverage: {metrics['token_data_coverage']}%")
print(f"Cost savings: {metrics['cost_savings_percentage']}%")
```

---

## Future Enhancements

1. **Token Usage History** - Store token usage per routing for historical analysis
2. **Cost Per Routing** - Track individual routing costs for detailed analysis
3. **Token Usage Trends** - Analyze token usage patterns over time
4. **Cost Optimization** - Use token usage data to optimize routing rules

---

## Conclusion

The actual token tracking enhancement provides **accurate cost calculation** based on real token usage from LLM responses. This replaces the previous 1:1 assumption với actual data, resulting in more accurate cost savings metrics.

**Status:** ✅ **COMPLETE - PRODUCTION READY**

---

**Implementation Date:** 2025-11-08  
**Test Coverage:** 21/21 tests passing (100%)  
**Impact:** Improved cost calculation accuracy, better metrics tracking

