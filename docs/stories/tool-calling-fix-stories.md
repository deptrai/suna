# Tool Calling Fix - User Stories & Tasks

## Epic: Fix Tool Calling with Context-Aware Prompt Building

**Status:** 🚧 In Progress  
**Priority:** P0 (Critical)  
**Estimated Effort:** 2-3 hours  
**Assignee:** Development Team  

### Epic Description

Implement conditional prompt building that removes XML tool calling examples when using native tool calling mode. This fixes the bug where LLM refuses to call tools because system prompt shows XML format while API expects JSON format.

**Root Cause:** System prompt contains XML `<function_calls>` examples that conflict with native JSON tool calling, causing LLM to think it doesn't have access to tools.

**Solution:** Implement Option 3 (Conditional Building) - Dynamically modify prompt content based on `native_tool_calling` flag.

---

## Story 1: Implement Context-Aware Prompt Building

**ID:** TOOL-001  
**Priority:** P0  
**Effort:** 1.5 hours  
**Dependencies:** None  

### Description

As a developer, I want the ModularPromptBuilder to accept context parameters and dynamically modify prompt content based on tool calling mode, so that the system prompt matches the actual tool calling format being used.

### Acceptance Criteria

- [ ] `build_prompt()` accepts optional `context` parameter
- [ ] Context includes `native_tool_calling` boolean flag
- [ ] When `native_tool_calling=True`, XML examples are removed from toolkit module
- [ ] When `native_tool_calling=False`, XML examples are kept
- [ ] Original prompt content is never modified (only in-memory transformation)
- [ ] Logging shows which mode is active

### Technical Requirements

**Files to Modify:**
1. `backend/core/prompts/module_manager.py`
2. `backend/core/agentpress/thread_manager.py`

**New Methods:**
1. `ModularPromptBuilder._modify_toolkit_content(content, context)`
2. `ModularPromptBuilder._remove_xml_examples(content)`

---

### Task 1.1: Add Context Parameter to build_prompt()

**Effort:** 15 minutes  
**File:** `backend/core/prompts/module_manager.py`

**Implementation:**
```python
def build_prompt(
    self, 
    modules_needed: Optional[List[PromptModule]] = None,
    context: Optional[dict] = None  # NEW PARAMETER
) -> str:
    """
    Build prompt from modules with context-aware modifications.
    
    Args:
        modules_needed: List of modules to include
        context: Optional context for dynamic content
            - native_tool_calling: bool - Whether using native tool calling
            - user_query: str - Current user query
    
    Returns:
        Combined prompt string
    """
    parts = []
    modules_used = []
    
    # Always load core and response modules
    for module in PromptModule:
        if module in self.modules and self.modules[module].always_load:
            content = self.modules[module].content
            
            # Apply context-aware modifications
            if context:
                content = self._apply_context_modifications(module, content, context)
            
            parts.append(content)
            modules_used.append(module.value)
    
    # Load conditional modules if specified
    if modules_needed:
        for module in modules_needed:
            if module in self.modules and not self.modules[module].always_load:
                content = self.modules[module].content
                
                # Apply context-aware modifications
                if context:
                    content = self._apply_context_modifications(module, content, context)
                
                parts.append(content)
                modules_used.append(module.value)
    
    # ... rest of method
```

**Testing:**
- [ ] Call with context=None → Works as before
- [ ] Call with context={'native_tool_calling': True} → No errors
- [ ] Call with context={'native_tool_calling': False} → No errors

---

### Task 1.2: Implement _apply_context_modifications()

**Effort:** 20 minutes  
**File:** `backend/core/prompts/module_manager.py`

