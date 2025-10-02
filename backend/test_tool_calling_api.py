"""
Monitor logs for tool calling test.
"""
import subprocess
import time

def monitor_logs():
    """Monitor worker logs for tool calling activity"""

    print("🔍 Monitoring worker logs for tool calling activity...")
    print("📝 Please send this message in the UI:")
    print("   'Hãy dùng web_search tool để tìm kiếm thông tin về PancakeSwap và CAKE token'")
    print()
    print("⏳ Waiting for activity (press Ctrl+C to stop)...")
    print()

    try:
        # Monitor logs in real-time
        process = subprocess.Popen(
            ["tail", "-f", "../logs/worker.log"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        for line in process.stdout:
            # Filter for relevant log lines
            if any(keyword in line for keyword in [
                "🧭 Dynamic routing",
                "🔧 Context Modification",
                "🔧 XML Removal",
                "tool_calls",
                "Dynamic routing failed",
                "ERROR",
                "web_search"
            ]):
                print(line.strip())

    except KeyboardInterrupt:
        print("\n\n✅ Monitoring stopped")
        process.kill()

if __name__ == "__main__":
    monitor_logs()

