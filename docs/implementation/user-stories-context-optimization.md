# User Stories & Tasks - Context Optimization Implementation

## 🏗️ **ARCHITECT ANALYSIS - Code Structure**

### **Current Architecture Analysis**

#### **File 1: `context_manager.py` (322 lines)**
- **Current Threshold**: `DEFAULT_TOKEN_THRESHOLD = 120000` (line 16)
- **Compression Logic**: Complex multi-stage compression (lines 191-241)
- **Message Handling**: Tool result, user, assistant message compression
- **Token Counting**: Uses `litellm.utils.token_counter`

#### **File 2: `tool_registry.py` (130 lines)**
- **Schema Generation**: `get_openapi_schemas()` returns ALL tools (lines 92-104)
- **No Filtering**: Currently no query-based tool selection
- **Tool Storage**: Simple dict storage with instance + schema

#### **File 3: `thread_manager.py` (505 lines)**
- **Tool Schema Call**: Line 329 - `self.tool_registry.get_openapi_schemas()`
- **Context Manager**: Lines 310-320 - conditional context compression
- **Message Preparation**: Lines 302-327 - message assembly logic

## 📋 **EPIC: Context Optimization for Cost Reduction**

### **Epic Goal**: Reduce token usage from 50k+ to 12k tokens (76% reduction) while maintaining 85%+ quality

---

## 🎯 **USER STORY 1: Simple Threshold Reduction**

### **As a** system administrator
### **I want** to reduce the default context threshold
### **So that** we can immediately reduce token costs by 70%

#### **Acceptance Criteria**:
- [ ] Default threshold reduced from 120k to 15k tokens
- [ ] System still functions normally for simple queries
- [ ] Token usage monitoring shows 70%+ reduction
- [ ] No breaking changes to existing functionality

#### **Tasks**:

##### **Task 1.1: Update Default Threshold**
- **File**: `backend/core/agentpress/context_manager.py`
- **Line**: 16
- **Change**: `DEFAULT_TOKEN_THRESHOLD = 15000`
- **Estimate**: 2 minutes
- **Risk**: Low

##### **Task 1.2: Add Threshold Monitoring**
- **File**: `backend/core/agentpress/context_manager.py`
- **Location**: After line 229
- **Add**: Logging for threshold usage
- **Estimate**: 10 minutes
- **Risk**: Low

```python
# Add after line 229
logger.info(f"Context threshold: {self.token_threshold}, Usage: {compressed_token_count}/{self.token_threshold} ({(compressed_token_count/self.token_threshold)*100:.1f}%)")
```

##### **Task 1.3: Test Threshold Change**
- **Create**: Test script to verify functionality
- **Test**: Simple queries still work
- **Verify**: Token reduction achieved
- **Estimate**: 15 minutes
- **Risk**: Low

---

## 🎯 **USER STORY 2: Smart Tool Selection**

### **As a** system user
### **I want** the system to only load relevant tools for my query
### **So that** tool schema overhead is minimized

#### **Acceptance Criteria**:
- [ ] Tool selection based on query keywords
- [ ] 60-80% reduction in tool schema tokens
- [ ] All necessary tools still available for queries
- [ ] Fallback to core tools for ambiguous queries

#### **Tasks**:

##### **Task 2.1: Add Query-Based Tool Selection**
- **File**: `backend/core/agentpress/tool_registry.py`
- **Location**: Add new method after line 104
- **Estimate**: 20 minutes
- **Risk**: Medium

```python
def get_relevant_tools(self, query_context: str = "") -> List[str]:
    """Get relevant tools based on query context."""
    query_lower = query_context.lower()
    
    # Core tools always included
    core_tools = [
        'str-replace-editor', 'save-file', 'view', 
        'interactive_feedback_MCP_Feedback_Enhanced'
    ]
    
    # Conditional tools based on keywords
    relevant_tools = core_tools.copy()
    
    # File operations
    if any(word in query_lower for word in ['file', 'code', 'edit', 'create', 'read', 'write']):
        relevant_tools.extend(['codebase-retrieval', 'diagnostics'])
    
    # Git operations
    if any(word in query_lower for word in ['git', 'commit', 'branch', 'merge']):
        relevant_tools.extend(['git_status_git', 'git_add_git', 'git_commit_git', 'git_log_git'])
    
    # Web operations
    if any(word in query_lower for word in ['web', 'search', 'url', 'fetch']):
        relevant_tools.extend(['web-search', 'web-fetch'])
    
    # Browser operations
    if any(word in query_lower for word in ['browser', 'chrome', 'navigate']):
        relevant_tools.extend(['chrome_navigate_chrome-browser', 'chrome_get_web_content_chrome-browser'])
    
    return relevant_tools
```