**Implementation:**
```python
def _apply_context_modifications(
    self, 
    module: PromptModule, 
    content: str, 
    context: dict
) -> str:
    """
    Apply context-aware modifications to module content.
    
    Args:
        module: The module being processed
        content: Original module content
        context: Context dictionary
    
    Returns:
        Modified content
    """
    # Only modify toolkit module based on tool calling mode
    if module == PromptModule.TOOL_TOOLKIT:
        native_tool_calling = context.get('native_tool_calling', True)
        
        if native_tool_calling:
            # Remove XML examples for native tool calling
            content = self._remove_xml_examples(content)
            logger.debug(f"🔧 Removed XML examples from {module.value} (native mode)")
        else:
            logger.debug(f"🔧 Kept XML examples in {module.value} (XML mode)")
    
    return content
```

**Testing:**
- [ ] TOOL_TOOLKIT with native=True → XML removed
- [ ] TOOL_TOOLKIT with native=False → XML kept
- [ ] Other modules → No changes
- [ ] Logging shows correct mode

---

### Task 1.3: Implement _remove_xml_examples()

**Effort:** 30 minutes  
**File:** `backend/core/prompts/module_manager.py`

**Implementation:**
```python
def _remove_xml_examples(self, content: str) -> str:
    """
    Remove XML tool calling examples from content.
    
    This removes:
    1. <function_calls>...</function_calls> blocks
    2. Example sections with XML syntax
    3. XML-specific instructions
    
    Args:
        content: Original content
    
    Returns:
        Content with XML examples removed
    """
    import re
    
    # Pattern 1: Remove complete <function_calls> blocks
    # Matches: <function_calls>...(any content including newlines)...</function_calls>
    pattern1 = r'<function_calls>.*?</function_calls>'
    content = re.sub(pattern1, '', content, flags=re.DOTALL)
    
    # Pattern 2: Remove "Example:" sections that contain XML
    # Matches: "Example:" followed by XML content until next section or end
    pattern2 = r'Example:\s*<function_calls>.*?(?=\n\n|\n-|\Z)'
    content = re.sub(pattern2, '', content, flags=re.DOTALL)
    
    # Pattern 3: Remove lines that only contain XML tags or parameters
    # Matches: Lines like "<invoke name=..." or "<parameter name=..."
    pattern3 = r'^\s*<(invoke|parameter).*?>\s*$'
    content = re.sub(pattern3, '', content, flags=re.MULTILINE)
    
    # Pattern 4: Remove empty lines created by removal (max 2 consecutive)
    pattern4 = r'\n{3,}'
    content = re.sub(pattern4, '\n\n', content)
    
    # Log the transformation
    logger.debug(f"🔧 XML removal: {len(content)} chars after cleanup")
    
    return content.strip()
```

**Testing:**
- [ ] Removes `<function_calls>` blocks
- [ ] Removes XML examples
- [ ] Keeps non-XML content
- [ ] Doesn't break formatting
- [ ] Handles edge cases (nested tags, multiline)

---

### Task 1.4: Update thread_manager.py to Pass Context

**Effort:** 15 minutes  
**File:** `backend/core/agentpress/thread_manager.py`

**Implementation:**
```python
# In run_thread() method, around line 270:

if user_query:
    # Route to appropriate modules
    router = get_router()
    modules_needed = router.route(user_query)

    # Build modular prompt with context
    builder = get_prompt_builder()
    
    # Create context with tool calling mode
    context = {
        'native_tool_calling': config.native_tool_calling,
        'user_query': user_query
    }
    
    modular_prompt_content = builder.build_prompt(modules_needed, context=context)

    # Replace system prompt with modular version
    system_prompt = {
        "role": "system",
        "content": modular_prompt_content
    }

    logger.info(f"🧭 Dynamic routing applied: {len(modules_needed)} modules, {len(modular_prompt_content)} chars, native_tool_calling={config.native_tool_calling}")
```

**Testing:**
- [ ] Context is passed correctly
- [ ] native_tool_calling flag is correct
- [ ] Logging shows mode
- [ ] No errors

---

### Task 1.5: Add Unit Tests

**Effort:** 30 minutes  
**File:** `backend/tests/prompts/test_context_aware_building.py` (NEW)

