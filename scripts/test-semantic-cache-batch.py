#!/usr/bin/env python3
"""
Batch Test Semantic Cache (Story 2.1)

Send multiple similar queries to test cache hit rate.
"""

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from core.optimizations.semantic_cache import get_semantic_cache
from core.utils.config import OptimizationConfig, OptimizationMode


async def batch_test():
    """Run batch test with similar queries."""
    # Set to OPTIMIZED mode
    OptimizationConfig.set_mode(OptimizationMode.OPTIMIZED)
    
    cache = get_semantic_cache()
    cache.enable()
    
    print("=" * 80)
    print("🧪 Semantic Cache Batch Test")
    print("=" * 80)
    print(f"Cache enabled: {cache.enabled}")
    print(f"Optimization mode: {OptimizationConfig.OPTIMIZATION_MODE.value}")
    print()
    
    # Test queries - semantically similar groups
    test_groups = [
        {
            "name": "Weather Queries",
            "queries": [
                "What is the weather today?",
                "How's the weather?",
                "Tell me about the weather",
                "What's the weather like?",
                "Can you tell me the weather?",
                "What is the current weather?",
            ]
        },
        {
            "name": "Python Queries",
            "queries": [
                "What is Python?",
                "Tell me about Python programming",
                "Explain Python to me",
                "What is Python programming language?",
                "Can you describe Python?",
            ]
        },
        {
            "name": "France Capital Queries",
            "queries": [
                "What is the capital of France?",
                "What's the capital city of France?",
                "Tell me the capital of France",
                "France capital city",
                "What city is the capital of France?",
            ]
        }
    ]
    
    print("📝 Running batch test with similar query groups...")
    print()
    
    total_requests = 0
    total_hits = 0
    total_misses = 0
    
    for group in test_groups:
        print(f"🔍 Testing: {group['name']}")
        print("-" * 80)
        
        for i, query in enumerate(group['queries'], 1):
            # Cache first query in group
            if i == 1:
                response = {
                    "content": f"This is a test response for {group['name']}: {query}"
                }
                await cache.cache_response(query, response)
                print(f"  ✅ Cached: '{query[:50]}...'")
                await asyncio.sleep(0.1)  # Small delay
            
            # Try to get from cache
            result = await cache.get_cached_response(query)
            total_requests += 1
            
            if result and result.get("cache_hit"):
                total_hits += 1
                similarity = result.get("similarity_score", 0)
                cached_query = result.get("cached_query", "N/A")
                print(f"  ✅ HIT  [{i}]: '{query[:45]}...'")
                print(f"     Similarity: {similarity:.3f} | Cached: '{cached_query[:45]}...'")
            else:
                total_misses += 1
                print(f"  ⚠️  MISS [{i}]: '{query[:45]}...'")
            
            await asyncio.sleep(0.1)  # Small delay between queries
        
        print()
    
    # Get final metrics
    metrics = cache.get_metrics()
    hit_rate = (total_hits / total_requests * 100) if total_requests > 0 else 0
    
    print("=" * 80)
    print("📊 Batch Test Results")
    print("=" * 80)
    print(f"Total requests: {total_requests}")
    print(f"Cache hits: {total_hits}")
    print(f"Cache misses: {total_misses}")
    print(f"Hit rate: {hit_rate:.2f}%")
    print()
    print("Cache Metrics:")
    print(f"  Total requests: {metrics['total_requests']}")
    print(f"  Cache hits: {metrics['cache_hits']}")
    print(f"  Cache misses: {metrics['cache_misses']}")
    print(f"  Hit rate: {metrics['hit_rate_percentage']:.2f}%")
    print(f"  Cache size: {metrics['cache_size']}/{metrics['max_cache_size']}")
    print(f"  Average similarity: {metrics.get('average_similarity_score', 0):.3f}")
    print("=" * 80)
    
    # Recommendations
    print()
    print("💡 Recommendations:")
    if hit_rate < 20:
        print("  ⚠️  Low cache hit rate. Consider:")
        print(f"     - Lowering similarity threshold (currently {cache.similarity_threshold:.2f})")
        print("     - Checking if embedding model is loaded correctly")
    elif hit_rate > 50:
        print("  ✅ Excellent cache hit rate! Cache is working very well.")
    elif hit_rate > 30:
        print("  ✅ Good cache hit rate. Cache is functioning well.")
    else:
        print("  ✅ Moderate cache hit rate. Cache is working as expected.")
    
    if metrics['cache_size'] > metrics['max_cache_size'] * 0.8:
        print(f"  ⚠️  Cache size is high ({metrics['cache_size']}/{metrics['max_cache_size']}).")
        print("     Consider increasing max_cache_size if needed.")
    elif metrics['cache_size'] < metrics['max_cache_size'] * 0.1:
        print(f"  ℹ️  Cache size is low ({metrics['cache_size']}/{metrics['max_cache_size']}).")
        print("     Current max_cache_size is sufficient.")
    
    print()


if __name__ == "__main__":
    asyncio.run(batch_test())