##### **Task 2.2: Update Schema Generation Method**
- **File**: `backend/core/agentpress/tool_registry.py`
- **Location**: Modify `get_openapi_schemas` method (lines 92-104)
- **Estimate**: 15 minutes
- **Risk**: Medium

```python
def get_openapi_schemas(self, query_context: str = "") -> List[Dict[str, Any]]:
    """Get OpenAPI schemas for function calling with optional filtering."""
    
    # If no query context, return all schemas (backward compatibility)
    if not query_context.strip():
        schemas = [
            tool_info['schema'].schema 
            for tool_info in self.tools.values()
            if tool_info['schema'].schema_type == SchemaType.OPENAPI
        ]
        return schemas
    
    # Get relevant tools for this query
    relevant_tools = self.get_relevant_tools(query_context)
    
    # Filter schemas to only relevant tools
    filtered_schemas = []
    for tool_name, tool_info in self.tools.items():
        if tool_info['schema'].schema_type == SchemaType.OPENAPI:
            # Check if this tool is relevant
            if any(relevant in tool_name for relevant in relevant_tools):
                filtered_schemas.append(tool_info['schema'].schema)
    
    logger.debug(f"Filtered tools: {len(filtered_schemas)}/{len(self.tools)} based on query: '{query_context[:50]}...'")
    return filtered_schemas
```

##### **Task 2.3: Update Thread Manager Call**
- **File**: `backend/core/agentpress/thread_manager.py`
- **Location**: Line 329
- **Change**: Pass query context to tool registry
- **Estimate**: 10 minutes
- **Risk**: Low

```python
# Replace line 329
# Get the latest user message for context
user_query = ""
if messages:
    for msg in reversed(messages):
        if isinstance(msg, dict) and msg.get('role') == 'user':
            user_query = str(msg.get('content', ''))
            break

openapi_tool_schemas = self.tool_registry.get_openapi_schemas(user_query) if config.native_tool_calling else None
```

---

## 🎯 **USER STORY 3: Enhanced Message Limiting**

### **As a** system user
### **I want** the system to intelligently limit conversation history
### **So that** context stays within optimal bounds

#### **Acceptance Criteria**:
- [ ] Keep only 8 most recent messages by default
- [ ] Always preserve system message
- [ ] Graceful degradation for long conversations
- [ ] Quality maintained for short-medium conversations

#### **Tasks**:

##### **Task 3.1: Add Smart Message Limiting**
- **File**: `backend/core/agentpress/context_manager.py`
- **Location**: Add new method after line 322
- **Estimate**: 25 minutes
- **Risk**: Medium

```python
def limit_messages_smart(self, messages: List[Dict[str, Any]], max_messages: int = 8) -> List[Dict[str, Any]]:
    """Intelligently limit messages while preserving important context."""
    if len(messages) <= max_messages:
        return messages
    
    # Separate system message from conversation
    system_message = None
    conversation_messages = messages
    
    if messages and isinstance(messages[0], dict) and messages[0].get('role') == 'system':
        system_message = messages[0]
        conversation_messages = messages[1:]
    
    # Keep the most recent messages
    if len(conversation_messages) > max_messages - (1 if system_message else 0):
        keep_count = max_messages - (1 if system_message else 0)
        conversation_messages = conversation_messages[-keep_count:]
    
    # Reconstruct message list
    result = []
    if system_message:
        result.append(system_message)
    result.extend(conversation_messages)
    
    logger.debug(f"Message limiting: {len(messages)} -> {len(result)} messages")
    return result
```

##### **Task 3.2: Integrate Message Limiting**
- **File**: `backend/core/agentpress/context_manager.py`
- **Location**: Modify `compress_messages` method (line 191)
- **Add**: Call to message limiting before compression
- **Estimate**: 10 minutes
- **Risk**: Low

```python
# Add at the beginning of compress_messages method (after line 217)
# Apply smart message limiting first
result = self.limit_messages_smart(messages, max_messages=8)
```

---

## 🎯 **USER STORY 4: Token Usage Monitoring**

### **As a** developer
### **I want** to monitor token usage in real-time
### **So that** I can track optimization effectiveness

