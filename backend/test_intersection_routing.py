"""
Test Option 2: Intersection routing (semantic AND keyword).
Only load modules when BOTH semantic AND keyword agree.
"""

import sys
import structlog
from core.prompts.router import get_router
from core.prompts.semantic_router import get_semantic_router
from core.prompts.module_manager import PromptModule

logger = structlog.get_logger()

# Import test queries from large test
from test_queries_large import TEST_QUERIES

def run_intersection_test():
    """Run intersection routing test."""
    
    print("=" * 80)
    print("OPTION 2: INTERSECTION ROUTING TEST")
    print("Only load modules when BOTH semantic AND keyword agree")
    print("=" * 80)
    print()
    
    # Initialize routers
    keyword_router = get_router()
    semantic_router = get_semantic_router()
    
    # Track results
    keyword_results = []
    semantic_results = []
    intersection_results = []
    
    total_queries = len(TEST_QUERIES)
    print(f"Testing {total_queries} queries...")
    print()
    
    # Test each query
    for i, query in enumerate(TEST_QUERIES, 1):
        # Keyword routing
        keyword_modules = keyword_router.route(query)
        keyword_tool_modules = [m for m in keyword_modules if m.value.startswith("tools/")]
        keyword_count = len(keyword_modules)
        keyword_reduction = (8 - keyword_count) / 8 * 100
        
        # Semantic routing
        semantic_modules = semantic_router.route(query, threshold=0.3, use_hybrid=False)
        semantic_tool_modules = [m for m in semantic_modules if m.value.startswith("tools/")]
        semantic_count = len(semantic_modules)
        semantic_reduction = (8 - semantic_count) / 8 * 100
        
        # Intersection routing: only load if BOTH agree
        # Core modules always included
        intersection_modules = [
            PromptModule.CORE_IDENTITY,
            PromptModule.CORE_WORKSPACE,
            PromptModule.CORE_CRITICAL_RULES,
            PromptModule.RESPONSE_FORMAT
        ]
        
        # Tool modules: intersection (AND)
        keyword_tool_set = set(keyword_tool_modules)
        semantic_tool_set = set(semantic_tool_modules)
        intersection_tool_modules = list(keyword_tool_set & semantic_tool_set)
        
        # If no intersection, fallback to keyword (safer)
        if not intersection_tool_modules:
            intersection_tool_modules = keyword_tool_modules
        
        intersection_modules.extend(intersection_tool_modules)
        intersection_count = len(intersection_modules)
        intersection_reduction = (8 - intersection_count) / 8 * 100
        
        # Store results
        keyword_results.append({
            'query': query,
            'modules': keyword_count,
            'tool_modules': len(keyword_tool_modules),
            'reduction': keyword_reduction
        })
        
        semantic_results.append({
            'query': query,
            'modules': semantic_count,
            'tool_modules': len(semantic_tool_modules),
            'reduction': semantic_reduction
        })
        
        intersection_results.append({
            'query': query,
            'modules': intersection_count,
            'tool_modules': len(intersection_tool_modules),
            'reduction': intersection_reduction,
            'fallback': len(intersection_tool_modules) == len(keyword_tool_modules)
        })
        
        # Progress indicator
        if i % 50 == 0:
            print(f"Progress: {i}/{total_queries} queries tested...")
    
    print()
    print("=" * 80)
    print("RESULTS")
    print("=" * 80)
    print()
    
    # Calculate statistics
    keyword_avg_modules = sum(r['modules'] for r in keyword_results) / len(keyword_results)
    semantic_avg_modules = sum(r['modules'] for r in semantic_results) / len(semantic_results)
    intersection_avg_modules = sum(r['modules'] for r in intersection_results) / len(intersection_results)
    
    keyword_avg_reduction = sum(r['reduction'] for r in keyword_results) / len(keyword_results)
    semantic_avg_reduction = sum(r['reduction'] for r in semantic_results) / len(semantic_results)
    intersection_avg_reduction = sum(r['reduction'] for r in intersection_results) / len(intersection_results)
    
    # Calculate fallback rate
    fallback_count = sum(1 for r in intersection_results if r['fallback'])
    fallback_rate = fallback_count / len(intersection_results) * 100
    
    print(f"📊 Sample Size: {total_queries} queries")
    print()
    
    print(f"📦 Average Modules Loaded:")
    print(f"   Keyword:      {keyword_avg_modules:.2f} modules")
    print(f"   Semantic:     {semantic_avg_modules:.2f} modules")
    print(f"   Intersection: {intersection_avg_modules:.2f} modules")
    print()
    
    print(f"💰 Average Cost Reduction:")
    print(f"   Keyword:      {keyword_avg_reduction:.1f}%")
    print(f"   Semantic:     {semantic_avg_reduction:.1f}%")
    print(f"   Intersection: {intersection_avg_reduction:.1f}%")
    print()
    
    print(f"🔄 Fallback Rate:")
    print(f"   Queries with no intersection: {fallback_count}/{total_queries} ({fallback_rate:.1f}%)")
    print()
    
    # Comparison
    print("=" * 80)
    print("COMPARISON")
    print("=" * 80)
    print()
    
    print(f"Intersection vs Keyword:")
    print(f"   Modules: {intersection_avg_modules - keyword_avg_modules:+.2f}")
    print(f"   Reduction: {intersection_avg_reduction - keyword_avg_reduction:+.1f}%")
    print()
    
    print(f"Intersection vs Semantic:")
    print(f"   Modules: {intersection_avg_modules - semantic_avg_modules:+.2f}")
    print(f"   Reduction: {intersection_avg_reduction - semantic_avg_reduction:+.1f}%")
    print()
    
    # Statistical significance
    import math
    
    # Intersection vs Keyword
    keyword_variance = sum((r['reduction'] - keyword_avg_reduction) ** 2 for r in keyword_results) / len(keyword_results)
    intersection_variance = sum((r['reduction'] - intersection_avg_reduction) ** 2 for r in intersection_results) / len(intersection_results)
    
    mean_diff = intersection_avg_reduction - keyword_avg_reduction
    pooled_std = math.sqrt((keyword_variance + intersection_variance) / 2)
    t_stat = mean_diff / (pooled_std * math.sqrt(2 / total_queries))
    
    critical_value = 1.96
    is_significant = abs(t_stat) > critical_value
    
    print(f"📊 Statistical Significance (vs Keyword):")
    print(f"   t-statistic: {t_stat:.3f}")
    print(f"   Critical value (95%): ±{critical_value}")
    print(f"   Result: {'✅ SIGNIFICANT' if is_significant else '❌ NOT SIGNIFICANT'}")
    print()
    
    # Conclusion
    print("=" * 80)
    print("CONCLUSION")
    print("=" * 80)
    print()
    
    if intersection_avg_reduction > keyword_avg_reduction:
        if is_significant:
            print(f"✅ Intersection routing is SIGNIFICANTLY BETTER by {intersection_avg_reduction - keyword_avg_reduction:.1f}%")
            print(f"   Recommendation: CONSIDER DEPLOYING INTERSECTION ROUTING")
        else:
            print(f"⚠️ Intersection routing is slightly better by {intersection_avg_reduction - keyword_avg_reduction:.1f}%")
            print(f"   But difference is NOT statistically significant")
            print(f"   Recommendation: KEEP KEYWORD ROUTING (simpler)")
    else:
        print(f"❌ Intersection routing is WORSE by {keyword_avg_reduction - intersection_avg_reduction:.1f}%")
        print(f"   Recommendation: KEEP KEYWORD ROUTING")
    
    print()
    print(f"⚠️ Risk Assessment:")
    print(f"   Fallback rate: {fallback_rate:.1f}%")
    if fallback_rate > 50:
        print(f"   ❌ HIGH RISK: Too many fallbacks, intersection not effective")
    elif fallback_rate > 30:
        print(f"   ⚠️ MEDIUM RISK: Many fallbacks, may miss functionality")
    else:
        print(f"   ✅ LOW RISK: Few fallbacks, intersection working well")
    
    print()
    print("=" * 80)

if __name__ == "__main__":
    run_intersection_test()

