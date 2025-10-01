"""
Test GlitchTip connection
"""
import os
import sentry_sdk
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

print("=" * 80)
print("GLITCHTIP CONNECTION TEST")
print("=" * 80)

# Check environment variables
print("\n✅ Test 1: Check environment variables")
glitchtip_token = os.getenv("GLITCHTIP_TOKEN")
glitchtip_org = os.getenv("GLITCHTIP_ORGANIZATION")
glitchtip_url = os.getenv("GLITCHTIP_BASE_URL")
sentry_dsn = os.getenv("SENTRY_DSN")

print(f"   GLITCHTIP_TOKEN: {'✅ Set' if glitchtip_token else '❌ Not set'}")
print(f"   GLITCHTIP_ORGANIZATION: {glitchtip_org or '❌ Not set'}")
print(f"   GLITCHTIP_BASE_URL: {glitchtip_url or '❌ Not set'}")
print(f"   SENTRY_DSN: {'✅ Set' if sentry_dsn else '❌ Not set'}")

# Test sentry_sdk
print("\n✅ Test 2: Test sentry_sdk")
try:
    # Send test message
    sentry_sdk.capture_message(
        "GlitchTip connection test",
        level="info",
        extras={
            "test": "connection",
            "timestamp": "2025-10-01"
        }
    )
    print("   ✅ Test message sent successfully")
except Exception as e:
    print(f"   ❌ Failed to send test message: {e}")

# Test context
print("\n✅ Test 3: Test context setting")
try:
    sentry_sdk.set_context("test_context", {
        "key1": "value1",
        "key2": "value2"
    })
    sentry_sdk.capture_message(
        "Test with context",
        level="info"
    )
    print("   ✅ Context set and message sent successfully")
except Exception as e:
    print(f"   ❌ Failed to set context: {e}")

print("\n" + "=" * 80)
print("TEST COMPLETE")
print("=" * 80)
print("\nCheck GlitchTip dashboard for test messages:")
print(f"   URL: {glitchtip_url}")
print(f"   Organization: {glitchtip_org}")
print("=" * 80)

