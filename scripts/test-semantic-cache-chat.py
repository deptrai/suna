#!/usr/bin/env python3
"""
Test Semantic Cache with Chat Requests (Story 2.1)

This script sends test chat requests to verify semantic cache functionality.
"""

import asyncio
import sys
import json
from pathlib import Path
from typing import List, Dict, Any

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))


async def test_semantic_cache_with_requests():
    """
    Test semantic cache by sending similar chat requests.
    """
    from core.optimizations.semantic_cache import get_semantic_cache
    from core.utils.config import OptimizationConfig, OptimizationMode
    
    # Set to OPTIMIZED mode
    OptimizationConfig.set_mode(OptimizationMode.OPTIMIZED)
    
    cache = get_semantic_cache()
    
    print("=" * 80)
    print("🧪 Semantic Cache Chat Test")
    print("=" * 80)
    print(f"Cache enabled: {cache.enabled}")
    print(f"Optimization mode: {OptimizationConfig.OPTIMIZATION_MODE.value}")
    print()
    
    # Test queries (semantically similar)
    test_queries = [
        "What is the weather today?",
        "How's the weather?",
        "Tell me about the weather",
        "What's the weather like?",
        "Can you tell me the weather?",
        "What is Python?",
        "Tell me about Python programming",
        "Explain Python to me",
        "What is the capital of France?",
        "What's the capital city of France?",
    ]
    
    print("📝 Test Queries:")
    for i, query in enumerate(test_queries, 1):
        print(f"  {i}. {query}")
    print()
    
    # Simulate caching responses
    print("🔄 Caching responses...")
    for i, query in enumerate(test_queries[:5], 1):  # Cache first 5 queries
        response = {
            "content": f"This is a test response for query {i}: {query}"
        }
        await cache.cache_response(query, response)
        print(f"  ✅ Cached: '{query[:50]}...'")
    
    print()
    print("🔍 Testing cache lookup...")
    print()
    
    # Test cache lookups
    cache_hits = 0
    cache_misses = 0
    
    for query in test_queries:
        result = await cache.get_cached_response(query)
        if result and result.get("cache_hit"):
            cache_hits += 1
            similarity = result.get("similarity_score", 0)
            cached_query = result.get("cached_query", "N/A")
            print(f"  ✅ HIT: '{query[:50]}...'")
            print(f"     Similarity: {similarity:.3f} | Cached: '{cached_query[:50]}...'")
        else:
            cache_misses += 1
            print(f"  ⚠️  MISS: '{query[:50]}...'")
    
    print()
    print("=" * 80)
    print("📊 Test Results")
    print("=" * 80)
    metrics = cache.get_metrics()
    print(f"Total requests: {metrics['total_requests']}")
    print(f"Cache hits: {metrics['cache_hits']} ({cache_hits} in this test)")
    print(f"Cache misses: {metrics['cache_misses']} ({cache_misses} in this test)")
    print(f"Hit rate: {metrics['hit_rate_percentage']:.2f}%")
    print(f"Cache size: {metrics['cache_size']}/{metrics['max_cache_size']}")
    print(f"Average similarity: {metrics.get('average_similarity_score', 0):.3f}")
    print("=" * 80)
    
    # Recommendations
    print()
    print("💡 Recommendations:")
    if metrics['hit_rate_percentage'] < 20:
        print("  ⚠️  Low cache hit rate. Consider:")
        print("     - Lowering similarity threshold (currently {:.2f})".format(cache.similarity_threshold))
        print("     - Checking if queries are truly semantically similar")
    elif metrics['hit_rate_percentage'] > 80:
        print("  ✅ High cache hit rate! Cache is working well.")
    else:
        print("  ✅ Good cache hit rate. Cache is functioning as expected.")
    
    if metrics['cache_size'] > metrics['max_cache_size'] * 0.8:
        print("  ⚠️  Cache size is high. Consider increasing max_cache_size if needed.")
    
    print()


if __name__ == "__main__":
    asyncio.run(test_semantic_cache_with_requests())

