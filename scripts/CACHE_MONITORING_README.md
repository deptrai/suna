# Cache Performance Monitoring

## Overview

This directory contains tools for monitoring prompt caching performance in the AgentPress system.

**Phase 1 Task 1.1.3** - Cache Performance Dashboard

---

## Tools

### 1. `monitor_cache_performance.py`

Analyzes backend logs to extract and report cache performance metrics.

**Features:**
- Parse cache events from logs
- Calculate hit rate, token savings, cost savings
- Display block usage distribution
- Export metrics to JSON
- Filter by date range
- Performance recommendations

**Usage:**

```bash
# Basic usage
python scripts/monitor_cache_performance.py

# Analyze last 7 days
python scripts/monitor_cache_performance.py --days 7

# Export to JSON
python scripts/monitor_cache_performance.py --export cache_report.json

# Custom log file
python scripts/monitor_cache_performance.py --log-file /path/to/logs/backend.log
```

**Output Example:**

```
================================================================================
CACHE PERFORMANCE REPORT
================================================================================

📊 OVERVIEW
  Total Events:     1,250
  Cache Hits:       1,050
  Cache Misses:     200
  Hit Rate:         84.0%
  Status:           ✅ EXCELLENT (>80%)

💾 TOKEN SAVINGS
  Total Tokens Saved:     52,500,000
  Avg Tokens per Hit:     50,000

💰 COST SAVINGS
  Original Cost:          $157.50
  Cached Cost:            $15.75
  Savings:                $141.75
  Savings Percent:        90.0%

🔥 CACHE BLOCKS USAGE
  Block 1:  1,050 hits (100.0%) ██████████████████████████████████████████████████
  Block 2:  850 hits (81.0%) ████████████████████████████████████████████
  Block 3:  650 hits (61.9%) ██████████████████████████████████

💡 RECOMMENDATIONS
  ✅ Cache performance is excellent!
     - Continue monitoring for consistency
     - Consider Phase 2 optimizations

================================================================================
```

---

## Metrics Explained

### Hit Rate
- **Excellent (>80%)**: Cache is working optimally
- **Good (60-80%)**: Cache is working well
- **Fair (40-60%)**: Cache needs improvement
- **Poor (<40%)**: Cache is not working properly

### Token Savings
- Total tokens that were cached instead of sent as input
- Higher is better
- Typical: 50,000-100,000 tokens per cache hit

### Cost Savings
- Based on Anthropic pricing:
  - Input tokens: $3.00 per million
  - Cache read: $0.30 per million (90% savings)
- Savings = (Original Cost - Cached Cost)

### Block Usage
- Anthropic supports up to 4 cache blocks
- Block 1: System prompt (always cached if >1024 tokens)
- Blocks 2-4: Conversation chunks
- Distribution shows which blocks are most used

---

## Troubleshooting

### No Cache Events Found

**Possible causes:**
1. No messages have been sent recently
2. System prompt is too small (<1024 tokens)
3. Model is not Anthropic (claude-*)
4. Caching is disabled (`enable_prompt_caching=False`)

**Solutions:**
1. Send test messages through the API
2. Check system prompt size in logs
3. Verify model is `claude-sonnet-4` or similar
4. Check `thread_manager.py` line 235 for `enable_prompt_caching=True`

### Low Hit Rate (<70%)

**Possible causes:**
1. System prompts vary too much (cache invalidation)
2. Conversations are too short (<1024 tokens)
3. Model doesn't support caching

**Solutions:**
1. Use consistent system prompts
2. Ensure conversations have enough context
3. Verify Anthropic model is being used

### High Cache Misses

**Possible causes:**
1. Many short conversations
2. System prompts below 1024 tokens
3. Frequent prompt changes

**Solutions:**
1. Batch short conversations
2. Increase system prompt size (if appropriate)
3. Stabilize system prompt content

---

## Integration with GlitchTip

Cache metrics are also logged to GlitchTip for real-time monitoring.

**GlitchTip Event:**
```
Message: "Prompt Cache Metrics: 3/4 blocks, 3 breakpoints, 85.0% hit rate"

Context:
{
  "cache_metrics": {
    "blocks_used": 3,
    "max_blocks": 4,
    "system_tokens": 5000,
    "conversation_tokens": 15000,
    "total_tokens": 20000,
    "cache_breakpoints": 3,
    "total_messages": 25,
    "cache_hit_rate_percent": 85.0,
    "estimated_savings_percent": 76.5,
    "model": "claude-sonnet-4",
    "timestamp": "2025-10-01T..."
  }
}
```

**To view in GlitchTip:**
1. Go to GlitchTip dashboard
2. Search for "Prompt Cache Metrics"
3. Filter by date range
4. View context for detailed metrics

---

## Automation

### Cron Job (Daily Report)

Add to crontab:
```bash
# Daily cache performance report at 9 AM
0 9 * * * cd /path/to/suna && python3 scripts/monitor_cache_performance.py --days 1 --export /path/to/reports/cache_$(date +\%Y\%m\%d).json
```

### Slack/Email Alerts

Create wrapper script:
```bash
#!/bin/bash
# scripts/cache_alert.sh

REPORT=$(python3 scripts/monitor_cache_performance.py --days 1)
HIT_RATE=$(echo "$REPORT" | grep "Hit Rate:" | awk '{print $3}' | tr -d '%')

if (( $(echo "$HIT_RATE < 70" | bc -l) )); then
    # Send alert
    curl -X POST https://hooks.slack.com/... \
        -d "{\"text\": \"⚠️ Cache hit rate is low: ${HIT_RATE}%\"}"
fi
```

---

## Next Steps

After validating cache performance:

1. **Phase 1 Task 1.2.1**: Fix over-aggressive optimization
2. **Phase 1 Task 1.2.2**: Create tool calling test suite
3. **Phase 2**: Implement moderate compression (30-50% reduction)
4. **Phase 3**: Implement dynamic loading (80-95% reduction)

---

## Support

For issues or questions:
1. Check logs: `logs/backend.log`
2. Review GlitchTip events
3. Run dashboard: `python scripts/monitor_cache_performance.py`
4. Check documentation: `docs/stories/prompt-optimization-stories.md`

---

**Created:** 2025-10-01  
**Phase:** 1 Task 1.1.3  
**Status:** ✅ COMPLETE

