# Anthropic Cache Integration Tests Guide

## Overview

This guide explains how to run integration tests for Anthropic explicit caching (Story 1.3) manually with the Anthropic API.

## Prerequisites

1. **Anthropic API Key**: You need a valid Anthropic API key set in your environment:
   ```bash
   export ANTHROPIC_API_KEY=your_api_key_here
   ```

2. **Python Environment**: Ensure you have the required dependencies installed:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

3. **Redis** (optional, for LiteLLM caching): Redis should be running if you want to test with LiteLLM caching enabled.

## Running Integration Tests

### Option 1: Run Specific Integration Tests

The integration tests are marked with `@pytest.mark.integration` and are skipped by default. To run them:

```bash
cd backend
pytest backend/tests/test_anthropic_explicit_caching.py -m integration -v
```

### Option 2: Run All Tests (Including Integration)

To run all tests including integration tests:

```bash
cd backend
pytest backend/tests/test_anthropic_explicit_caching.py --run-integration-tests -v
```

Note: You may need to add `--run-integration-tests` flag to your pytest configuration or use `-m "not skip"` to include integration tests.

### Option 3: Manual Testing with Python Script

Create a test script to manually verify Anthropic caching:

```python
#!/usr/bin/env python3
"""
Manual integration test for Anthropic explicit caching.
"""

import asyncio
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from core.services.llm import make_llm_api_call

async def test_anthropic_cache():
    """Test Anthropic explicit caching with actual API calls."""
    
    # Check for API key
    if not os.getenv('ANTHROPIC_API_KEY'):
        print("❌ ANTHROPIC_API_KEY not set. Please set it in your environment.")
        return
    
    model_name = "anthropic/claude-haiku-4-5"
    
    # First call (should create cache)
    print("📞 Making first API call (cache creation)...")
    messages_1 = [
        {"role": "system", "content": "You are a helpful assistant. " * 300},  # Large system message for caching
        {"role": "user", "content": "Hello, what is 2+2?"}
    ]
    
    response_1 = await make_llm_api_call(
        model_name=model_name,
        messages=messages_1,
        stream=False
    )
    
    print(f"✅ First call completed")
    print(f"   Response: {response_1.get('content', 'N/A')[:100]}...")
    
    # Check for cache metrics in response
    if hasattr(response_1, 'usage'):
        usage = response_1.usage
        cache_creation = getattr(usage, 'cache_creation_input_tokens', 0) or 0
        cache_read = getattr(usage, 'cache_read_input_tokens', 0) or 0
        print(f"   Cache creation tokens: {cache_creation}")
        print(f"   Cache read tokens: {cache_read}")
    
    # Second call (identical messages - should read from cache)
    print("\n📞 Making second API call (cache read)...")
    messages_2 = messages_1.copy()  # Identical messages
    
    response_2 = await make_llm_api_call(
        model_name=model_name,
        messages=messages_2,
        stream=False
    )
    
    print(f"✅ Second call completed")
    print(f"   Response: {response_2.get('content', 'N/A')[:100]}...")
    
    # Check for cache metrics
    if hasattr(response_2, 'usage'):
        usage = response_2.usage
        cache_creation = getattr(usage, 'cache_creation_input_tokens', 0) or 0
        cache_read = getattr(usage, 'cache_read_input_tokens', 0) or 0
        print(f"   Cache creation tokens: {cache_creation}")
        print(f"   Cache read tokens: {cache_read}")
        
        if cache_read > 0:
            print("✅ Cache hit confirmed! Cache read tokens > 0")
        else:
            print("⚠️  Cache miss - cache read tokens = 0")
    
    # Verify responses are identical (quality validation)
    if response_1.get('content') == response_2.get('content'):
        print("\n✅ Quality validation passed: Responses are identical (100% similarity)")
    else:
        print("\n⚠️  Quality validation: Responses differ (may be due to non-deterministic model behavior)")

if __name__ == "__main__":
    asyncio.run(test_anthropic_cache())
```

Save this as `test_anthropic_cache_manual.py` and run:

```bash
cd /Users/mac_1/Documents/GitHub/chainlens
python3 test_anthropic_cache_manual.py
```

## Expected Results

### Cache Creation (First Call)
- `cache_creation_input_tokens` > 0 (system message tokens cached)
- `cache_read_input_tokens` = 0 (no cache to read from)
- Response should be generated normally

### Cache Read (Second Call - Identical Messages)
- `cache_creation_input_tokens` = 0 (no new cache created)
- `cache_read_input_tokens` > 0 (system message tokens read from cache)
- Response should be identical to first call (100% similarity)
- Latency should be reduced (fewer tokens processed)

### Cache Metrics

Check logs for cache metrics:

```
📊 Anthropic Cache Metrics - model=anthropic/claude-haiku-4-5, 
   cache_creation_tokens=750, 
   cache_read_tokens=0, 
   total_cached_tokens=750, 
   cache_hit_rate=0.00%
```

```
📊 Anthropic Cache Metrics - model=anthropic/claude-haiku-4-5, 
   cache_creation_tokens=0, 
   cache_read_tokens=750, 
   total_cached_tokens=750, 
   cache_hit_rate=75.00%
```

## Troubleshooting

### Issue: Cache read tokens = 0 on second call

**Possible causes:**
1. System message too small (<1024 tokens) - caching not enabled
2. Messages not identical (whitespace, formatting differences)
3. Cache TTL expired (default 5 minutes)
4. Anthropic API caching not available for your account/region

**Solutions:**
- Verify system message is ≥1024 tokens
- Ensure messages are exactly identical
- Check Anthropic API documentation for caching availability

### Issue: Responses differ between calls

**Possible causes:**
1. Non-deterministic model behavior (rare but possible)
2. Different model parameters (temperature, etc.)
3. Cache not being used (check cache metrics)

**Solutions:**
- Verify cache metrics show cache_read_tokens > 0
- Check model parameters are identical
- Anthropic caching should produce identical results

## Monitoring Cache Performance

### Cache Hit Rate

Monitor cache hit rate in production:

```python
# Check quality monitor metrics
from core.optimizations.quality_monitor import get_quality_monitor

quality_monitor = get_quality_monitor()
metrics = await quality_monitor.get_metrics()

# Get Anthropic cache hit rate
cache_hit_rate = metrics.get('anthropic_cache_hit_rate', {})
print(f"Average cache hit rate: {cache_hit_rate.get('average', 0)}%")
```

### API Endpoints

Check cache metrics via API:

```bash
# Get cache metrics
curl http://localhost:8000/api/cache/metrics

# Get cache health
curl http://localhost:8000/api/cache/health

# Get cache hit rate
curl http://localhost:8000/api/cache/metrics/hit-rate
```

## Cost Savings

Expected cost savings with Anthropic explicit caching:

- **Cache hit rate**: 20-30% (typical for system prompts)
- **Cost reduction**: 20-30% for cached tokens
- **Latency improvement**: 10-20% faster responses for cached prompts

Example:
- System prompt: 1000 tokens
- User message: 100 tokens
- Without cache: 1100 input tokens
- With cache (first call): 1100 input tokens (750 cached, 350 new)
- With cache (second call): 350 input tokens (750 from cache, 350 new)
- **Savings**: 68% reduction in input tokens (750/1100)

## References

- [Anthropic Caching Documentation](https://docs.anthropic.com/claude/docs/prompt-caching)
- [Story 1.3: Anthropic Explicit Caching](../docs/stories/1-3-anthropic-explicit-caching.md)
- [Quality Monitoring Framework](../docs/stories/2-4-quality-monitoring-framework.md)

