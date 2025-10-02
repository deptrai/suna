# Testing Framework User Stories

**Project:** Comprehensive Testing Framework  
**Goal:** Ensure 100% quality and optimize test coverage  
**Timeline:** 3 weeks  
**Priority:** Chat Flow Tests → Integration → Performance → Regression → Load

---

## Phase 1: Chat Flow Tests (Week 1)

### Story 1.1: Basic Chat Flow Tests

**As a** QA engineer  
**I want to** test basic chat functionality  
**So that** users can have reliable conversations

**Acceptance Criteria:**
- [ ] Simple query-response works
- [ ] Multi-turn conversations maintain context
- [ ] Streaming responses work correctly
- [ ] All tests pass with 100% success rate

**Tasks:**

#### Task 1.1.1: Create Test Infrastructure
**File:** Create `backend/tests/chat_flow/conftest.py`

**Implementation:**
```python
import pytest
import asyncio
from core.agentpress.thread_manager import ThreadManager
from core.agentpress.context_manager import ContextManager

@pytest.fixture
async def thread_manager():
    """Fixture for ThreadManager."""
    return ThreadManager()

@pytest.fixture
async def test_thread(thread_manager):
    """Fixture for test thread."""
    # Create test thread
    thread = await thread_manager.create_thread(
        user_id="test_user",
        organization_id="test_org"
    )
    yield thread
    # Cleanup
    await thread_manager.delete_thread(thread.id)

@pytest.fixture
def sample_queries():
    """Fixture for test queries."""
    return {
        'simple': "What is 2+2?",
        'file_op': "Create a file called test.txt",
        'data': "Analyze this CSV data",
        'workflow': "Help me organize my tasks",
        'content': "Write a blog post about AI"
    }
```

**Acceptance:** Fixtures work and can be imported

---

#### Task 1.1.2: Test Simple Query-Response
**File:** Create `backend/tests/chat_flow/test_basic_chat.py`

**Implementation:**
```python
import pytest

@pytest.mark.asyncio
async def test_simple_query_response(thread_manager, test_thread, sample_queries):
    """Test simple query gets a response."""
    query = sample_queries['simple']
    
    # Send message
    response = await thread_manager.send_message(
        thread_id=test_thread.id,
        content=query
    )
    
    # Assertions
    assert response is not None
    assert len(response) > 0
    assert isinstance(response, str)
    
@pytest.mark.asyncio
async def test_response_quality(thread_manager, test_thread):
    """Test response quality metrics."""
    query = "Explain quantum computing in simple terms"
    
    response = await thread_manager.send_message(
        thread_id=test_thread.id,
        content=query
    )
    
    # Quality checks
    assert len(response) > 100  # Substantial response
    assert "quantum" in response.lower()  # Relevant
    assert not response.startswith("Error")  # No errors
```

**Acceptance:** Tests pass, responses are valid

---

#### Task 1.1.3: Test Multi-Turn Conversations
**File:** `backend/tests/chat_flow/test_basic_chat.py` (add)

**Implementation:**
```python
@pytest.mark.asyncio
async def test_multi_turn_conversation(thread_manager, test_thread):
    """Test multi-turn conversation maintains context."""
    
    # Turn 1
    response1 = await thread_manager.send_message(
        thread_id=test_thread.id,
        content="My name is Alice"
    )
    assert response1 is not None
    
    # Turn 2 - should remember name
    response2 = await thread_manager.send_message(
        thread_id=test_thread.id,
        content="What is my name?"
    )
    assert "Alice" in response2 or "alice" in response2.lower()
    
@pytest.mark.asyncio
async def test_context_retention(thread_manager, test_thread):
    """Test context is retained across messages."""
    
    # Set context
    await thread_manager.send_message(
        thread_id=test_thread.id,
        content="I'm working on a Python project"
    )
    
    # Query using context
    response = await thread_manager.send_message(
        thread_id=test_thread.id,
        content="What language am I using?"
    )
    
    assert "Python" in response or "python" in response.lower()
```

**Acceptance:** Context is maintained across turns

---

#### Task 1.1.4: Test Streaming Responses
**File:** `backend/tests/chat_flow/test_basic_chat.py` (add)

**Implementation:**
```python
@pytest.mark.asyncio
async def test_streaming_response(thread_manager, test_thread):
    """Test streaming responses work correctly."""
    
    chunks = []
    async for chunk in thread_manager.stream_message(
        thread_id=test_thread.id,
        content="Count from 1 to 5"
    ):
        chunks.append(chunk)
    
    # Assertions
    assert len(chunks) > 0
    full_response = "".join(chunks)
    assert len(full_response) > 0
    
@pytest.mark.asyncio
async def test_streaming_cancellation(thread_manager, test_thread):
    """Test streaming can be cancelled."""
    
    chunks = []
    async for chunk in thread_manager.stream_message(
        thread_id=test_thread.id,
        content="Write a very long essay"
    ):
        chunks.append(chunk)
        if len(chunks) >= 5:
            break  # Cancel early
    
    assert len(chunks) == 5
```

**Acceptance:** Streaming works and can be cancelled

---