**Implementation:**
```python
import pytest
from core.prompts.module_manager import ModularPromptBuilder, PromptModule


def test_build_prompt_without_context():
    """Test that build_prompt works without context (backward compatibility)"""
    builder = ModularPromptBuilder()
    prompt = builder.build_prompt()
    
    assert len(prompt) > 0
    assert "<function_calls>" in prompt  # XML examples should be present


def test_build_prompt_with_native_tool_calling():
    """Test that XML examples are removed in native mode"""
    builder = ModularPromptBuilder()
    context = {'native_tool_calling': True}
    prompt = builder.build_prompt(context=context)
    
    assert len(prompt) > 0
    assert "<function_calls>" not in prompt  # XML examples should be removed
    assert "<invoke" not in prompt
    assert "<parameter" not in prompt


def test_build_prompt_with_xml_tool_calling():
    """Test that XML examples are kept in XML mode"""
    builder = ModularPromptBuilder()
    context = {'native_tool_calling': False}
    prompt = builder.build_prompt(context=context)
    
    assert len(prompt) > 0
    assert "<function_calls>" in prompt  # XML examples should be present


def test_remove_xml_examples():
    """Test XML removal logic"""
    builder = ModularPromptBuilder()
    
    content = """
    Some text before
    
    Example:
    <function_calls>
    <invoke name="test">
    <parameter name="arg">value</parameter>
    </invoke>
    </function_calls>
    
    Some text after
    """
    
    result = builder._remove_xml_examples(content)
    
    assert "<function_calls>" not in result
    assert "<invoke" not in result
    assert "Some text before" in result
    assert "Some text after" in result


def test_context_modifications_only_affect_toolkit():
    """Test that only TOOL_TOOLKIT module is modified"""
    builder = ModularPromptBuilder()
    context = {'native_tool_calling': True}
    
    # Get toolkit module
    toolkit_config = builder.modules.get(PromptModule.TOOL_TOOLKIT)
    if toolkit_config:
        original_content = toolkit_config.content
        modified_content = builder._apply_context_modifications(
            PromptModule.TOOL_TOOLKIT,
            original_content,
            context
        )
        
        # Should be different (XML removed)
        assert len(modified_content) < len(original_content)
    
    # Get other module (should not be modified)
    identity_config = builder.modules.get(PromptModule.CORE_IDENTITY)
    if identity_config:
        original_content = identity_config.content
        modified_content = builder._apply_context_modifications(
            PromptModule.CORE_IDENTITY,
            original_content,
            context
        )
        
        # Should be same
        assert modified_content == original_content
```

**Testing:**
- [ ] All tests pass
- [ ] Coverage > 90%
- [ ] Edge cases covered

---

## Story 2: Add Integration Tests for Tool Calling

**ID:** TOOL-002  
**Priority:** P0  
**Effort:** 1 hour  
**Dependencies:** TOOL-001  

### Description

As a QA engineer, I want comprehensive integration tests that verify tool calling works correctly after context optimization, so that we can prevent regressions.

### Acceptance Criteria

- [ ] Test tool calling with native mode
- [ ] Test tool calling with XML mode
- [ ] Test with 1, 2, 3 tools
- [ ] Test with different queries
- [ ] Test that LLM actually calls tools
- [ ] Test that tool execution completes

---

### Task 2.1: Create Integration Test File

**Effort:** 45 minutes  
**File:** `backend/tests/integration/test_tool_calling_after_optimization.py` (NEW)

