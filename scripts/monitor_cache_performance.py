#!/usr/bin/env python3
"""
Monitor cache performance from logs
Phase 1 Task 1.1.3

Usage:
    python scripts/monitor_cache_performance.py
    python scripts/monitor_cache_performance.py --log-file logs/backend.log
    python scripts/monitor_cache_performance.py --days 7
"""
import re
import argparse
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Tuple

class CachePerformanceMonitor:
    """Monitor and analyze cache performance from logs"""
    
    def __init__(self, log_file: str = "logs/backend.log"):
        self.log_file = Path(log_file)
        self.cache_hits = 0
        self.cache_misses = 0
        self.total_tokens_saved = 0
        self.blocks_usage = defaultdict(int)  # Track blocks used distribution
        self.cache_events = []  # Store all cache events for analysis
        
    def parse_logs(self, days: int = None) -> None:
        """Parse logs and extract cache metrics"""
        
        if not self.log_file.exists():
            print(f"❌ Log file not found: {self.log_file}")
            return
        
        print(f"📖 Reading logs from: {self.log_file}")
        
        # Calculate cutoff date if days specified
        cutoff_date = None
        if days:
            cutoff_date = datetime.now() - timedelta(days=days)
            print(f"📅 Filtering logs from last {days} days (since {cutoff_date.strftime('%Y-%m-%d')})")
        
        with open(self.log_file) as f:
            for line in f:
                # Parse timestamp
                timestamp_match = re.match(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})', line)
                if timestamp_match and cutoff_date:
                    log_time = datetime.fromisoformat(timestamp_match.group(1))
                    if log_time < cutoff_date:
                        continue
                
                # Look for cache hit logs
                if "🔥 Block" in line:
                    self.cache_hits += 1
                    
                    # Extract tokens saved
                    tokens_match = re.search(r'\((\d+) tokens\)', line)
                    if tokens_match:
                        tokens = int(tokens_match.group(1))
                        self.total_tokens_saved += tokens
                    
                    # Extract block number
                    block_match = re.search(r'Block (\d+)', line)
                    if block_match:
                        block_num = int(block_match.group(1))
                        self.blocks_usage[block_num] += 1
                    
                    # Store event
                    self.cache_events.append({
                        'type': 'hit',
                        'tokens': tokens if tokens_match else 0,
                        'block': block_num if block_match else 0,
                        'timestamp': timestamp_match.group(1) if timestamp_match else None
                    })
                
                # Look for cache miss logs
                elif "System prompt too small for caching" in line or "Conversation too small for caching" in line:
                    self.cache_misses += 1
                    
                    # Store event
                    self.cache_events.append({
                        'type': 'miss',
                        'reason': 'too_small',
                        'timestamp': timestamp_match.group(1) if timestamp_match else None
                    })
    
    def calculate_metrics(self) -> Dict:
        """Calculate performance metrics"""
        
        total_events = self.cache_hits + self.cache_misses
        hit_rate = (self.cache_hits / total_events * 100) if total_events > 0 else 0
        
        # Estimate cost savings
        # Anthropic pricing: $3/M input tokens, cache read $0.30/M (90% savings)
        cost_per_million = 3.0
        cache_cost_per_million = 0.30
        
        original_cost = (self.total_tokens_saved / 1_000_000) * cost_per_million
        cached_cost = (self.total_tokens_saved / 1_000_000) * cache_cost_per_million
        savings = original_cost - cached_cost
        savings_percent = ((original_cost - cached_cost) / original_cost * 100) if original_cost > 0 else 0
        
        # Calculate average tokens per cache hit
        avg_tokens_per_hit = self.total_tokens_saved / self.cache_hits if self.cache_hits > 0 else 0
        
        return {
            'total_events': total_events,
            'cache_hits': self.cache_hits,
            'cache_misses': self.cache_misses,
            'hit_rate': hit_rate,
            'total_tokens_saved': self.total_tokens_saved,
            'avg_tokens_per_hit': avg_tokens_per_hit,
            'original_cost': original_cost,
            'cached_cost': cached_cost,
            'savings': savings,
            'savings_percent': savings_percent,
            'blocks_usage': dict(self.blocks_usage)
        }
    
    def display_report(self, metrics: Dict) -> None:
        """Display performance report"""
        
        print("\n" + "=" * 80)
        print("CACHE PERFORMANCE REPORT")
        print("=" * 80)
        
        # Overview
        print("\n📊 OVERVIEW")
        print(f"  Total Events:     {metrics['total_events']:,}")
        print(f"  Cache Hits:       {metrics['cache_hits']:,}")
        print(f"  Cache Misses:     {metrics['cache_misses']:,}")
        print(f"  Hit Rate:         {metrics['hit_rate']:.1f}%")
        
        # Performance indicator
        if metrics['hit_rate'] >= 80:
            print(f"  Status:           ✅ EXCELLENT (>80%)")
        elif metrics['hit_rate'] >= 60:
            print(f"  Status:           ✅ GOOD (60-80%)")
        elif metrics['hit_rate'] >= 40:
            print(f"  Status:           ⚠️  FAIR (40-60%)")
        else:
            print(f"  Status:           ❌ POOR (<40%)")
        
        # Token savings
        print("\n💾 TOKEN SAVINGS")
        print(f"  Total Tokens Saved:     {metrics['total_tokens_saved']:,}")
        print(f"  Avg Tokens per Hit:     {metrics['avg_tokens_per_hit']:,.0f}")
        
        # Cost savings
        print("\n💰 COST SAVINGS")
        print(f"  Original Cost:          ${metrics['original_cost']:.2f}")
        print(f"  Cached Cost:            ${metrics['cached_cost']:.2f}")
        print(f"  Savings:                ${metrics['savings']:.2f}")
        print(f"  Savings Percent:        {metrics['savings_percent']:.1f}%")
        
        # Block usage distribution
        if metrics['blocks_usage']:
            print("\n🔥 CACHE BLOCKS USAGE")
            for block_num in sorted(metrics['blocks_usage'].keys()):
                count = metrics['blocks_usage'][block_num]
                percent = (count / metrics['cache_hits'] * 100) if metrics['cache_hits'] > 0 else 0
                bar = "█" * int(percent / 2)  # Scale to 50 chars max
                print(f"  Block {block_num}:  {count:,} hits ({percent:.1f}%) {bar}")
        
        # Recommendations
        print("\n💡 RECOMMENDATIONS")
        if metrics['hit_rate'] < 70:
            print("  ⚠️  Cache hit rate is below 70%")
            print("     - Check if system prompts are >1024 tokens")
            print("     - Verify model is Anthropic (claude-*)")
            print("     - Review enable_prompt_caching parameter")
        elif metrics['hit_rate'] >= 80:
            print("  ✅ Cache performance is excellent!")
            print("     - Continue monitoring for consistency")
            print("     - Consider Phase 2 optimizations")
        else:
            print("  ✅ Cache performance is good")
            print("     - Monitor for improvements")
        
        print("\n" + "=" * 80)
    
    def export_metrics(self, output_file: str = "cache_metrics.json") -> None:
        """Export metrics to JSON file"""
        import json
        
        metrics = self.calculate_metrics()
        metrics['cache_events'] = self.cache_events
        metrics['generated_at'] = datetime.now().isoformat()
        
        with open(output_file, 'w') as f:
            json.dump(metrics, f, indent=2)
        
        print(f"\n📄 Metrics exported to: {output_file}")

def main():
    """Main function"""
    parser = argparse.ArgumentParser(
        description="Monitor cache performance from logs",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/monitor_cache_performance.py
  python scripts/monitor_cache_performance.py --log-file logs/backend.log
  python scripts/monitor_cache_performance.py --days 7
  python scripts/monitor_cache_performance.py --export cache_report.json
        """
    )
    
    parser.add_argument(
        '--log-file',
        default='logs/backend.log',
        help='Path to log file (default: logs/backend.log)'
    )
    
    parser.add_argument(
        '--days',
        type=int,
        help='Only analyze logs from last N days'
    )
    
    parser.add_argument(
        '--export',
        metavar='FILE',
        help='Export metrics to JSON file'
    )
    
    args = parser.parse_args()
    
    # Create monitor
    monitor = CachePerformanceMonitor(args.log_file)
    
    # Parse logs
    monitor.parse_logs(days=args.days)
    
    # Calculate and display metrics
    metrics = monitor.calculate_metrics()
    monitor.display_report(metrics)
    
    # Export if requested
    if args.export:
        monitor.export_metrics(args.export)

if __name__ == "__main__":
    main()

