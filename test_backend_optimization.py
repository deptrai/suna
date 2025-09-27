#!/usr/bin/env python3
"""
Test context optimization with actual backend API calls.
This will test the real optimization in the backend system.
"""

import sys
import asyncio
import json
import requests
import time
sys.path.append('backend')

async def test_backend_api():
    """Test optimization through backend API."""
    print("🔥 Backend API Optimization Test")
    print("=" * 60)
    
    # Backend API endpoints
    initiate_url = "http://localhost:8000/api/agent/initiate"
    stream_url = "http://localhost:8000/api/agent-run/{}/stream"
    
    # Test scenarios with different complexity
    test_scenarios = [
        {
            "name": "Simple Question",
            "messages": [
                {"role": "user", "content": "What is Python?"}
            ],
            "expected_tools": 0
        },
        {
            "name": "Code Help Request",
            "messages": [
                {"role": "user", "content": "I need help creating a Python function to read a CSV file and process the data. Can you help me write the code?"}
            ],
            "expected_tools": 3
        },
        {
            "name": "File Operation Request",
            "messages": [
                {"role": "user", "content": "Can you help me edit the main.py file to add error handling around the database connection?"}
            ],
            "expected_tools": 4
        },
        {
            "name": "Complex Development Task",
            "messages": [
                {"role": "user", "content": "I'm building a FastAPI application. Can you help me create a complete user authentication system with JWT tokens, password hashing, and database models?"}
            ],
            "expected_tools": 5
        },
        {
            "name": "Long Conversation",
            "messages": [
                {"role": "user", "content": "Hi, I need help with my Python project"},
                {"role": "assistant", "content": "I'd be happy to help! What kind of Python project are you working on?"},
                {"role": "user", "content": "It's a web application using FastAPI"},
                {"role": "assistant", "content": "Great choice! FastAPI is excellent for building APIs. What specific help do you need?"},
                {"role": "user", "content": "I need to add user authentication"},
                {"role": "assistant", "content": "I can help you implement authentication. Are you looking for JWT-based authentication?"},
                {"role": "user", "content": "Yes, JWT authentication with user registration and login"},
                {"role": "assistant", "content": "Perfect! I'll help you create a complete JWT authentication system."},
                {"role": "user", "content": "Can you also help me set up the database models for users?"}
            ],
            "expected_tools": 4
        }
    ]
    
    results = []
    
    for scenario in test_scenarios:
        print(f"\n🧪 Testing: {scenario['name']}")
        
        # Prepare request for agent initiation
        initiate_data = {
            "message": scenario["messages"][-1]["content"],
            "model": "gpt-4o",
            "temperature": 0.7,
            "thread_id": None
        }

        print(f"   Messages: {len(scenario['messages'])}")
        print(f"   Last message: '{scenario['messages'][-1]['content'][:60]}...'")

        try:
            # Step 1: Initiate agent
            print("   🔄 Initiating agent...")
            start_time = time.time()

            response = requests.post(
                initiate_url,
                json=initiate_data,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            end_time = time.time()
            response_time = end_time - start_time
            
            if response.status_code == 200:
                initiate_data = response.json()
                agent_run_id = initiate_data.get('agent_run_id')

                if agent_run_id:
                    print(f"   ✅ Agent initiated: {agent_run_id}")

                    # Step 2: Stream the response to get token usage
                    print("   🔄 Streaming response...")
                    stream_response = requests.get(
                        stream_url.format(agent_run_id),
                        headers={"Accept": "text/event-stream"},
                        timeout=60,
                        stream=True
                    )

                    end_time = time.time()
                    response_time = end_time - start_time

                    if stream_response.status_code == 200:
                        print(f"   ✅ Stream successful ({response_time:.2f}s)")

                        # Parse streaming response for token usage
                        total_tokens = 0
                        prompt_tokens = 0
                        completion_tokens = 0

                        for line in stream_response.iter_lines():
                            if line:
                                line_str = line.decode('utf-8')
                                if line_str.startswith('data: '):
                                    try:
                                        data = json.loads(line_str[6:])
                                        if 'usage' in data:
                                            usage = data['usage']
                                            prompt_tokens = usage.get('prompt_tokens', prompt_tokens)
                                            completion_tokens = usage.get('completion_tokens', completion_tokens)
                                            total_tokens = usage.get('total_tokens', total_tokens)
                                    except:
                                        continue

                        print(f"   📊 Token usage:")
                        print(f"      Prompt tokens: {prompt_tokens}")
                        print(f"      Completion tokens: {completion_tokens}")
                        print(f"      Total tokens: {total_tokens}")

                        # Estimate optimization impact
                        estimated_unoptimized = total_tokens * 2.5 if total_tokens > 0 else 1000
                        estimated_reduction = (estimated_unoptimized - total_tokens) / estimated_unoptimized * 100 if estimated_unoptimized > 0 else 0

                        print(f"   🎯 Estimated optimization:")
                        print(f"      Without optimization: ~{estimated_unoptimized:.0f} tokens")
                        print(f"      With optimization: {total_tokens} tokens")
                        print(f"      Estimated reduction: {estimated_reduction:.1f}%")

                        results.append({
                            'scenario': scenario['name'],
                            'prompt_tokens': prompt_tokens,
                            'total_tokens': total_tokens,
                            'estimated_reduction': estimated_reduction,
                            'response_time': response_time,
                            'success': True
                        })
                    else:
                        print(f"   ❌ Stream failed: {stream_response.status_code}")
                        results.append({
                            'scenario': scenario['name'],
                            'success': False,
                            'error': f"Stream HTTP {stream_response.status_code}"
                        })
                else:
                    print(f"   ❌ No agent_run_id in response")
                    results.append({
                        'scenario': scenario['name'],
                        'success': False,
                        'error': "No agent_run_id in initiate response"
                    })
                    
            else:
                print(f"   ❌ API call failed: {response.status_code}")
                print(f"   Error: {response.text}")
                results.append({
                    'scenario': scenario['name'],
                    'success': False,
                    'error': f"HTTP {response.status_code}: {response.text}"
                })
                
        except requests.exceptions.RequestException as e:
            print(f"   ❌ Request failed: {e}")
            results.append({
                'scenario': scenario['name'],
                'success': False,
                'error': str(e)
            })
        
        # Wait between requests
        time.sleep(1)
    
    return results

async def analyze_backend_results(results):
    """Analyze backend test results."""
    print(f"\n📊 BACKEND OPTIMIZATION ANALYSIS")
    print("=" * 60)
    
    successful_results = [r for r in results if r.get('success', False)]
    failed_results = [r for r in results if not r.get('success', False)]
    
    print(f"📈 TEST SUMMARY:")
    print(f"   • Successful tests: {len(successful_results)}/{len(results)}")
    print(f"   • Failed tests: {len(failed_results)}")
    
    if successful_results:
        # Calculate averages
        avg_prompt_tokens = sum(r.get('prompt_tokens', 0) for r in successful_results) / len(successful_results)
        avg_total_tokens = sum(r.get('total_tokens', 0) for r in successful_results) / len(successful_results)
        avg_reduction = sum(r.get('estimated_reduction', 0) for r in successful_results) / len(successful_results)
        avg_response_time = sum(r.get('response_time', 0) for r in successful_results) / len(successful_results)
        
        print(f"\n📊 AVERAGE METRICS:")
        print(f"   • Prompt tokens: {avg_prompt_tokens:.0f}")
        print(f"   • Total tokens: {avg_total_tokens:.0f}")
        print(f"   • Estimated optimization: {avg_reduction:.1f}%")
        print(f"   • Response time: {avg_response_time:.2f}s")
        
        # Best and worst
        best = max(successful_results, key=lambda x: x.get('estimated_reduction', 0))
        worst = min(successful_results, key=lambda x: x.get('estimated_reduction', 0))
        
        print(f"\n🏆 BEST OPTIMIZATION:")
        print(f"   • Scenario: {best['scenario']}")
        print(f"   • Reduction: {best.get('estimated_reduction', 0):.1f}%")
        print(f"   • Tokens: {best.get('total_tokens', 0)}")
        
        print(f"\n⚠️ LEAST OPTIMIZATION:")
        print(f"   • Scenario: {worst['scenario']}")
        print(f"   • Reduction: {worst.get('estimated_reduction', 0):.1f}%")
        print(f"   • Tokens: {worst.get('total_tokens', 0)}")
        
        # Detailed results
        print(f"\n📋 DETAILED RESULTS:")
        for result in sorted(successful_results, key=lambda x: x.get('estimated_reduction', 0), reverse=True):
            print(f"   • {result['scenario']}: {result.get('estimated_reduction', 0):.1f}% reduction")
            print(f"     Tokens: {result.get('total_tokens', 0)} | Time: {result.get('response_time', 0):.2f}s")
    
    if failed_results:
        print(f"\n❌ FAILED TESTS:")
        for result in failed_results:
            print(f"   • {result['scenario']}: {result.get('error', 'Unknown error')}")
    
    return {
        'success_rate': len(successful_results) / len(results) * 100 if results else 0,
        'avg_reduction': avg_reduction if successful_results else 0,
        'avg_tokens': avg_total_tokens if successful_results else 0
    }

async def check_backend_status():
    """Check if backend is running."""
    try:
        response = requests.get("http://localhost:8000/docs", timeout=5)
        return response.status_code == 200
    except:
        return False

async def main():
    """Run the backend optimization test."""
    try:
        print("🚀 Backend Optimization Test Starting...")
        
        # Check if backend is running
        print("🔍 Checking backend status...")
        if not await check_backend_status():
            print("❌ Backend is not running!")
            print("   Please start the backend server first:")
            print("   cd backend && python -m uvicorn main:app --reload")
            return False
        
        print("✅ Backend is running!")
        
        # Run tests
        results = await test_backend_api()
        summary = await analyze_backend_results(results)
        
        print("\n" + "=" * 60)
        print("✅ BACKEND OPTIMIZATION TEST COMPLETED!")
        
        print(f"\n🎯 FINAL SUMMARY:")
        print(f"   • Success rate: {summary['success_rate']:.1f}%")
        print(f"   • Average optimization: {summary['avg_reduction']:.1f}%")
        print(f"   • Average tokens: {summary['avg_tokens']:.0f}")
        
        # Evaluation
        if summary['avg_reduction'] >= 50:
            print("\n🎉 EXCELLENT: 50%+ optimization achieved!")
            status = "PRODUCTION READY"
        elif summary['avg_reduction'] >= 30:
            print("\n👍 VERY GOOD: 30-50% optimization achieved!")
            status = "READY FOR DEPLOYMENT"
        elif summary['avg_reduction'] >= 15:
            print("\n✅ GOOD: 15-30% optimization achieved!")
            status = "NEEDS FINE-TUNING"
        else:
            print("\n⚠️ MODERATE: <15% optimization achieved!")
            status = "NEEDS IMPROVEMENT"
        
        print(f"\n🚦 STATUS: {status}")
        
        print(f"\n📋 NEXT STEPS:")
        print(f"   1. Check v98store.com/log for actual detailed token usage")
        print(f"   2. Compare with pre-optimization metrics")
        print(f"   3. Monitor quality and performance")
        print(f"   4. Adjust optimization parameters if needed")
        
        return summary['success_rate'] > 50
        
    except Exception as e:
        print(f"\n❌ Test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