### Story 1.2: Tool Calling Tests

**As a** QA engineer  
**I want to** test tool calling functionality  
**So that** all tools work correctly

**Acceptance Criteria:**
- [ ] File operations work
- [ ] Data processing works
- [ ] Workflow management works
- [ ] Content creation works
- [ ] Tool calling success rate = 100%

**Tasks:**

#### Task 1.2.1: Test File Operations
**File:** Create `backend/tests/chat_flow/test_tool_calling.py`

**Implementation:**
```python
import pytest
import os

@pytest.mark.asyncio
async def test_file_creation(thread_manager, test_thread, tmp_path):
    """Test file creation tool."""
    
    test_file = tmp_path / "test.txt"
    
    response = await thread_manager.send_message(
        thread_id=test_thread.id,
        content=f"Create a file at {test_file} with content 'Hello World'"
    )
    
    # Check file was created
    assert test_file.exists()
    assert test_file.read_text() == "Hello World"
    
@pytest.mark.asyncio
async def test_file_reading(thread_manager, test_thread, tmp_path):
    """Test file reading tool."""
    
    # Create test file
    test_file = tmp_path / "test.txt"
    test_file.write_text("Test content")
    
    response = await thread_manager.send_message(
        thread_id=test_thread.id,
        content=f"Read the file at {test_file}"
    )
    
    assert "Test content" in response
```

**Acceptance:** File operations work correctly

---

#### Task 1.2.2: Test Data Processing
**File:** `backend/tests/chat_flow/test_tool_calling.py` (add)

**Implementation:**
```python
@pytest.mark.asyncio
async def test_csv_parsing(thread_manager, test_thread, tmp_path):
    """Test CSV parsing tool."""
    
    # Create test CSV
    csv_file = tmp_path / "test.csv"
    csv_file.write_text("name,age\nAlice,30\nBob,25")
    
    response = await thread_manager.send_message(
        thread_id=test_thread.id,
        content=f"Parse the CSV file at {csv_file}"
    )
    
    assert "Alice" in response
    assert "30" in response
    
@pytest.mark.asyncio
async def test_json_parsing(thread_manager, test_thread):
    """Test JSON parsing tool."""
    
    json_data = '{"name": "Alice", "age": 30}'
    
    response = await thread_manager.send_message(
        thread_id=test_thread.id,
        content=f"Parse this JSON: {json_data}"
    )
    
    assert "Alice" in response
    assert "30" in response
```

**Acceptance:** Data processing tools work

---

#### Task 1.2.3: Test Workflow Management
**File:** `backend/tests/chat_flow/test_tool_calling.py` (add)

**Implementation:**
```python
@pytest.mark.asyncio
async def test_task_creation(thread_manager, test_thread):
    """Test task creation tool."""
    
    response = await thread_manager.send_message(
        thread_id=test_thread.id,
        content="Create a task: Write documentation"
    )
    
    assert "task" in response.lower()
    assert "created" in response.lower() or "added" in response.lower()
    
@pytest.mark.asyncio
async def test_task_organization(thread_manager, test_thread):
    """Test task organization tool."""
    
    response = await thread_manager.send_message(
        thread_id=test_thread.id,
        content="Organize my tasks by priority"
    )
    
    assert "priority" in response.lower() or "organized" in response.lower()
```

**Acceptance:** Workflow tools work correctly

---

#### Task 1.2.4: Test Content Creation
**File:** `backend/tests/chat_flow/test_tool_calling.py` (add)

**Implementation:**
```python
@pytest.mark.asyncio
async def test_blog_post_creation(thread_manager, test_thread):
    """Test blog post creation."""
    
    response = await thread_manager.send_message(
        thread_id=test_thread.id,
        content="Write a short blog post about testing"
    )
    
    # Check response is substantial
    assert len(response) > 200
    assert "testing" in response.lower()
    
@pytest.mark.asyncio
async def test_documentation_creation(thread_manager, test_thread):
    """Test documentation creation."""
    
    response = await thread_manager.send_message(
        thread_id=test_thread.id,
        content="Write API documentation for a login endpoint"
    )
    
    assert len(response) > 100
    assert "login" in response.lower()
    assert "api" in response.lower() or "endpoint" in response.lower()
```

**Acceptance:** Content creation works

---

### Story 1.3: Error Handling Tests

**As a** QA engineer  
**I want to** test error handling  
**So that** errors are handled gracefully

**Acceptance Criteria:**
- [ ] Invalid input handled
- [ ] Timeouts handled
- [ ] API errors handled
- [ ] Graceful degradation works

**Tasks:**

#### Task 1.3.1: Test Invalid Input Handling
**File:** Create `backend/tests/chat_flow/test_error_handling.py`

**Implementation:**
```python
import pytest

@pytest.mark.asyncio
async def test_empty_message(thread_manager, test_thread):
    """Test empty message handling."""
    
    with pytest.raises(ValueError):
        await thread_manager.send_message(
            thread_id=test_thread.id,
            content=""
        )
        
@pytest.mark.asyncio
async def test_very_long_message(thread_manager, test_thread):
    """Test very long message handling."""
    
    long_message = "a" * 100000  # 100k characters
    
    response = await thread_manager.send_message(
        thread_id=test_thread.id,
        content=long_message
    )
    
    # Should handle gracefully (truncate or error)
    assert response is not None
```

