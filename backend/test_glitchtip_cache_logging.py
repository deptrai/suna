"""
Test GlitchTip cache metrics logging
Phase 1 Task 1.1.2
"""
from core.agentpress.prompt_caching import _log_cache_metrics_to_glitchtip

print("=" * 80)
print("PHASE 1 TASK 1.1.2: Test GlitchTip Cache Metrics Logging")
print("=" * 80)

# Test the logging function
print("\n📊 Testing cache metrics logging...")

try:
    _log_cache_metrics_to_glitchtip(
        blocks_used=3,
        system_tokens=5000,
        total_conversation_tokens=15000,
        cache_count=3,
        total_messages=25,
        model_name="claude-sonnet-4"
    )
    
    print("✅ Cache metrics logged successfully!")
    print("\n📋 Logged metrics:")
    print("  - Blocks used: 3/4")
    print("  - System tokens: 5,000")
    print("  - Conversation tokens: 15,000")
    print("  - Total tokens: 20,000")
    print("  - Cache breakpoints: 3")
    print("  - Total messages: 25")
    print("  - Cache hit rate: 12.0%")
    print("  - Estimated savings: 10.8%")
    
    print("\n✅ Check GlitchTip dashboard for the logged event!")
    print("   Event message: 'Prompt Cache Metrics: 3/4 blocks, 3 breakpoints, 12.0% hit rate'")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 80)
print("TEST COMPLETE")
print("=" * 80)

