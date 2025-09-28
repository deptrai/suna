#!/usr/bin/env python3
"""
Test script to create a fresh conversation with v98store model
"""
import requests
import json
import time

def test_fresh_conversation():
    """Test creating a fresh conversation with v98store model"""
    
    # API endpoint
    url = "http://localhost:8000/api/agent/initiate"
    
    # Test data
    test_message = "Hello! This is a test with v98store GPT-4o model. Can you help me test the tool calling functionality?"
    data = {
        "message": test_message,
        "prompt": test_message,  # Add prompt field
        "model_name": "openai-compatible/gpt-4o",
        "enable_context_manager": "true",
        "stream": "false"
    }
    
    # Extract access token from cookie
    import base64

    # Decode the auth token from cookie
    auth_cookie = "eyJhY2Nlc3NfdG9rZW4iOiJleUpoYkdjaU9pSklVekkxTmlJc0luUjVjQ0k2SWtwWFZDSjkuZXlKcGMzTWlPaUpvZEhSd09pOHZNVEkzTGpBdU1DNHhPalUwTXpJeEwyRjFkR2d2ZGpFaUxDSnpkV0lpT2lKaE9HUXhNVEV4TlMxbE56UXhMVFJrT1RZdE9HRXhaUzAzTkdNeU0yRXpPRGsyTnpBaUxDSmhkV1FpT2lKaGRYUm9aVzUwYVdOaGRHVmtJaXdpWlhod0lqb3hOelU1TURJNE1EY3pMQ0pwWVhRaU9qRTNOVGt3TWpRME56TXNJbVZ0WVdsc0lqb2lkR1Z6ZEVCbGVHRnRjR3hsTG1OdmJTSXNJbkJvYjI1bElqb2lJaXdpWVhCd1gyMWxkR0ZrWVhSaElqcDdJbkJ5YjNacFpHVnlJam9pWlcxaGFXd2lMQ0p3Y205MmFXUmxjbk1pT2xzaVpXMWhhV3dpWFgwc0luVnpaWEpmYldWMFlXUmhkR0VpT25zaVpXMWhhV3dpT2lKMFpYTjBRR1Y0WVcxd2JHVXVZMjl0SWl3aVpXMWhhV3hmZG1WeWFXWnBaV1FpT25SeWRXVXNJbkJvYjI1bFgzWmxjbWxtYVdWa0lqcG1ZV3h6WlN3aWMzVmlJam9pWVRoa01URXhNVFV0WlRjME1TMDBaRGsyTFRoaE1XVXROelJqTWpOaE16ZzVOamN3SW4wc0luSnZiR1VpT2lKaGRYUm9aVzUwYVdOaGRHVmtJaXdpWVdGc0lqb2lZV0ZzTVNJc0ltRnRjaUk2VzNzaWJXVjBhRzlrSWpvaWNHRnpjM2R2Y21RaUxDSjBhVzFsYzNSaGJYQWlPakUzTlRnNU5EZ3lOalI5WFN3aWMyVnpjMmx2Ymw5cFpDSTZJbU00WVRnek1qVXdMVGd3WWpJdE5EZ3pNQzFoWkRNMExUZ3lNVGRoWVdKaFlUTXpNQ0lzSW1selgyRnViMjU1Ylc5MWN5STZabUZzYzJWOS5KS0h6VU14OEdReGRxSVg4bTJVd0hybVhDeDNRMXIwdW80elZXSDBWZkg0IiwidG9rZW5fdHlwZSI6ImJlYXJlciIsImV4cGlyZXNfaW4iOjM2MDAsImV4cGlyZXNfYXQiOjE3NTkwMjgwNzMsInJlZnJlc2hfdG9rZW4iOiJ1cXhkbGd6a21qNG0iLCJ1c2VyIjp7ImlkIjoiYThkMTExMTUtZTc0MS00ZDk2LThhMWUtNzRjMjNhMzg5NjcwIiwiYXVkIjoiYXV0aGVudGljYXRlZCIsInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiZW1haWxfY29uZmlybWVkX2F0IjoiMjAyNS0wOS0yN1QwNDo0NDoyNC4zMzExMzdaIiwicGhvbmUiOiIiLCJjb25maXJtZWRfYXQiOiIyMDI1LTA5LTI3VDA0OjQ0OjI0LjMzMTEzN1oiLCJsYXN0X3NpZ25faW5fYXQiOiIyMDI1LTA5LTI3VDA4OjU3OjU2LjA1NDc5M1oiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJzdWIiOiJhOGQxMTExNS1lNzQxLTRkOTYtOGExZS03NGMyM2EzODk2NzAifSwiaWRlbnRpdGllcyI6W3siaWRlbnRpdHlfaWQiOiI5MGUxMmQ1Mi02MGQxLTQxMTItYWNmOS1kYjBiOWY0YWUwMGMiLCJpZCI6ImE4ZDExMTE1LWU3NDEtNGQ5Ni04YTFlLTc0YzIzYTM4OTY3MCIsInVzZXJfaWQiOiJhOGQxMTExNS1lNzQxLTRkOTYtOGExZS03NGMyM2EzODg5NjcwIiwiaWRlbnRpdHlfZGF0YSI6eyJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJlbWFpbF92ZXJpZmllZCI6ZmFsc2UsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic3ViIjoiYThkMTExMTUtZTc0MS00ZDk2LThhMWUtNzRjMjNhMzg5NjcwIn0sInByb3ZpZGVyIjoiZW1haWwiLCJsYXN0X3NpZ25faW5fYXQiOiIyMDI1LTA5LTI3VDA0OjQ0OjI0LjMyODA2NloiLCJjcmVhdGVkX2F0IjoiMjAyNS0wOS0yN1QwNDo0NDoyNC4zMjgxMDNaIiwidXBkYXRlZF9hdCI6IjIwMjUtMDktMjdUMDQ6NDQ6MjQuMzI4MTAzWiIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSJ9XSwiY3JlYXRlZF9hdCI6IjIwMjUtMDktMjdUMDQ6NDQ6MjQuMzIzNTA1WiIsInVwZGF0ZWRfYXQiOiIyMDI1LTA5LTI4VDAxOjU0OjMzLjc4NzA3MloiLCJpc19hbm9ueW1vdXMiOmZhbHNlfX0"

    try:
        # Decode the base64 cookie
        decoded_cookie = base64.b64decode(auth_cookie).decode('utf-8')
        cookie_data = json.loads(decoded_cookie)
        access_token = cookie_data.get('access_token')
        print(f"🔑 Extracted access token: {access_token[:50]}...")
    except Exception as e:
        print(f"⚠️ Failed to extract token: {e}")
        access_token = "eyUpoaGdjaU9pSklVekkxTmlJc0luUjVjQ0k2SWtwWFZDSjkuZXlKcGMzTWlPaUpvZEhSd09pOHZNVEkzTGpBdU1DNHhPalUwTXpJeEwyRjFkR2d2ZGpFaUxDSnpkV0lpT2lKaE9HUXhNVEV4TlMxbE56UXhMVFJrT1RZdE9HRXhaUzAzTkdNeU0yRXpPRGsyTnpBaUxDSmhkV1FpT2lKaGRYUm9aVzUwYVdOaGRHVmtJaXdpWlhod0lqb3hOelU1TURFME1UVTVMQ0pwWVhRaU9qRTNOVGt3TVRBMU16a3NJbVZ0WVdsc0lqb2lkR1Z6ZEVCbGVHRnRjR3hsTG1OdmJTSXNJbkJvYjI1bElqb2lJaXdpWVhCd1gyMWxkR0ZrWVhSaElqcDdJbkJ5YjNacFpHVnlJam9pWlcxaGFXd2lMQ0p3Y205MmFXUmxjbk1pT2xzaVpXMWhhV3dpWFgwc0luVnpaWEpmYldWMFlXUmhkR0VpT25zaVpXMWhhV3dpT2lKMFpYTjBRR1Y0WVcxd2JHVXVZMjl0SWl3aVpXMWhhV3hmZG1WeWFXWnBaV1FpT25SeWRXVXNJbkJvYjI1bFgzWmxjbWxtYVdWa0lqcG1ZV3h6WlN3aWMzVmlJam9pWVRoa01URXhNVFV0WlRjME1TMDBaRGsyTFRoaE1XVXROelJqTWpOaE16ZzVOamN3SW4wc0luSnZiR1VpT2lKaGRYUm9aVzUwYVdOaGRHVmtJaXdpWVdGc0lqb2lZV0ZzTVNJc0ltRnRjaUk2VzNzaWJXVjBhRzlrSWpvaWNHRnpjM2R2Y21RaUxDSjBhVzFsYzNSaGJYQWlPakUzTlRnNU5EZ3lOalI5WFN3aWMyVnpjMmx2Ymw5cFpDSTZJbU00WVRnek1qVXdMVGd3WWpJdE5EZ3pNQzFoWkRNMExUZ3lNVGRoWVdKaFlUTXpNQ0lzSW1selgyRnViMjU1Ylc5MWN5STZabUZzYzJWOS5yM29lcUJwbW85c3o2UEV5YlVBRlpNelNnSGJkVHNrQXktV0ZwNHlvXy1z"  # fallback

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Test Script",
        "Authorization": f"Bearer {access_token}"
    }
    
    print("🚀 Testing fresh conversation with v98store...")
    print(f"📝 Message: {data['message']}")
    print(f"🤖 Model: {data['model_name']}")
    print(f"🔧 Context Manager: {data['enable_context_manager']}")
    print()
    
    try:
        # Make the request
        print("📡 Making API request...")
        response = requests.post(url, data=data, headers=headers, timeout=30)
        
        print(f"📊 Status Code: {response.status_code}")
        print(f"📋 Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            try:
                result = response.json()
                print("✅ Success! Response:")
                print(json.dumps(result, indent=2))
                
                # Extract thread info
                if 'thread_id' in result:
                    thread_id = result['thread_id']
                    print(f"\n🔗 Thread ID: {thread_id}")
                    
                    # Wait a bit for processing
                    print("⏳ Waiting for agent processing...")
                    time.sleep(10)
                    
                    # Check thread messages
                    messages_url = f"http://localhost:8000/api/thread/{thread_id}/messages"
                    print(f"📨 Checking messages: {messages_url}")
                    
                    messages_response = requests.get(messages_url)
                    if messages_response.status_code == 200:
                        messages_data = messages_response.json()
                        print("📬 Messages:")
                        print(json.dumps(messages_data, indent=2))
                    else:
                        print(f"❌ Failed to get messages: {messages_response.status_code}")
                        print(messages_response.text)
                        
            except json.JSONDecodeError:
                print("⚠️ Response is not JSON:")
                print(response.text)
        else:
            print(f"❌ Request failed: {response.status_code}")
            print(response.text)
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request error: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

if __name__ == "__main__":
    test_fresh_conversation()
