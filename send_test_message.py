#!/usr/bin/env python3
"""
Send a test message to the thread to trigger tool calling.
"""

import asyncio
import httpx
import os


async def send_message():
    """Send a test message using /api/agent/initiate endpoint."""

    # Test message
    test_message = "Search for information about Python async programming"

    print(f"\n📝 Sending message: {test_message}")

    async with httpx.AsyncClient(timeout=120.0) as client:
        print("\n🚀 Sending to /api/agent/initiate...")

        # Use multipart/form-data format
        response = await client.post(
            "http://localhost:8000/api/agent/initiate",
            data={
                "prompt": test_message,
                "stream": "false"
            }
        )

        print(f"Status: {response.status_code}")

        if response.status_code == 200:
            print(f"✅ Success!")
            result = response.json()
            print(f"Response: {result}")
        else:
            print(f"❌ Failed: {response.text}")
            return

        # Wait for worker to process
        print("\n⏳ Waiting for worker to process (15 seconds)...")
        await asyncio.sleep(15)

        print("\n✅ Done! Check worker logs for debug output:")
        print("   tail -200 logs/worker.log | grep 'ROUTER REQUEST DEBUG'")


if __name__ == "__main__":
    asyncio.run(send_message())