**Acceptance:** Invalid input handled gracefully

---

#### Task 1.3.2: Test Timeout Handling
**File:** `backend/tests/chat_flow/test_error_handling.py` (add)

**Implementation:**
```python
@pytest.mark.asyncio
@pytest.mark.timeout(30)
async def test_timeout_handling(thread_manager, test_thread):
    """Test timeout handling."""
    
    # This should timeout or return error
    response = await thread_manager.send_message(
        thread_id=test_thread.id,
        content="Perform a very long computation",
        timeout=1  # 1 second timeout
    )
    
    # Should either timeout or return partial result
    assert response is not None
```

**Acceptance:** Timeouts handled correctly

---

## Phase 2: Routing & Caching Tests (Week 2)

### Story 2.1: Routing Tests

**As a** QA engineer  
**I want to** test routing logic  
**So that** correct modules are loaded

**Acceptance Criteria:**
- [ ] Single module queries work
- [ ] Multi-module queries work
- [ ] Generic queries work
- [ ] Edge cases handled
- [ ] Routing accuracy > 95%

**Tasks:**

#### Task 2.1.1: Test Single Module Routing
**File:** Create `backend/tests/routing/test_keyword_routing.py`

**Implementation:**
```python
import pytest
from core.prompts.router import get_router
from core.prompts.module_manager import PromptModule

def test_file_operation_routing():
    """Test file operation queries route to toolkit."""
    
    router = get_router()
    
    queries = [
        "Create a new file",
        "Edit this file",
        "Delete old files"
    ]
    
    for query in queries:
        modules = router.route(query)
        tool_modules = [m for m in modules if m.value.startswith("tools/")]
        
        assert PromptModule.TOOL_TOOLKIT in tool_modules
        
def test_data_processing_routing():
    """Test data processing queries route correctly."""
    
    router = get_router()
    
    queries = [
        "Parse this JSON",
        "Analyze CSV data",
        "Query database"
    ]
    
    for query in queries:
        modules = router.route(query)
        tool_modules = [m for m in modules if m.value.startswith("tools/")]
        
        assert PromptModule.TOOL_DATA_PROCESSING in tool_modules
```

**Acceptance:** Single module routing works

---

#### Task 2.1.2: Test Multi-Module Routing
**File:** `backend/tests/routing/test_keyword_routing.py` (add)

**Implementation:**
```python
def test_multi_module_routing():
    """Test queries that need multiple modules."""
    
    router = get_router()
    
    # Should load both toolkit and content_creation
    query = "Write a blog post and save it to a file"
    modules = router.route(query)
    tool_modules = [m for m in modules if m.value.startswith("tools/")]
    
    assert PromptModule.TOOL_TOOLKIT in tool_modules
    assert PromptModule.TOOL_CONTENT_CREATION in tool_modules
    
def test_complex_query_routing():
    """Test complex queries with multiple intents."""
    
    router = get_router()
    
    query = "Analyze this data, create a report, and organize the tasks"
    modules = router.route(query)
    tool_modules = [m for m in modules if m.value.startswith("tools/")]
    
    # Should load multiple modules
    assert len(tool_modules) >= 2
```

**Acceptance:** Multi-module routing works

---

## Phase 3: Performance & Regression (Week 3)

### Story 3.1: Performance Tests

**As a** QA engineer  
**I want to** test performance  
**So that** system meets SLAs

**Acceptance Criteria:**
- [ ] Response time < 2s (p95)
- [ ] Routing overhead < 50ms
- [ ] Cache hit rate > 70%
- [ ] Throughput > 10 req/s

**Tasks:**

#### Task 3.1.1: Test Response Time
**File:** Create `backend/tests/performance/test_latency.py`

**Implementation:**
```python
import pytest
import time

@pytest.mark.asyncio
async def test_response_time(thread_manager, test_thread):
    """Test response time is acceptable."""
    
    start = time.time()
    
    response = await thread_manager.send_message(
        thread_id=test_thread.id,
        content="What is 2+2?"
    )
    
    end = time.time()
    latency = end - start
    
    # Should respond within 2 seconds
    assert latency < 2.0
    assert response is not None
```

**Acceptance:** Response time meets SLA

---

## 📊 Test Execution Plan

### CI/CD Integration

**pytest.ini:**
```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
asyncio_mode = auto
markers =
    slow: marks tests as slow
    integration: marks tests as integration tests
    performance: marks tests as performance tests
```

**GitHub Actions:**
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run tests
        run: |
          pytest tests/ -v --cov=backend --cov-report=html
```

---

## 🎯 Success Metrics

**Coverage:** 80%+  
**Pass Rate:** 99%+  
**Execution Time:** <5 minutes  
**Flaky Rate:** <1%

---

**Total Stories:** 6  
**Total Tasks:** 15+  
**Timeline:** 3 weeks  
**Priority:** Chat Flow → Routing → Performance

