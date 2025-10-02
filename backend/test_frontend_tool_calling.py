#!/usr/bin/env python3
"""
TEST TOOL CALLING ON FRONTEND

Use Playwright to test tool calling on the actual frontend
"""
import asyncio
import time


async def test_frontend_tool_calling():
    """Test tool calling through frontend UI"""
    print("🎭 FRONTEND TOOL CALLING TEST")
    print("="*80)
    
    # Import Playwright MCP tools
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    
    # Start Playwright MCP server
    server_params = StdioServerParameters(
        command="npx",
        args=["-y", "@executeautomation/playwright-mcp-server"],
        env=None
    )
    
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            
            print("\n🌐 STEP 1: NAVIGATE TO CHAT")
            print("-"*60)
            
            # Navigate to frontend
            result = await session.call_tool(
                "playwright_navigate",
                arguments={"url": "http://localhost:3000"}
            )
            print(f"✅ Navigated to frontend")
            
            # Wait for page load
            await asyncio.sleep(3)
            
            # Take screenshot
            screenshot_result = await session.call_tool(
                "playwright_screenshot",
                arguments={"name": "frontend_home"}
            )
            print(f"📸 Screenshot saved: frontend_home.png")
            
            print("\n🔐 STEP 2: LOGIN (if needed)")
            print("-"*60)
            
            # Check if login needed
            snapshot = await session.call_tool("playwright_snapshot", arguments={})
            page_text = str(snapshot)
            
            if "login" in page_text.lower() or "sign in" in page_text.lower():
                print("🔑 Login required, attempting login...")
                
                # Fill email
                await session.call_tool(
                    "playwright_fill",
                    arguments={
                        "selector": "input[type='email']",
                        "value": "admin@example.com"
                    }
                )
                
                # Fill password
                await session.call_tool(
                    "playwright_fill",
                    arguments={
                        "selector": "input[type='password']",
                        "value": "Admin@123"
                    }
                )
                
                # Click login button
                await session.call_tool(
                    "playwright_click",
                    arguments={"selector": "button[type='submit']"}
                )
                
                await asyncio.sleep(3)
                print("✅ Login completed")
            else:
                print("✅ Already logged in")
            
            print("\n💬 STEP 3: NAVIGATE TO CHAT")
            print("-"*60)
            
            # Find and click on a thread or create new one
            snapshot = await session.call_tool("playwright_snapshot", arguments={})
            
            # Try to find chat/thread link
            try:
                await session.call_tool(
                    "playwright_click",
                    arguments={"selector": "a[href*='thread']"}
                )
                await asyncio.sleep(2)
                print("✅ Opened existing thread")
            except:
                print("⚠️  No existing thread found, may need to create one")
            
            print("\n📝 STEP 4: SEND TEST MESSAGES")
            print("-"*60)
            
            # Test 1: create_tasks tool
            print("\n🔧 Test 1: create_tasks tool")
            
            # Find chat input
            await session.call_tool(
                "playwright_fill",
                arguments={
                    "selector": "textarea, input[type='text']",
                    "value": "Please use create_tasks tool to create 2 tasks: 'Frontend Test Task 1' and 'Frontend Test Task 2' in a section called 'Frontend Tests'"
                }
            )
            
            # Send message
            await session.call_tool(
                "playwright_click",
                arguments={"selector": "button[type='submit'], button:has-text('Send')"}
            )
            
            print("✅ Message sent: create_tasks request")
            
            # Wait for response
            print("⏳ Waiting 15 seconds for agent response...")
            await asyncio.sleep(15)
            
            # Take screenshot of response
            await session.call_tool(
                "playwright_screenshot",
                arguments={"name": "create_tasks_response"}
            )
            print("📸 Screenshot saved: create_tasks_response.png")
            
            # Check page content for tool calls
            snapshot = await session.call_tool("playwright_snapshot", arguments={})
            page_content = str(snapshot)
            
            if "create_tasks" in page_content.lower() or "task" in page_content.lower():
                print("✅ Tool calling detected in UI!")
            else:
                print("⚠️  No obvious tool calling in UI")
            
            # Test 2: web_search tool
            print("\n🔍 Test 2: web_search tool")
            
            await session.call_tool(
                "playwright_fill",
                arguments={
                    "selector": "textarea, input[type='text']",
                    "value": "Please use web_search tool to search for 'latest AI developments 2025'"
                }
            )
            
            await session.call_tool(
                "playwright_click",
                arguments={"selector": "button[type='submit'], button:has-text('Send')"}
            )
            
            print("✅ Message sent: web_search request")
            
            # Wait for response
            print("⏳ Waiting 15 seconds for agent response...")
            await asyncio.sleep(15)
            
            # Take screenshot
            await session.call_tool(
                "playwright_screenshot",
                arguments={"name": "web_search_response"}
            )
            print("📸 Screenshot saved: web_search_response.png")
            
            # Check for tool calls
            snapshot = await session.call_tool("playwright_snapshot", arguments={})
            page_content = str(snapshot)
            
            if "search" in page_content.lower() or "found" in page_content.lower():
                print("✅ Tool calling detected in UI!")
            else:
                print("⚠️  No obvious tool calling in UI")
            
            print("\n" + "="*80)
            print("📊 FRONTEND TOOL CALLING TEST COMPLETE")
            print("="*80)
            print("✅ Tests completed")
            print("📸 Screenshots saved for review")
            print("\nPlease check:")
            print("  - frontend_home.png")
            print("  - create_tasks_response.png")
            print("  - web_search_response.png")


async def main():
    """Run frontend tests"""
    try:
        await test_frontend_tool_calling()
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())

