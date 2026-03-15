#!/usr/bin/env python3
"""
Real-time Redis queue monitor for debugging Dramatiq task queuing.
"""
import redis
import time
import json
from datetime import datetime

# Connect to Redis
r = redis.Redis(host='localhost', port=6379, decode_responses=True)

print("🔍 Redis Queue Monitor Started")
print("=" * 60)
print(f"Monitoring: dramatiq:default queue")
print(f"Press Ctrl+C to stop")
print("=" * 60)

last_queue_length = 0

try:
    while True:
        # Check queue length
        queue_length = r.llen('dramatiq:default')
        
        # Check all dramatiq keys
        all_keys = r.keys('dramatiq:*')
        
        # Only print if something changed
        if queue_length != last_queue_length or queue_length > 0:
            timestamp = datetime.now().strftime("%H:%M:%S")
            print(f"\n[{timestamp}] Queue Length: {queue_length}")
            
            if queue_length > 0:
                # Peek at the first message without removing it
                message = r.lindex('dramatiq:default', 0)
                if message:
                    try:
                        msg_data = json.loads(message)
                        print(f"  📦 Message: {msg_data.get('actor_name', 'unknown')}")
                        print(f"  🆔 Message ID: {msg_data.get('message_id', 'unknown')[:16]}...")
                        args = msg_data.get('args', [])
                        if args:
                            print(f"  📝 Args: agent_run_id={args[0] if len(args) > 0 else 'N/A'}")
                    except:
                        print(f"  ⚠️  Could not parse message")
            
            last_queue_length = queue_length
        
        # Show all dramatiq keys
        if len(all_keys) > 1:  # More than just heartbeats
            print(f"  🔑 Active keys: {len(all_keys)}")
            for key in all_keys[:5]:  # Show first 5
                print(f"     - {key}")
        
        time.sleep(0.5)  # Check every 500ms

except KeyboardInterrupt:
    print("\n\n✅ Monitor stopped")
except Exception as e:
    print(f"\n❌ Error: {e}")
