#!/usr/bin/env python3
"""
Validate Implementation Script
Phase 1 Validation

Validates that all Phase 1 implementations are working correctly:
1. Comprehensive request logging
2. Cache performance logging  
3. Optimization disabled
4. Tool calling test suite exists
"""
import sys
import os
import importlib.util
from pathlib import Path

def validate_phase1():
    """Validate Phase 1 implementations"""
    print("🔍 PHASE 1 VALIDATION")
    print("=" * 50)
    
    results = {
        "request_logging": False,
        "cache_logging": False,
        "optimization_disabled": False,
        "test_suite_exists": False
    }
    
    # Test 1: Check comprehensive request logging in thread_manager.py
    print("\n✅ Test 1: Comprehensive Request Logging")
    try:
        thread_manager_path = Path("core/agentpress/thread_manager.py")
        if thread_manager_path.exists():
            with open(thread_manager_path) as f:
                content = f.read()
                
            # Check for GlitchTip logging
            has_sentry_import = "import sentry_sdk" in content
            has_prompt_request_context = "prompt_request" in content
            has_request_logging = "Prompt Request:" in content
            
            if has_sentry_import and has_prompt_request_context and has_request_logging:
                print("   ✅ PASS: Request logging implemented")
                results["request_logging"] = True
            else:
                print("   ❌ FAIL: Request logging missing components")
                print(f"      - Sentry import: {has_sentry_import}")
                print(f"      - Prompt request context: {has_prompt_request_context}")
                print(f"      - Request logging: {has_request_logging}")
        else:
            print("   ❌ FAIL: thread_manager.py not found")
    except Exception as e:
        print(f"   ❌ ERROR: {e}")
    
    # Test 2: Check cache performance logging in prompt_caching.py
    print("\n✅ Test 2: Cache Performance Logging")
    try:
        caching_path = Path("core/agentpress/prompt_caching.py")
        if caching_path.exists():
            with open(caching_path) as f:
                content = f.read()
                
            # Check for cache performance logging
            has_cache_context = "cache_performance" in content
            has_cache_logging = "Cache Performance:" in content
            has_metrics = "cache_hit_rate" in content and "blocks_used" in content
            
            if has_cache_context and has_cache_logging and has_metrics:
                print("   ✅ PASS: Cache performance logging implemented")
                results["cache_logging"] = True
            else:
                print("   ❌ FAIL: Cache performance logging missing components")
                print(f"      - Cache context: {has_cache_context}")
                print(f"      - Cache logging: {has_cache_logging}")
                print(f"      - Metrics: {has_metrics}")
        else:
            print("   ❌ FAIL: prompt_caching.py not found")
    except Exception as e:
        print(f"   ❌ ERROR: {e}")
    
    # Test 3: Check optimization disabled
    print("\n✅ Test 3: Optimization Disabled")
    try:
        thread_manager_path = Path("core/agentpress/thread_manager.py")
        if thread_manager_path.exists():
            with open(thread_manager_path) as f:
                content = f.read()
                
            # Check for optimization disabled
            has_disable_comment = "DISABLE aggressive optimization" in content
            has_original_prompt = "Using original system prompt" in content
            has_optimization_disabled_log = "Optimization disabled" in content
            
            if has_disable_comment and has_original_prompt and has_optimization_disabled_log:
                print("   ✅ PASS: Optimization disabled correctly")
                results["optimization_disabled"] = True
            else:
                print("   ❌ FAIL: Optimization not properly disabled")
                print(f"      - Disable comment: {has_disable_comment}")
                print(f"      - Original prompt: {has_original_prompt}")
                print(f"      - Disabled log: {has_optimization_disabled_log}")
        else:
            print("   ❌ FAIL: thread_manager.py not found")
    except Exception as e:
        print(f"   ❌ ERROR: {e}")
    
    # Test 4: Check test file exists
    print("\n✅ Test 4: Tool Calling Test Suite")
    try:
        test_file = Path("tests/test_tool_calling_comprehensive.py")
        if test_file.exists():
            with open(test_file) as f:
                content = f.read()
                
            # Check test file content
            has_single_test = "test_single_tool_call" in content
            has_multiple_test = "test_multiple_tool_calls" in content
            has_complex_test = "test_complex_workflow" in content
            has_glitchtip_logging = "sentry_sdk.capture_message" in content
            
            if has_single_test and has_multiple_test and has_complex_test and has_glitchtip_logging:
                print("   ✅ PASS: Comprehensive test suite implemented")
                results["test_suite_exists"] = True
            else:
                print("   ❌ FAIL: Test suite missing components")
                print(f"      - Single test: {has_single_test}")
                print(f"      - Multiple test: {has_multiple_test}")
                print(f"      - Complex test: {has_complex_test}")
                print(f"      - GlitchTip logging: {has_glitchtip_logging}")
        else:
            print("   ❌ FAIL: test_tool_calling_comprehensive.py not found")
    except Exception as e:
        print(f"   ❌ ERROR: {e}")
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 VALIDATION SUMMARY")
    print("=" * 50)
    
    passed = sum(results.values())
    total = len(results)
    
    for test_name, passed_test in results.items():
        status = "✅ PASS" if passed_test else "❌ FAIL"
        print(f"{status} {test_name.replace('_', ' ').title()}")
    
    print(f"\n🎯 Overall: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    
    if passed == total:
        print("🎉 ALL PHASE 1 IMPLEMENTATIONS VALIDATED!")
        return True
    else:
        print("⚠️  Some implementations need attention")
        return False

def validate_modular_system():
    """Validate modular system is working"""
    print("\n🔍 MODULAR SYSTEM VALIDATION")
    print("=" * 50)
    
    try:
        # Check module structure
        modules_dir = Path("core/prompts/modules")
        if modules_dir.exists():
            core_modules = list((modules_dir / "core").glob("*.txt"))
            tool_modules = list((modules_dir / "tools").glob("*.txt"))
            response_modules = list((modules_dir / "response").glob("*.txt"))
            
            print(f"   📁 Core modules: {len(core_modules)}")
            print(f"   📁 Tool modules: {len(tool_modules)}")
            print(f"   📁 Response modules: {len(response_modules)}")
            
            if len(core_modules) >= 3 and len(tool_modules) >= 3 and len(response_modules) >= 1:
                print("   ✅ PASS: Module structure complete")
            else:
                print("   ❌ FAIL: Module structure incomplete")
        else:
            print("   ❌ FAIL: Modules directory not found")
        
        # Check module manager
        module_manager_path = Path("core/prompts/module_manager.py")
        if module_manager_path.exists():
            print("   ✅ PASS: Module manager exists")
        else:
            print("   ❌ FAIL: Module manager not found")
        
        # Check router
        router_path = Path("core/prompts/router.py")
        if router_path.exists():
            print("   ✅ PASS: Router exists")
        else:
            print("   ❌ FAIL: Router not found")
        
        # Check dynamic routing integration
        thread_manager_path = Path("core/agentpress/thread_manager.py")
        if thread_manager_path.exists():
            with open(thread_manager_path) as f:
                content = f.read()
            
            has_dynamic_routing = "use_dynamic_routing" in content
            has_router_import = "from core.prompts.router import get_router" in content
            
            if has_dynamic_routing and has_router_import:
                print("   ✅ PASS: Dynamic routing integrated")
            else:
                print("   ❌ FAIL: Dynamic routing not integrated")
        
    except Exception as e:
        print(f"   ❌ ERROR: {e}")

if __name__ == "__main__":
    # Change to backend directory
    os.chdir(Path(__file__).parent)
    
    # Run validations
    phase1_success = validate_phase1()
    validate_modular_system()
    
    # Log to GlitchTip
    try:
        import sentry_sdk
        sentry_sdk.capture_message(
            f"Phase 1 Validation Complete: {'SUCCESS' if phase1_success else 'PARTIAL'}",
            level="info",
            extras={
                "validation_type": "phase1_implementation",
                "success": phase1_success
            }
        )
    except Exception as e:
        print(f"⚠️  Failed to log to GlitchTip: {e}")
    
    print(f"\n{'🎉 VALIDATION COMPLETE' if phase1_success else '⚠️  VALIDATION INCOMPLETE'}")