#### **Acceptance Criteria**:
- [ ] Log token usage before and after optimization
- [ ] Track tool schema token count
- [ ] Monitor context utilization ratio
- [ ] Alert on unusual token usage patterns

#### **Tasks**:

##### **Task 4.1: Add Token Tracking**
- **File**: `backend/core/services/llm.py`
- **Location**: In `prepare_params` method
- **Add**: Token counting and logging
- **Estimate**: 15 minutes
- **Risk**: Low

##### **Task 4.2: Add Context Utilization Monitoring**
- **File**: `backend/core/agentpress/context_manager.py`
- **Location**: In `compress_messages` method
- **Add**: CWU calculation and logging
- **Estimate**: 10 minutes
- **Risk**: Low

```python
# Add after token counting
context_window = model_manager.get_context_window(llm_model)
cwu_ratio = compressed_token_count / context_window if context_window > 0 else 0
logger.info(f"Context Window Utilization: {cwu_ratio:.2%} ({compressed_token_count}/{context_window})")

if cwu_ratio > 0.7:
    logger.warning(f"High CWU detected: {cwu_ratio:.2%} - consider further optimization")
```

---

## 🎯 **USER STORY 5: Quality Monitoring & Rollback**

### **As a** system administrator
### **I want** to monitor quality impact of optimizations
### **So that** I can rollback if quality degrades significantly

#### **Acceptance Criteria**:
- [ ] Track conversation length vs quality
- [ ] Monitor user satisfaction indicators
- [ ] Automatic rollback triggers
- [ ] A/B testing capability

#### **Tasks**:

##### **Task 5.1: Add Quality Metrics Collection**
- **File**: Create `backend/core/monitoring/quality_monitor.py`
- **Estimate**: 30 minutes
- **Risk**: Low

##### **Task 5.2: Integrate Quality Monitoring**
- **File**: `backend/core/agentpress/thread_manager.py`
- **Location**: In `run_thread` method
- **Add**: Quality tracking calls
- **Estimate**: 15 minutes
- **Risk**: Low

---

## 📊 **IMPLEMENTATION TIMELINE**

### **Sprint 1 (Day 1-2): Core Optimization**
- [ ] Task 1.1: Update default threshold (2 min)
- [ ] Task 1.2: Add threshold monitoring (10 min)
- [ ] Task 1.3: Test threshold change (15 min)
- [ ] Task 3.1: Add smart message limiting (25 min)
- [ ] Task 3.2: Integrate message limiting (10 min)

**Total**: ~1 hour, **Expected Result**: 50-60% token reduction

### **Sprint 2 (Day 3-4): Smart Tool Selection**
- [ ] Task 2.1: Add query-based tool selection (20 min)
- [ ] Task 2.2: Update schema generation (15 min)
- [ ] Task 2.3: Update thread manager call (10 min)

**Total**: ~45 minutes, **Expected Result**: Additional 15-20% token reduction

### **Sprint 3 (Day 5-7): Monitoring & Quality**
- [ ] Task 4.1: Add token tracking (15 min)
- [ ] Task 4.2: Add CWU monitoring (10 min)
- [ ] Task 5.1: Quality metrics collection (30 min)
- [ ] Task 5.2: Integrate quality monitoring (15 min)

**Total**: ~1 hour, **Expected Result**: Full monitoring & rollback capability

## 🔧 **DETAILED IMPLEMENTATION GUIDE**

### **Phase 1: Immediate Implementation (30 minutes)**

#### **Step 1: Update Context Threshold**
```bash
# File: backend/core/agentpress/context_manager.py
# Line 16: Change DEFAULT_TOKEN_THRESHOLD = 120000 to:
DEFAULT_TOKEN_THRESHOLD = 15000
```

#### **Step 2: Add Basic Message Limiting**
```python
# Add to context_manager.py after line 322
def limit_recent_messages(self, messages: List[Dict[str, Any]], max_count: int = 8) -> List[Dict[str, Any]]:
    """Keep only the most recent messages plus system message."""
    if len(messages) <= max_count:
        return messages

    # Always keep system message if present
    system_msg = messages[0] if messages and messages[0].get('role') == 'system' else None
    other_messages = messages[1:] if system_msg else messages

    # Keep most recent messages
    recent_messages = other_messages[-(max_count-1):] if system_msg else other_messages[-max_count:]

    result = ([system_msg] + recent_messages) if system_msg else recent_messages
    return result
```

#### **Step 3: Integrate Message Limiting**
```python
# In compress_messages method (line 218), add after line 219:
result = self.limit_recent_messages(messages, max_count=8)
```

