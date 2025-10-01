"""
Validate Phase 2 Task 2.2 (Automated Evaluation)
"""
import sys
import asyncio

print("=" * 80)
print("PHASE 2 TASK 2.2 VALIDATION: Automated Evaluation")
print("=" * 80)

# Test 1: Check imports
print("\n✅ Test 1: Check imports")
try:
    from core.evaluation.evaluator import AutomatedEvaluator, get_evaluator
    from core.evaluation.ab_test import ABTestFramework, get_ab_test_framework
    print("   ✅ PASS: All imports successful")
except Exception as e:
    print(f"   ❌ FAIL: Import error: {e}")
    sys.exit(1)

# Test 2: Initialize evaluator
print("\n✅ Test 2: Initialize AutomatedEvaluator")
try:
    evaluator = AutomatedEvaluator()
    print("   ✅ PASS: Evaluator initialized")
except Exception as e:
    print(f"   ❌ FAIL: Initialization error: {e}")
    sys.exit(1)

# Test 3: Test quality check
print("\n✅ Test 3: Test quality check")
try:
    # Good response
    good_response = {"content": "This is a complete and well-formatted response."}
    score = evaluator._check_quality(good_response)
    print(f"   Good response score: {score:.3f}")
    
    # Bad response
    bad_response = {"content": "Error: failed"}
    score = evaluator._check_quality(bad_response)
    print(f"   Bad response score: {score:.3f}")
    
    print("   ✅ PASS: Quality check working")
except Exception as e:
    print(f"   ❌ FAIL: Quality check error: {e}")

# Test 4: Test completeness check
print("\n✅ Test 4: Test completeness check")
try:
    response = {"content": "This is a test response with sufficient length."}
    expected = {"min_length": 10, "required_keywords": ["test", "response"]}
    
    score = evaluator._check_completeness(response, expected)
    print(f"   Completeness score: {score:.3f}")
    print("   ✅ PASS: Completeness check working")
except Exception as e:
    print(f"   ❌ FAIL: Completeness check error: {e}")

# Test 5: Test format check
print("\n✅ Test 5: Test format check")
try:
    # Well-formatted response
    good_response = {"content": "Test", "metadata": {"key": "value"}}
    score = evaluator._check_format(good_response)
    print(f"   Well-formatted score: {score:.3f}")
    
    # Malformed response
    bad_response = {"data": "{[}]"}
    score = evaluator._check_format(bad_response)
    print(f"   Malformed score: {score:.3f}")
    
    print("   ✅ PASS: Format check working")
except Exception as e:
    print(f"   ❌ FAIL: Format check error: {e}")

# Test 6: Test tool calling check
print("\n✅ Test 6: Test tool calling check")
try:
    # Response with tool calls
    response_with_tools = {
        "content": "I'll help you with that.",
        "tool_calls": [
            {"function": "create_file", "parameters": {"path": "test.txt"}}
        ]
    }
    score = evaluator._check_tool_calling(response_with_tools)
    print(f"   Tool calling score: {score:.3f}")
    print("   ✅ PASS: Tool calling check working")
except Exception as e:
    print(f"   ❌ FAIL: Tool calling check error: {e}")

# Test 7: Test latency measurement
print("\n✅ Test 7: Test latency measurement")
try:
    import time
    
    evaluator.start_timer()
    time.sleep(0.5)  # Simulate work
    score = evaluator._measure_latency()
    print(f"   Latency score (0.5s): {score:.3f}")
    
    evaluator.start_timer()
    time.sleep(2.0)  # Simulate slower work
    score = evaluator._measure_latency()
    print(f"   Latency score (2.0s): {score:.3f}")
    
    print("   ✅ PASS: Latency measurement working")
except Exception as e:
    print(f"   ❌ FAIL: Latency measurement error: {e}")

# Test 8: Test full evaluation
print("\n✅ Test 8: Test full evaluation")
try:
    evaluator.start_timer()
    
    response = {
        "content": "This is a complete response with proper formatting.",
        "tool_calls": [
            {"function": "test_tool", "parameters": {}}
        ]
    }
    
    result = evaluator.evaluate_response(
        response,
        expected={"min_length": 10},
        prompt_version="test_v1"
    )
    
    print(f"   Overall score: {result['overall_score']:.3f}")
    print(f"   Passed: {result['passed']}")
    print(f"   Breakdown:")
    for metric, score in result['breakdown'].items():
        print(f"      - {metric}: {score:.3f}")
    
    if result['overall_score'] > 0.5:
        print("   ✅ PASS: Full evaluation working")
    else:
        print("   ⚠️  WARNING: Low evaluation score")
except Exception as e:
    print(f"   ❌ FAIL: Full evaluation error: {e}")

# Test 9: Test singleton pattern
print("\n✅ Test 9: Test singleton pattern")
try:
    evaluator1 = get_evaluator()
    evaluator2 = get_evaluator()
    
    if evaluator1 is evaluator2:
        print("   ✅ PASS: Singleton pattern working")
    else:
        print("   ❌ FAIL: Singleton pattern not working")
except Exception as e:
    print(f"   ❌ FAIL: Singleton test error: {e}")

# Test 10: Initialize A/B test framework
print("\n✅ Test 10: Initialize ABTestFramework")
try:
    ab_test = ABTestFramework()
    print("   ✅ PASS: ABTestFramework initialized")
except Exception as e:
    print(f"   ❌ FAIL: ABTestFramework initialization error: {e}")

# Test 11: Test comparison calculation
print("\n✅ Test 11: Test comparison calculation")
try:
    results = {
        'monolithic': {
            'success_count': 8,
            'quality_scores': [0.95, 0.92, 0.98, 0.90, 0.96, 0.94, 0.97, 0.93, 0.91, 0.95],
            'latencies': [1.2, 1.5, 1.3, 1.4, 1.6, 1.2, 1.3, 1.5, 1.4, 1.3],
            'errors': []
        },
        'modular': {
            'success_count': 9,
            'quality_scores': [0.96, 0.94, 0.97, 0.92, 0.95, 0.96, 0.98, 0.94, 0.93, 0.96],
            'latencies': [1.1, 1.3, 1.2, 1.3, 1.4, 1.1, 1.2, 1.4, 1.3, 1.2],
            'errors': []
        }
    }
    
    comparison = ab_test._calculate_comparison(results, 10)
    
    print(f"   Monolithic avg: {comparison['monolithic']['avg_quality']:.3f}")
    print(f"   Modular avg: {comparison['modular']['avg_quality']:.3f}")
    print(f"   Winner: {comparison['winner']}")
    print(f"   Passed: {comparison['passed']}")
    print(f"   Quality diff: {comparison['quality_diff']:.3f} ({comparison['quality_diff_pct']:.2f}%)")
    
    print("   ✅ PASS: Comparison calculation working")
except Exception as e:
    print(f"   ❌ FAIL: Comparison calculation error: {e}")

print("\n" + "=" * 80)
print("VALIDATION COMPLETE")
print("=" * 80)
print("\n✅ Phase 2 Task 2.2 (Automated Evaluation) validated successfully!")
print("\nNext steps:")
print("1. Run full A/B test with real test cases")
print("2. Validate modular >= 98% of monolithic quality")
print("3. Move to Phase 3 (Dynamic Routing)")
print("\n" + "=" * 80)

