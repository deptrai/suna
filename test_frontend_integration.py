#!/usr/bin/env python3
"""
Test frontend integration with balanced context optimization
"""
import asyncio
import aiohttp
import json
import time

async def test_agent_initiate():
    """Test agent initiate endpoint with web search query"""
    
    print("🧪 TESTING FRONTEND INTEGRATION")
    print("=" * 50)
    
    # Test data
    test_data = {
        "message": "search for latest AI news and create a summary",
        "project_id": "abc47382-40f7-4161-baa7-7caca09c6925",
        "thread_id": "5b2afb2a-05dd-4195-8a59-b4f29262143b"
    }
    
    print(f"📝 Test query: '{test_data['message']}'")
    print(f"🆔 Thread ID: {test_data['thread_id']}")
    
    try:
        async with aiohttp.ClientSession() as session:
            # Test agent initiate
            print("\n🚀 Initiating agent request...")
            async with session.post(
                "http://localhost:8000/api/agent/initiate",
                json=test_data,
                headers={"Content-Type": "application/json"}
            ) as response:
                
                print(f"📊 Response status: {response.status}")
                
                if response.status == 200:
                    result = await response.json()
                    print(f"✅ Agent initiated successfully")
                    print(f"🔧 Agent run ID: {result.get('agent_run_id', 'N/A')}")
                    
                    # Wait a bit for processing
                    print("\n⏳ Waiting for agent processing...")
                    await asyncio.sleep(3)
                    
                    # Check agent run status
                    agent_run_id = result.get('agent_run_id')
                    if agent_run_id:
                        await check_agent_run_status(session, agent_run_id)
                    
                elif response.status == 401:
                    print("❌ Authentication required")
                    print("💡 This is expected for production API")
                    
                else:
                    error_text = await response.text()
                    print(f"❌ Request failed: {error_text}")
                    
    except Exception as e:
        print(f"❌ Connection error: {e}")
        print("💡 Make sure backend is running on localhost:8000")

async def check_agent_run_status(session, agent_run_id):
    """Check agent run status and stream"""
    
    print(f"\n🔍 Checking agent run status: {agent_run_id}")
    
    try:
        # Get agent run details
        async with session.get(f"http://localhost:8000/api/agent-run/{agent_run_id}") as response:
            if response.status == 200:
                run_data = await response.json()
                print(f"📊 Status: {run_data.get('status', 'unknown')}")
                print(f"🔧 Model: {run_data.get('model', 'unknown')}")
                
                # Try to get stream
                print("\n📡 Attempting to read stream...")
                await read_agent_stream(session, agent_run_id)
                
            else:
                print(f"❌ Failed to get run status: {response.status}")
                
    except Exception as e:
        print(f"❌ Error checking status: {e}")

async def read_agent_stream(session, agent_run_id):
    """Read agent run stream"""
    
    try:
        async with session.get(f"http://localhost:8000/api/agent-run/{agent_run_id}/stream") as response:
            if response.status == 200:
                print("✅ Stream accessible")
                
                # Read first few chunks
                chunk_count = 0
                async for chunk in response.content.iter_chunked(1024):
                    if chunk:
                        chunk_count += 1
                        if chunk_count <= 3:  # Only show first 3 chunks
                            try:
                                decoded = chunk.decode('utf-8')
                                print(f"📦 Chunk {chunk_count}: {decoded[:100]}...")
                            except:
                                print(f"📦 Chunk {chunk_count}: [binary data]")
                        
                        if chunk_count >= 5:  # Stop after 5 chunks
                            break
                            
                print(f"📊 Total chunks read: {chunk_count}")
                
            else:
                print(f"❌ Stream not accessible: {response.status}")
                
    except Exception as e:
        print(f"❌ Error reading stream: {e}")

async def test_health_endpoints():
    """Test basic health endpoints"""
    
    print("\n🏥 TESTING HEALTH ENDPOINTS")
    print("-" * 30)
    
    endpoints = [
        ("Backend Health", "http://localhost:8000/api/health"),
        ("Frontend", "http://localhost:3000"),
    ]
    
    async with aiohttp.ClientSession() as session:
        for name, url in endpoints:
            try:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as response:
                    print(f"✅ {name}: {response.status}")
            except Exception as e:
                print(f"❌ {name}: {e}")

if __name__ == "__main__":
    asyncio.run(test_health_endpoints())
    asyncio.run(test_agent_initiate())
    
    print("\n\n🎉 TESTING COMPLETE")
    print("💡 Check the logs above for tool usage and context optimization results")
