#!/usr/bin/env python3
"""
Monitor Semantic Cache Metrics (Story 2.1)

This script monitors semantic cache performance metrics in real-time.
"""

import asyncio
import sys
import time
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from core.optimizations.semantic_cache import get_semantic_cache
from core.utils.config import OptimizationConfig, OptimizationMode


async def monitor_metrics(interval: int = 5, duration: int = 60):
    """
    Monitor semantic cache metrics.
    
    Args:
        interval: Update interval in seconds (default: 5)
        duration: Total monitoring duration in seconds (default: 60)
    """
    cache = get_semantic_cache()
    
    print("=" * 80)
    print("📊 Semantic Cache Metrics Monitor")
    print("=" * 80)
    print(f"Update interval: {interval}s | Duration: {duration}s")
    print(f"Optimization mode: {OptimizationConfig.OPTIMIZATION_MODE.value}")
    print(f"Cache enabled: {cache.enabled}")
    print("=" * 80)
    print()
    
    # Header
    print(f"{'Time':<8} | {'Requests':<10} | {'Hits':<6} | {'Misses':<8} | {'Hit Rate':<10} | {'Cache Size':<12} | {'Quality':<8}")
    print("-" * 80)
    
    start_time = time.time()
    last_requests = 0
    last_hits = 0
    last_misses = 0
    
    try:
        while (time.time() - start_time) < duration:
            metrics = cache.get_metrics()
            elapsed = int(time.time() - start_time)
            
            # Calculate rates (requests per second, etc.)
            current_requests = metrics['total_requests']
            current_hits = metrics['cache_hits']
            current_misses = metrics['cache_misses']
            
            req_rate = (current_requests - last_requests) / interval if interval > 0 else 0
            hit_rate = (current_hits - last_hits) / interval if interval > 0 else 0
            miss_rate = (current_misses - last_misses) / interval if interval > 0 else 0
            
            # Format output
            hit_rate_pct = metrics['hit_rate_percentage']
            cache_size = f"{metrics['cache_size']}/{metrics['max_cache_size']}"
            quality_score = metrics.get('average_quality_score')
            if quality_score is None:
                quality_score = "N/A"
            elif isinstance(quality_score, float):
                quality_score = f"{quality_score:.3f}"
            
            print(
                f"{elapsed:>6}s | "
                f"{metrics['total_requests']:>8} ({req_rate:>5.1f}/s) | "
                f"{metrics['cache_hits']:>4} ({hit_rate:>4.1f}/s) | "
                f"{metrics['cache_misses']:>6} ({miss_rate:>5.1f}/s) | "
                f"{hit_rate_pct:>7.2f}% | "
                f"{cache_size:>10} | "
                f"{quality_score:>8}"
            )
            
            last_requests = current_requests
            last_hits = current_hits
            last_misses = current_misses
            
            await asyncio.sleep(interval)
    
    except KeyboardInterrupt:
        print("\n\n⚠️  Monitoring stopped by user")
    
    # Final summary
    print()
    print("=" * 80)
    print("📊 Final Summary")
    print("=" * 80)
    final_metrics = cache.get_metrics()
    print(f"Total requests: {final_metrics['total_requests']}")
    print(f"Cache hits: {final_metrics['cache_hits']}")
    print(f"Cache misses: {final_metrics['cache_misses']}")
    print(f"Hit rate: {final_metrics['hit_rate_percentage']:.2f}%")
    print(f"Cache size: {final_metrics['cache_size']}/{final_metrics['max_cache_size']}")
    print(f"Average similarity score: {final_metrics.get('average_similarity_score', 0):.3f}")
    print(f"Average quality score: {final_metrics.get('average_quality_score', 'N/A')}")
    print(f"Quality breaches: {final_metrics['quality_breaches']}")
    print(f"Auto-disables: {final_metrics['auto_disables']}")
    print("=" * 80)


async def get_cache_status():
    """Get current cache status."""
    cache = get_semantic_cache()
    metrics = cache.get_metrics()
    
    print("=" * 80)
    print("📊 Semantic Cache Status")
    print("=" * 80)
    print(f"Enabled: {cache.enabled}")
    print(f"Optimization mode: {OptimizationConfig.OPTIMIZATION_MODE.value}")
    print(f"Similarity threshold: {cache.similarity_threshold}")
    print(f"Quality threshold: {cache.quality_threshold}")
    print(f"Max cache size: {cache.max_cache_size}")
    print()
    print("Metrics:")
    print(f"  Total requests: {metrics['total_requests']}")
    print(f"  Cache hits: {metrics['cache_hits']}")
    print(f"  Cache misses: {metrics['cache_misses']}")
    print(f"  Hit rate: {metrics['hit_rate_percentage']:.2f}%")
    print(f"  Cache size: {metrics['cache_size']}/{metrics['max_cache_size']}")
    print(f"  Average similarity: {metrics.get('average_similarity_score', 0):.3f}")
    print(f"  Average quality: {metrics.get('average_quality_score', 'N/A')}")
    print(f"  Quality breaches: {metrics['quality_breaches']}")
    print(f"  Auto-disables: {metrics['auto_disables']}")
    print("=" * 80)


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Monitor semantic cache metrics")
    parser.add_argument(
        "--status",
        action="store_true",
        help="Show current cache status and exit"
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=5,
        help="Update interval in seconds (default: 5)"
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=60,
        help="Monitoring duration in seconds (default: 60)"
    )
    
    args = parser.parse_args()
    
    if args.status:
        asyncio.run(get_cache_status())
    else:
        asyncio.run(monitor_metrics(interval=args.interval, duration=args.duration))

