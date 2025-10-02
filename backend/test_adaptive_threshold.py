"""
Test Option 3: Adaptive threshold routing.
Adjust threshold based on query confidence (max similarity).
"""

import sys
import structlog
from core.prompts.router import get_router
from core.prompts.semantic_router import get_semantic_router
from sklearn.metrics.pairwise import cosine_similarity

logger = structlog.get_logger()

# Import test queries from large test
from test_queries_large import TEST_QUERIES

def adaptive_route(semantic_router, query):
    """
    Route with adaptive threshold based on confidence.
    
    High confidence (max_sim > 0.7): threshold = 0.5 (strict)
    Medium confidence (max_sim > 0.4): threshold = 0.3 (moderate)
    Low confidence (max_sim <= 0.4): fallback to keyword
    """
    # Get query embedding
    query_embedding = semantic_router.model.encode(query)
    
    # Calculate similarities
    similarities = {}
    for module, module_embedding in semantic_router.module_embeddings.items():
        similarity = cosine_similarity(
            query_embedding.reshape(1, -1),
            module_embedding.reshape(1, -1)
        )[0][0]
        similarities[module] = similarity
    
    max_similarity = max(similarities.values())
    
    # Adaptive threshold
    if max_similarity > 0.7:
        threshold = 0.5  # High confidence: strict
        confidence = "HIGH"
    elif max_similarity > 0.4:
        threshold = 0.3  # Medium confidence: moderate
        confidence = "MEDIUM"
    else:
        # Low confidence: fallback to keyword
        from core.prompts.router import get_router
        keyword_router = get_router()
        return keyword_router.route(query), "LOW (fallback)"
    
    # Route with adaptive threshold
    modules = semantic_router.route(query, threshold=threshold, use_hybrid=False)
    
    return modules, confidence

def run_adaptive_test():
    """Run adaptive threshold routing test."""
    
    print("=" * 80)
    print("OPTION 3: ADAPTIVE THRESHOLD ROUTING TEST")
    print("Adjust threshold based on query confidence")
    print("=" * 80)
    print()
    
    # Initialize routers
    keyword_router = get_router()
    semantic_router = get_semantic_router()
    
    # Track results
    keyword_results = []
    adaptive_results = []
    confidence_counts = {"HIGH": 0, "MEDIUM": 0, "LOW (fallback)": 0}
    
    total_queries = len(TEST_QUERIES)
    print(f"Testing {total_queries} queries...")
    print()
    
    # Test each query
    for i, query in enumerate(TEST_QUERIES, 1):
        # Keyword routing
        keyword_modules = keyword_router.route(query)
        keyword_count = len(keyword_modules)
        keyword_reduction = (8 - keyword_count) / 8 * 100
        
        # Adaptive routing
        adaptive_modules, confidence = adaptive_route(semantic_router, query)
        adaptive_count = len(adaptive_modules)
        adaptive_reduction = (8 - adaptive_count) / 8 * 100
        
        # Track confidence
        confidence_counts[confidence] += 1
        
        # Store results
        keyword_results.append({
            'query': query,
            'modules': keyword_count,
            'reduction': keyword_reduction
        })
        
        adaptive_results.append({
            'query': query,
            'modules': adaptive_count,
            'reduction': adaptive_reduction,
            'confidence': confidence
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
    adaptive_avg_modules = sum(r['modules'] for r in adaptive_results) / len(adaptive_results)
    
    keyword_avg_reduction = sum(r['reduction'] for r in keyword_results) / len(keyword_results)
    adaptive_avg_reduction = sum(r['reduction'] for r in adaptive_results) / len(adaptive_results)
    
    print(f"📊 Sample Size: {total_queries} queries")
    print()
    
    print(f"📦 Average Modules Loaded:")
    print(f"   Keyword:  {keyword_avg_modules:.2f} modules")
    print(f"   Adaptive: {adaptive_avg_modules:.2f} modules")
    print(f"   Difference: {adaptive_avg_modules - keyword_avg_modules:+.2f} modules")
    print()
    
    print(f"💰 Average Cost Reduction:")
    print(f"   Keyword:  {keyword_avg_reduction:.1f}%")
    print(f"   Adaptive: {adaptive_avg_reduction:.1f}%")
    print(f"   Difference: {adaptive_avg_reduction - keyword_avg_reduction:+.1f}%")
    print()
    
    print(f"🎯 Confidence Distribution:")
    for confidence, count in confidence_counts.items():
        percentage = count / total_queries * 100
        print(f"   {confidence}: {count}/{total_queries} ({percentage:.1f}%)")
    print()
    
    # Statistical significance
    import math
    
    keyword_variance = sum((r['reduction'] - keyword_avg_reduction) ** 2 for r in keyword_results) / len(keyword_results)
    adaptive_variance = sum((r['reduction'] - adaptive_avg_reduction) ** 2 for r in adaptive_results) / len(adaptive_results)
    
    mean_diff = adaptive_avg_reduction - keyword_avg_reduction
    pooled_std = math.sqrt((keyword_variance + adaptive_variance) / 2)
    t_stat = mean_diff / (pooled_std * math.sqrt(2 / total_queries))
    
    critical_value = 1.96
    is_significant = abs(t_stat) > critical_value
    
    print(f"📊 Statistical Significance:")
    print(f"   t-statistic: {t_stat:.3f}")
    print(f"   Critical value (95%): ±{critical_value}")
    print(f"   Result: {'✅ SIGNIFICANT' if is_significant else '❌ NOT SIGNIFICANT'}")
    print()
    
    # Conclusion
    print("=" * 80)
    print("CONCLUSION")
    print("=" * 80)
    print()
    
    if adaptive_avg_reduction > keyword_avg_reduction:
        if is_significant:
            print(f"✅ Adaptive routing is SIGNIFICANTLY BETTER by {adaptive_avg_reduction - keyword_avg_reduction:.1f}%")
            print(f"   Recommendation: CONSIDER DEPLOYING ADAPTIVE ROUTING")
        else:
            print(f"⚠️ Adaptive routing is slightly better by {adaptive_avg_reduction - keyword_avg_reduction:.1f}%")
            print(f"   But difference is NOT statistically significant")
            print(f"   Recommendation: KEEP KEYWORD ROUTING (simpler)")
    else:
        print(f"❌ Adaptive routing is WORSE by {keyword_avg_reduction - adaptive_avg_reduction:.1f}%")
        print(f"   Recommendation: KEEP KEYWORD ROUTING")
    
    print()
    print(f"⚠️ Complexity Assessment:")
    fallback_rate = confidence_counts["LOW (fallback)"] / total_queries * 100
    print(f"   Fallback rate: {fallback_rate:.1f}%")
    print(f"   High confidence: {confidence_counts['HIGH'] / total_queries * 100:.1f}%")
    print(f"   Medium confidence: {confidence_counts['MEDIUM'] / total_queries * 100:.1f}%")
    
    if fallback_rate > 50:
        print(f"   ❌ HIGH COMPLEXITY: Too many fallbacks, adaptive not effective")
    elif fallback_rate > 30:
        print(f"   ⚠️ MEDIUM COMPLEXITY: Some fallbacks, may be worth it")
    else:
        print(f"   ✅ LOW COMPLEXITY: Few fallbacks, adaptive working well")
    
    print()
    print("=" * 80)

if __name__ == "__main__":
    run_adaptive_test()

