# 🐛 Dynamic Routing Debug Report

**Date:** 2025-10-01  
**Issue:** Dynamic routing failing with AttributeError  
**Status:** Root cause identified, fix ready

---

## 1. ERROR ANALYSIS

### Error Message
```
2025-10-01T06:13:02.784081Z [warning] Dynamic routing failed, using original prompt: 
'ThreadManager' object has no attribute 'get_messages'
```

### Location
**File:** `backend/core/agentpress/thread_manager.py`  
**Line:** 282  
**Code:**
```python
messages_for_routing = await self.get_messages(thread_id)
```

### Root Cause
**Method name is incorrect!**
- ❌ Called: `self.get_messages(thread_id)`
- ✅ Should be: `self.get_llm_messages(thread_id)`

---

## 2. CODE FLOW ANALYSIS

### Dynamic Routing Logic (Lines 267-309)

```python
# Phase 3 Task 3.1.2: Dynamic Prompt Routing
use_dynamic_routing = True  # Feature flag

if use_dynamic_routing:
    try:
        from core.prompts.router import get_router
        from core.prompts.module_manager import get_prompt_builder

        # Get user query for routing
        user_query = ""
        if temporary_message:
            # Case 1: New message being sent
            user_query = temporary_message.get('content', '')
        else:
            # Case 2: Existing thread, fetch from DB
            messages_for_routing = await self.get_messages(thread_id)  # ❌ BUG HERE
            for msg in reversed(messages_for_routing):
                if isinstance(msg, dict) and msg.get('role') == 'user':
                    user_query = str(msg.get('content', ''))
                    break

        if user_query:
            # Route to appropriate modules
            router = get_router()
            modules_needed = router.route(user_query)

            # Build modular prompt
            builder = get_prompt_builder()
            modular_prompt_content = builder.build_prompt(modules_needed)

            # Replace system prompt with modular version
            system_prompt = {
                "role": "system",
                "content": modular_prompt_content
            }

            logger.info(f"🧭 Dynamic routing applied: {len(modules_needed)} modules, {len(modular_prompt_content)} chars")
        else:
            logger.debug("🧭 No user query found, using original system prompt")

    except Exception as e:
        logger.warning(f"Dynamic routing failed, using original prompt: {e}")
```

### Available Methods in ThreadManager

**Correct method signature (Line 175):**
```python
async def get_llm_messages(self, thread_id: str) -> List[Dict[str, Any]]:
    """Get all messages for a thread."""
    logger.debug(f"Getting messages for thread {thread_id}")
    client = await self.db.client
    
    # Fetches messages from Supabase
    # Returns list of message dicts with 'role' and 'content'
```

---

## 3. IMPACT ANALYSIS

### Current Behavior
1. ✅ **Chat works** - Fallback to original prompt
2. ❌ **Dynamic routing fails** - Exception caught
3. ❌ **No cost savings** - Using full 260,990 char prompt
4. ❌ **No modular benefits** - Not loading selective modules

### Expected Behavior (After Fix)
1. ✅ **Chat works** - Same functionality
2. ✅ **Dynamic routing succeeds** - Correct method called
3. ✅ **Cost savings active** - 21.1% reduction (from A/B test)
4. ✅ **Modular loading** - Only necessary modules loaded

---

## 4. FIX IMPLEMENTATION

### Change Required

**File:** `backend/core/agentpress/thread_manager.py`  
**Line:** 282

**Before:**
```python
messages_for_routing = await self.get_messages(thread_id)
```

**After:**
```python
messages_for_routing = await self.get_llm_messages(thread_id)
```

### Verification Steps

1. **Fix the code** ✅
2. **Restart worker** - `./scripts/restart-worker.sh`
3. **Restart backend** - Restart uvicorn
4. **Test with Playwright** - Send test message
5. **Check logs** - Look for "🧭 Dynamic routing applied"
6. **Verify cost savings** - Check prompt size in logs

---

## 5. ADDITIONAL CHECKS

### Potential Edge Cases to Test

1. **New message (temporary_message exists)**
   - Should use `temporary_message.get('content', '')`
   - No DB fetch needed
   - ✅ This path works (no bug)

2. **Existing thread (no temporary_message)**
   - Should fetch from DB using `get_llm_messages`
   - ❌ This path has the bug
   - Need to fix and test

3. **Empty query**
   - If no user query found, should use original prompt
   - ✅ Handled by `if user_query:` check

4. **Router failure**
   - If router.route() fails, should catch exception
   - ✅ Handled by try/except block

### Log Messages to Look For

**Success indicators:**
```
🧭 Dynamic routing applied: 4 modules, 45000 chars
📊 Request logged to GlitchTip: 45000 chars, 1 tools
```

**Failure indicators:**
```
Dynamic routing failed, using original prompt: ...
📊 Request logged to GlitchTip: 260990 chars, 1 tools
```

---

## 6. TESTING PLAN

### Test Case 1: Simple Greeting
**Input:** "xin chào"  
**Expected:**
- No specific keywords matched
- All tool modules included (fallback)
- Prompt size: ~103,000 chars (all modules)

### Test Case 2: File Operation
**Input:** "create a new file called test.txt"  
**Expected:**
- TOOL_TOOLKIT module matched (keyword: "file", "create")
- Prompt size: ~40,000 chars (core + toolkit)

### Test Case 3: Data Processing
**Input:** "parse this CSV data"  
**Expected:**
- TOOL_DATA_PROCESSING module matched (keyword: "parse", "csv", "data")
- Prompt size: ~35,000 chars (core + data_processing)

---

## 7. ROLLBACK PLAN

If fix causes issues:

1. **Disable dynamic routing:**
   ```python
   use_dynamic_routing = False  # Line 269
   ```

2. **Restart services:**
   ```bash
   ./scripts/restart-worker.sh
   # Restart uvicorn
   ```

3. **Verify fallback:**
   - Should use original 260,990 char prompt
   - All functionality preserved

---

## 8. SUMMARY

### Root Cause
- ❌ Wrong method name: `get_messages` → `get_llm_messages`
- 📍 Location: `thread_manager.py:282`
- 🎯 Impact: Dynamic routing completely disabled

### Fix
- ✅ One-line change
- ✅ Low risk (method exists and works)
- ✅ Preserves all functionality

### Expected Result
- ✅ Dynamic routing works
- ✅ 21.1% cost reduction active
- ✅ Modular prompt loading functional
- ✅ All tests pass

---

**Ready to implement fix!** 🚀

