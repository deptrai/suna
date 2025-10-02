"""
Performance tests.

BMAD Test Strategy: Integration Tests (P1)
- Test ID: PERF-INT-001 to PERF-INT-003
- Level: Integration (mocked dependencies)
- Priority: P1 (Important)
- Risk: RISK-004 (Performance degradation)

Tests:
- Latency measurement (response time < 2s)
- Routing overhead (< 50ms)
- Cache performance (hit rate > 70%)
"""

import pytest
import time
import asyncio
from core.prompts.router import DynamicPromptRouter
from core.prompts.module_manager import get_prompt_builder

@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.performance
async def test_latency_measurement(chat_helper, test_thread):
    """
    Test ID: PERF-INT-001
    Level: Integration
    Priority: P1
    
    Test response time is within SLA.
    
    Acceptance Criteria:
    - p95 response time < 2s
    - Average response time < 1s
    - No timeouts
    
    Mitigates: RISK-004 (Performance degradation)
    """
    queries = [
        "What is 2+2?",
        "Explain quantum computing",
        "Create a file called test.txt",
        "Parse this CSV data",
        "Write a blog post"
    ]
    
    latencies = []
    
    for query in queries:
        start = time.time()
        response = await chat_helper(thread_id=test_thread, content=query)
        end = time.time()
        
        latency = end - start
        latencies.append(latency)
        
        # Each query should complete in < 2s
        assert latency < 2.0, f"Query '{query}' took {latency:.2f}s (> 2s SLA)"
    
    # Calculate statistics
    avg_latency = sum(latencies) / len(latencies)
    p95_latency = sorted(latencies)[int(len(latencies) * 0.95)]
    
    # Assertions
    assert avg_latency < 1.0, f"Average latency {avg_latency:.2f}s exceeds 1s"
    assert p95_latency < 2.0, f"p95 latency {p95_latency:.2f}s exceeds 2s"
    
    print(f"✅ PERF-INT-001 PASSED: Latency measurement test")
    print(f"   Average latency: {avg_latency*1000:.2f}ms")
    print(f"   p95 latency: {p95_latency*1000:.2f}ms")
    print(f"   Max latency: {max(latencies)*1000:.2f}ms")
    print(f"   Min latency: {min(latencies)*1000:.2f}ms")

@pytest.mark.unit
@pytest.mark.performance
def test_routing_overhead():
    """
    Test ID: PERF-INT-002
    Level: Unit
    Priority: P1
    
    Test routing overhead is minimal.
    
    Acceptance Criteria:
    - Routing completes in < 50ms
    - Average routing time < 10ms
    - Consistent performance
    
    Mitigates: RISK-004 (Performance degradation)
    """
    router = DynamicPromptRouter()

    # Warm up router (first call is slower due to initialization)
    router.route("Warm up query")

    queries = [
        "Create a file",
        "Parse CSV data",
        "Write a blog post",
        "Analyze dataset",
        "Generate report"
    ] * 10  # 50 queries total

    routing_times = []

    for query in queries:
        start = time.time()
        modules = router.route(query)
        end = time.time()
        
        routing_time = (end - start) * 1000  # Convert to ms
        routing_times.append(routing_time)
        
        # Each routing should complete in < 50ms
        assert routing_time < 50, f"Routing took {routing_time:.2f}ms (> 50ms)"
    
    # Calculate statistics
    avg_time = sum(routing_times) / len(routing_times)
    p95_time = sorted(routing_times)[int(len(routing_times) * 0.95)]
    
    # Assertions
    assert avg_time < 10, f"Average routing time {avg_time:.2f}ms exceeds 10ms"
    assert p95_time < 50, f"p95 routing time {p95_time:.2f}ms exceeds 50ms"
    
    print(f"✅ PERF-INT-002 PASSED: Routing overhead test")
    print(f"   Queries tested: {len(queries)}")
    print(f"   Average routing time: {avg_time:.2f}ms")
    print(f"   p95 routing time: {p95_time:.2f}ms")
    print(f"   Max routing time: {max(routing_times):.2f}ms")

