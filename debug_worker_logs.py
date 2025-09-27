#!/usr/bin/env python3
"""
Debug worker logs to find the exact issue.
"""

import subprocess
import time

def check_worker_logs():
    """Check worker logs for errors."""
    
    print("🔍 Checking worker logs...")
    
    try:
        # Get recent logs
        result = subprocess.run(
            ["tail", "-100", "/tmp/worker.log"],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            logs = result.stdout
            print("📋 Recent Worker Logs:")
            print("=" * 80)
            print(logs)
            print("=" * 80)
            
            # Look for specific errors
            if "litellm.InternalServerError" in logs:
                print("\n❌ Found LiteLLM InternalServerError in logs")
            if "v98store" in logs:
                print("\n🔍 Found v98store references in logs")
            if "openai-compatible" in logs:
                print("\n🔍 Found openai-compatible references in logs")
            if "gpt-4o" in logs:
                print("\n🔍 Found gpt-4o references in logs")
                
        else:
            print(f"❌ Error reading logs: {result.stderr}")
            
    except subprocess.TimeoutExpired:
        print("⏰ Timeout reading logs")
    except Exception as e:
        print(f"❌ Exception: {e}")

def check_worker_status():
    """Check if worker is running."""
    
    print("\n🔍 Checking worker status...")
    
    try:
        result = subprocess.run(
            ["pgrep", "-f", "dramatiq.*run_agent_background"],
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            pids = result.stdout.strip().split('\n')
            print(f"✅ Worker running with PIDs: {pids}")
        else:
            print("❌ Worker not running")
            
    except Exception as e:
        print(f"❌ Exception checking worker: {e}")

if __name__ == "__main__":
    print("🚀 Worker Debug")
    print("=" * 60)
    
    check_worker_status()
    check_worker_logs()
    
    print("\n✅ Debug completed!")