### **Phase 2: Smart Tool Selection (20 minutes)**

#### **Step 4: Add Tool Filtering**
```python
# Add to tool_registry.py after line 104
def get_filtered_schemas(self, query: str = "") -> List[Dict[str, Any]]:
    """Get filtered tool schemas based on query keywords."""
    if not query.strip():
        return self.get_openapi_schemas()

    query_lower = query.lower()

    # Define tool categories
    tool_categories = {
        'file_ops': ['str-replace-editor', 'save-file', 'view', 'codebase-retrieval'],
        'git_ops': ['git_status_git', 'git_add_git', 'git_commit_git'],
        'web_ops': ['web-search', 'web-fetch'],
        'browser_ops': ['chrome_navigate_chrome-browser', 'chrome_get_web_content_chrome-browser'],
        'core': ['interactive_feedback_MCP_Feedback_Enhanced']
    }

    # Always include core tools
    relevant_tools = tool_categories['core'].copy()

    # Add category-specific tools based on query
    if any(word in query_lower for word in ['file', 'code', 'edit']):
        relevant_tools.extend(tool_categories['file_ops'])
    if any(word in query_lower for word in ['git', 'commit']):
        relevant_tools.extend(tool_categories['git_ops'])
    if any(word in query_lower for word in ['web', 'search']):
        relevant_tools.extend(tool_categories['web_ops'])
    if any(word in query_lower for word in ['browser', 'chrome']):
        relevant_tools.extend(tool_categories['browser_ops'])

    # Filter schemas
    filtered = []
    for tool_name, tool_info in self.tools.items():
        if any(relevant in tool_name for relevant in relevant_tools):
            if tool_info['schema'].schema_type == SchemaType.OPENAPI:
                filtered.append(tool_info['schema'].schema)

    return filtered
```

#### **Step 5: Update Thread Manager**
```python
# In thread_manager.py, replace line 329:
# Get user query for tool filtering
user_query = ""
if messages:
    for msg in reversed(messages):
        if isinstance(msg, dict) and msg.get('role') == 'user':
            user_query = str(msg.get('content', ''))[:200]  # First 200 chars
            break

openapi_tool_schemas = self.tool_registry.get_filtered_schemas(user_query) if config.native_tool_calling else None
```

### **Phase 3: Monitoring (15 minutes)**

#### **Step 6: Add Token Monitoring**
```python
# Add to context_manager.py in compress_messages method after line 229:
# Calculate and log optimization metrics
reduction_ratio = ((uncompressed_total_token_count - compressed_token_count) / uncompressed_total_token_count * 100) if uncompressed_total_token_count > 0 else 0
context_window = model_manager.get_context_window(llm_model)
cwu_ratio = (compressed_token_count / context_window * 100) if context_window > 0 else 0

logger.info(f"Token optimization: {reduction_ratio:.1f}% reduction, CWU: {cwu_ratio:.1f}%")

# Alert if CWU is too high
if cwu_ratio > 70:
    logger.warning(f"High context utilization: {cwu_ratio:.1f}% - consider further optimization")
```

## 🎯 **SUCCESS METRICS**

### **Primary KPIs**:
- **Token Reduction**: 70-80% (50k → 10-15k tokens)
- **Cost Savings**: 70-80% ($0.50 → $0.10-0.15 per request)
- **Quality Retention**: 85%+ (measured by task completion)
- **Implementation Time**: <3 hours total

### **Secondary KPIs**:
- **Context Window Utilization**: 60-70% optimal range
- **Tool Schema Efficiency**: 60-80% reduction in tool tokens
- **Message History Efficiency**: 80%+ reduction in history tokens
- **System Stability**: No breaking changes or errors

## 🚨 **RISK MITIGATION**

### **High Risk Items**:
1. **Tool Selection Logic** - May miss required tools
   - **Mitigation**: Comprehensive keyword mapping + fallback to core tools
2. **Message Limiting** - May lose important context
   - **Mitigation**: Smart preservation of system messages + recent context
3. **Quality Degradation** - User experience may suffer
   - **Mitigation**: Quality monitoring + automatic rollback triggers

### **Rollback Plan**:
1. Revert `DEFAULT_TOKEN_THRESHOLD` to 120000
2. Disable query-based tool filtering
3. Remove message limiting
4. Monitor recovery metrics

---

**Total Implementation Effort**: ~3 hours
**Expected ROI**: 70-80% cost reduction
**Risk Level**: Low-Medium with proper testing