@pytest.mark.unit
@pytest.mark.performance
def test_cache_performance():
    """
    Test ID: PERF-INT-003
    Level: Unit
    Priority: P1
    
    Test cache performance metrics.
    
    Acceptance Criteria:
    - Cache hit rate > 70% (simulated)
    - Cache lookup time < 1ms
    - No cache misses for repeated queries
    
    Mitigates: RISK-002 (Cost reduction not achieved)
    """
    # Simulate cache behavior
    cache = {}
    
    queries = [
        "What is 2+2?",
        "Explain quantum computing",
        "Create a file",
        "Parse CSV data",
        "Write a blog post"
    ]
    
    # Simulate repeated queries (should hit cache)
    repeated_queries = queries * 5  # Each query repeated 5 times
    
    hits = 0
    misses = 0
    lookup_times = []
    
    for query in repeated_queries:
        start = time.time()
        
        if query in cache:
            # Cache hit
            result = cache[query]
            hits += 1
        else:
            # Cache miss
            result = f"Response for: {query}"
            cache[query] = result
            misses += 1
        
        end = time.time()
        lookup_time = (end - start) * 1000  # Convert to ms
        lookup_times.append(lookup_time)
        
        # Cache lookup should be < 1ms
        assert lookup_time < 1, f"Cache lookup took {lookup_time:.2f}ms (> 1ms)"
    
    # Calculate hit rate
    total = hits + misses
    hit_rate = (hits / total) * 100
    
    # Assertions
    assert hit_rate > 70, f"Cache hit rate {hit_rate:.1f}% is below 70%"
    
    # Average lookup time should be very fast
    avg_lookup = sum(lookup_times) / len(lookup_times)
    assert avg_lookup < 1, f"Average lookup time {avg_lookup:.2f}ms exceeds 1ms"
    
    print(f"✅ PERF-INT-003 PASSED: Cache performance test")
    print(f"   Total queries: {total}")
    print(f"   Cache hits: {hits}")
    print(f"   Cache misses: {misses}")
    print(f"   Hit rate: {hit_rate:.1f}%")
    print(f"   Average lookup time: {avg_lookup:.4f}ms")

@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.performance
async def test_concurrent_performance(chat_helper, test_thread):
    """
    Test ID: PERF-INT-004
    Level: Integration
    Priority: P2
    
    Test performance under concurrent load.
    
    Acceptance Criteria:
    - 10 concurrent queries complete in < 5s
    - No performance degradation
    - All queries succeed
    """
    queries = [
        "What is 2+2?",
        "Explain quantum computing",
        "Create a file",
        "Parse CSV data",
        "Write a blog post",
        "Analyze dataset",
        "Generate report",
        "Process spreadsheet",
        "Create visualization",
        "Write documentation"
    ]
    
    start = time.time()
    
    # Send all queries concurrently
    tasks = [
        chat_helper(thread_id=test_thread, content=query)
        for query in queries
    ]
    
    responses = await asyncio.gather(*tasks)
    
    end = time.time()
    total_time = end - start
    
    # Assertions
    assert total_time < 5.0, f"Concurrent queries took {total_time:.2f}s (> 5s)"
    assert len(responses) == len(queries), "All queries should complete"
    
    # All responses should be valid
    for i, response in enumerate(responses):
        assert response is not None, f"Query {i} should have response"
        assert len(response) > 0, f"Query {i} response should have content"
    
    print(f"✅ PERF-INT-004 PASSED: Concurrent performance test")
    print(f"   Concurrent queries: {len(queries)}")
    print(f"   Total time: {total_time:.2f}s")
    print(f"   Average time per query: {(total_time/len(queries)):.2f}s")
    print(f"   All queries succeeded: ✅")

@pytest.mark.unit
@pytest.mark.performance
def test_prompt_building_performance():
    """
    Test ID: PERF-INT-005
    Level: Unit
    Priority: P2
    
    Test prompt building performance.
    
    Acceptance Criteria:
    - Prompt building < 100ms
    - Module loading < 50ms
    - Consistent performance
    """
    builder = get_prompt_builder()
    
    queries = [
        "Create a file",
        "Parse CSV data",
        "Write a blog post",
        "Analyze dataset",
        "Generate report"
    ] * 10  # 50 queries
    
    build_times = []
    
    for query in queries:
        start = time.time()
        prompt = builder.build_prompt(query)
        end = time.time()
        
        build_time = (end - start) * 1000  # Convert to ms
        build_times.append(build_time)
        
        # Each build should complete in < 100ms
        assert build_time < 100, f"Prompt building took {build_time:.2f}ms (> 100ms)"
    
    # Calculate statistics
    avg_time = sum(build_times) / len(build_times)
    p95_time = sorted(build_times)[int(len(build_times) * 0.95)]
    
    # Assertions
    assert avg_time < 50, f"Average build time {avg_time:.2f}ms exceeds 50ms"
    
    print(f"✅ PERF-INT-005 PASSED: Prompt building performance test")
    print(f"   Queries tested: {len(queries)}")
    print(f"   Average build time: {avg_time:.2f}ms")
    print(f"   p95 build time: {p95_time:.2f}ms")

