#!/usr/bin/env python3
"""
Test Semantic Prompt Routing (Phase 3.2)

Tests semantic routing vs keyword routing according to docs specification.

Author: Winston (Architect)
Date: 2025-10-01
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

from core.prompts.semantic_router import SemanticPromptRouter
from core.prompts.router import DynamicPromptRouter, PromptModule


def test_semantic_routing():
    """Test semantic routing with various queries."""
    
    print("=" * 80)
    print("🧪 PHASE 3.2: SEMANTIC ROUTING TEST (Sentence Transformers)")
    print("=" * 80)
    
    # Initialize routers
    print("\n📦 Initializing routers...")
    print("   Loading SentenceTransformer model (all-MiniLM-L6-v2)...")
    semantic_router = SemanticPromptRouter()
    keyword_router = DynamicPromptRouter()
    print("   ✅ Routers initialized\n")
    
    # Test cases from docs
    test_cases = [
        {
            "query": "I need to analyze some data",
            "expected": [PromptModule.TOOL_DATA_PROCESSING],
            "description": "Data analysis query (from docs)"
        },
        {
            "query": "Help me organize my tasks",
            "expected": [PromptModule.TOOL_WORKFLOW],
            "description": "Workflow query"
        },
        {
            "query": "Create a new file",
            "expected": [PromptModule.TOOL_TOOLKIT],
            "description": "File operations query"
        },
        {
            "query": "Write a blog post",
            "expected": [PromptModule.TOOL_CONTENT_CREATION],
            "description": "Content creation query"
        },
        {
            "query": "Parse this JSON data",
            "expected": [PromptModule.TOOL_DATA_PROCESSING],
            "description": "Data parsing query"
        },
        {
            "query": "What can you do?",
            "expected": [],  # Generic - should load all
            "description": "Generic query"
        },
    ]
    
    print("📊 Testing Semantic vs Keyword Routing\n")
    
    results = {
        "semantic": {"correct": 0, "total": 0, "modules_loaded": []},
        "keyword": {"correct": 0, "total": 0, "modules_loaded": []}
    }
    
    for i, test_case in enumerate(test_cases, 1):
        query = test_case["query"]
        expected = test_case["expected"]
        description = test_case["description"]
        
        print(f"\n{'='*80}")
        print(f"Test {i}: {description}")
        print(f"Query: \"{query}\"")
        print(f"Expected modules: {[m.value for m in expected] if expected else 'All (generic)'}")
        print(f"{'='*80}")
        
        # Test semantic routing with hybrid mode (semantic + keyword)
        semantic_modules = semantic_router.route(query, threshold=0.3, use_hybrid=True)
        semantic_tool_modules = [m for m in semantic_modules if m.value.startswith("tools/")]
        
        print(f"\n🧠 Semantic Routing:")
        print(f"   Modules loaded: {len(semantic_modules)}")
        print(f"   Tool modules: {[m.value for m in semantic_tool_modules]}")
        
        # Test keyword routing
        keyword_modules = keyword_router.route(query)
        keyword_tool_modules = [m for m in keyword_modules if m.value.startswith("tools/")]
        
        print(f"\n🔤 Keyword Routing:")
        print(f"   Modules loaded: {len(keyword_modules)}")
        print(f"   Tool modules: {[m.value for m in keyword_tool_modules]}")
        
        # Check correctness
        if expected:
            semantic_correct = all(m in semantic_modules for m in expected)
            keyword_correct = all(m in keyword_modules for m in expected)
        else:
            # Generic query - both should load all modules
            semantic_correct = len(semantic_tool_modules) == 4
            keyword_correct = len(keyword_tool_modules) == 4
        
        print(f"\n✅ Results:")
        print(f"   Semantic: {'✅ CORRECT' if semantic_correct else '❌ INCORRECT'}")
        print(f"   Keyword:  {'✅ CORRECT' if keyword_correct else '❌ INCORRECT'}")
        
        # Calculate cost savings (approximate)
        total_modules = 8  # 4 core + 4 tool
        semantic_reduction = (total_modules - len(semantic_modules)) / total_modules * 100
        keyword_reduction = (total_modules - len(keyword_modules)) / total_modules * 100
        
        print(f"\n💰 Cost Reduction:")
        print(f"   Semantic: {semantic_reduction:.1f}%")
        print(f"   Keyword:  {keyword_reduction:.1f}%")
        
        # Update results
        results["semantic"]["total"] += 1
        results["keyword"]["total"] += 1
        results["semantic"]["modules_loaded"].append(len(semantic_modules))
        results["keyword"]["modules_loaded"].append(len(keyword_modules))
        
        if semantic_correct:
            results["semantic"]["correct"] += 1
        if keyword_correct:
            results["keyword"]["correct"] += 1
    
    # Print summary
    print(f"\n{'='*80}")
    print("📊 SUMMARY")
    print(f"{'='*80}")
    
    semantic_accuracy = results["semantic"]["correct"] / results["semantic"]["total"] * 100
    keyword_accuracy = results["keyword"]["correct"] / results["keyword"]["total"] * 100
    
    semantic_avg_modules = sum(results["semantic"]["modules_loaded"]) / len(results["semantic"]["modules_loaded"])
    keyword_avg_modules = sum(results["keyword"]["modules_loaded"]) / len(results["keyword"]["modules_loaded"])
    
    semantic_avg_reduction = (8 - semantic_avg_modules) / 8 * 100
    keyword_avg_reduction = (8 - keyword_avg_modules) / 8 * 100
    
    print(f"\n🎯 Accuracy:")
    print(f"   Semantic: {semantic_accuracy:.1f}% ({results['semantic']['correct']}/{results['semantic']['total']})")
    print(f"   Keyword:  {keyword_accuracy:.1f}% ({results['keyword']['correct']}/{results['keyword']['total']})")
    
    print(f"\n📦 Average Modules Loaded:")
    print(f"   Semantic: {semantic_avg_modules:.1f} modules")
    print(f"   Keyword:  {keyword_avg_modules:.1f} modules")
    
    print(f"\n💰 Average Cost Reduction:")
    print(f"   Semantic: {semantic_avg_reduction:.1f}%")
    print(f"   Keyword:  {keyword_avg_reduction:.1f}%")
    
    improvement = semantic_avg_reduction - keyword_avg_reduction
    print(f"\n🚀 Improvement: {improvement:+.1f}% (semantic vs keyword)")
    
    # Test analyze_query method
    print(f"\n{'='*80}")
    print("🔍 Testing analyze_query() method")
    print(f"{'='*80}")
    
    test_query = "I need to analyze some data"
    analysis = semantic_router.analyze_query(test_query)
    
    print(f"\nQuery: \"{test_query}\"")
    print(f"\nAnalysis:")
    print(f"   Routing method: {analysis.get('routing_method', 'N/A')}")
    print(f"   Semantic similarities:")
    for module, similarity in analysis.get('semantic_similarities', {}).items():
        print(f"      {module}: {similarity:.3f}")
    
    # Verdict
    print(f"\n{'='*80}")
    if semantic_avg_reduction > keyword_avg_reduction and semantic_accuracy >= keyword_accuracy:
        print("✅ PHASE 3.2 SUCCESS: Semantic routing is better!")
        print(f"   - Better cost reduction: {improvement:+.1f}%")
        print(f"   - Accuracy maintained: {semantic_accuracy:.1f}%")
        print(f"   - Model: all-MiniLM-L6-v2 (SentenceTransformers)")
        return True
    else:
        print("⚠️ PHASE 3.2 NEEDS TUNING: Semantic routing needs improvement")
        print(f"   - Cost reduction: {improvement:+.1f}%")
        print(f"   - Accuracy: {semantic_accuracy:.1f}% vs {keyword_accuracy:.1f}%")
        return False


if __name__ == "__main__":
    success = test_semantic_routing()
    sys.exit(0 if success else 1)