**Implementation:**
```python
import pytest
import asyncio
from core.agentpress.thread_manager import ThreadManager
from core.agentpress.response_processor import ProcessorConfig


@pytest.mark.asyncio
async def test_tool_calling_with_native_mode():
    """Test that tool calling works with native mode after optimization"""
    # Setup
    thread_manager = ThreadManager(...)
    config = ProcessorConfig(
        native_tool_calling=True,
        execute_tools=True
    )
    
    # Execute
    response = await thread_manager.run_thread(
        thread_id="test-thread",
        system_prompt={"role": "system", "content": "You are a helpful assistant"},
        temporary_message={"role": "user", "content": "Hãy dùng web_search tool để tìm kiếm PancakeSwap"},
        processor_config=config
    )
    
    # Assert
    assert response is not None
    # Check that tool was called (implementation depends on response format)
    # assert "tool_calls" in response or tool execution happened


@pytest.mark.asyncio
async def test_tool_calling_with_1_tool():
    """Test tool calling with 1 tool limit"""
    # Similar to above but with 1 tool limit
    pass


@pytest.mark.asyncio
async def test_tool_calling_with_3_tools():
    """Test tool calling with 3 tools limit"""
    # Similar to above but with 3 tools limit
    pass


@pytest.mark.asyncio
async def test_no_xml_in_system_prompt_native_mode():
    """Test that system prompt doesn't contain XML examples in native mode"""
    # Build prompt with native mode
    from core.prompts.module_manager import get_prompt_builder
    
    builder = get_prompt_builder()
    context = {'native_tool_calling': True}
    prompt = builder.build_prompt(context=context)
    
    # Assert no XML
    assert "<function_calls>" not in prompt
    assert "<invoke" not in prompt
    assert "<parameter" not in prompt


@pytest.mark.asyncio
async def test_xml_in_system_prompt_xml_mode():
    """Test that system prompt contains XML examples in XML mode"""
    # Build prompt with XML mode
    from core.prompts.module_manager import get_prompt_builder
    
    builder = get_prompt_builder()
    context = {'native_tool_calling': False}
    prompt = builder.build_prompt(context=context)
    
    # Assert XML present
    assert "<function_calls>" in prompt
```

**Testing:**
- [ ] All tests pass
- [ ] Tests run in CI/CD
- [ ] Tests catch regressions

---

## Story 3: Add Monitoring and Logging

**ID:** TOOL-003  
**Priority:** P1  
**Effort:** 30 minutes  
**Dependencies:** TOOL-001  

### Description

As a DevOps engineer, I want detailed logging and monitoring of tool calling behavior, so that I can quickly diagnose issues in production.

### Acceptance Criteria

- [ ] Log when XML examples are removed
- [ ] Log tool calling mode (native vs XML)
- [ ] Log to GlitchTip with context
- [ ] Include metrics in logs

---

### Task 3.1: Add Detailed Logging

**Effort:** 20 minutes  
**Files:** `backend/core/prompts/module_manager.py`, `backend/core/agentpress/thread_manager.py`

**Implementation:**
```python
# In _remove_xml_examples():
logger.info(f"🔧 XML Removal: Removed {original_len - new_len} chars of XML examples")

# In _apply_context_modifications():
logger.info(f"🔧 Context Modification: module={module.value}, native_tool_calling={context.get('native_tool_calling')}")

# In thread_manager.py:
logger.info(f"🔧 Tool Calling Mode: native={config.native_tool_calling}, tools_count={len(openapi_tool_schemas)}")
```

---

### Task 3.2: Add GlitchTip Monitoring

**Effort:** 10 minutes  
**File:** `backend/core/prompts/module_manager.py`

**Implementation:**
```python
# In _apply_context_modifications():
try:
    import sentry_sdk
    sentry_sdk.set_context("prompt_modification", {
        "module": module.value,
        "native_tool_calling": context.get('native_tool_calling'),
        "xml_removed": native_tool_calling,
        "original_size": len(content),
        "modified_size": len(modified_content)
    })
except Exception as e:
    logger.warning(f"Failed to log to GlitchTip: {e}")
```

---

## Summary

### Total Effort: 2-3 hours

**Story 1:** 1.5 hours (Core implementation)  
**Story 2:** 1 hour (Integration tests)  
**Story 3:** 30 minutes (Monitoring)  

### Success Metrics

- [ ] Tool calling works with native mode
- [ ] No "I don't have access" messages
- [ ] All tests pass
- [ ] GlitchTip shows correct metrics
- [ ] Production deployment successful

### Rollback Plan

If implementation fails:
1. Revert changes to `module_manager.py` and `thread_manager.py`
2. Restart worker
3. Fall back to Option 1 (Remove XML examples)

