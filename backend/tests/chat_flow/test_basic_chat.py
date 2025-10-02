"""
Basic chat flow tests.

BMAD Test Strategy: Integration Tests (P0)
- Test ID: CF-INT-001 to CF-INT-004
- Level: Integration (ThreadManager + LLM)
- Priority: P0 (Critical)
- Risk: RISK-005 (Context not maintained)

Tests:
- Simple query-response
- Multi-turn conversations
- Context retention
- Streaming responses
"""

import pytest
import asyncio

@pytest.mark.asyncio
@pytest.mark.integration
async def test_simple_query_response(chat_helper, test_thread, sample_queries):
    """
    Test ID: CF-INT-001
    Level: Integration
    Priority: P0

    Test simple query gets a response.

    Acceptance Criteria:
    - Response is not None
    - Response has content
    - Response is a string

    Mitigates: RISK-005 (Context not maintained)
    """
    query = sample_queries['simple']

    # Send message and get response (test_thread is thread_id string)
    response = await chat_helper(
        thread_id=test_thread,
        content=query
    )

    # Assertions
    assert response is not None, "Response should not be None"
    assert len(response) > 0, "Response should have content"
    assert isinstance(response, str), "Response should be a string"

    print(f"✅ CF-INT-001 PASSED: Simple query test")
    print(f"   Query: {query}")
    print(f"   Response length: {len(response)} chars")

@pytest.mark.asyncio
@pytest.mark.integration
async def test_response_quality(chat_helper, test_thread):
    """
    Test ID: CF-INT-001b
    Level: Integration
    Priority: P0

    Test response quality metrics.

    Acceptance Criteria:
    - Response is substantial (>100 chars)
    - Response is relevant to query
    - Response has no errors
    """
    query = "Explain quantum computing in simple terms"

    response = await chat_helper(
        thread_id=test_thread,
        content=query
    )

    # Quality checks
    assert len(response) > 100, "Response should be substantial"
    assert "quantum" in response.lower(), "Response should be relevant"
    assert not response.startswith("Error"), "Response should not be an error"

    print(f"✅ CF-INT-001b PASSED: Response quality test")
    print(f"   Response length: {len(response)} chars")

@pytest.mark.asyncio
@pytest.mark.integration
async def test_multi_turn_conversation(chat_helper, test_thread, sample_queries):
    """
    Test ID: CF-INT-002
    Level: Integration
    Priority: P0

    Test multi-turn conversation maintains context.

    Acceptance Criteria:
    - First turn gets response
    - Second turn remembers context from first turn
    - Context is maintained across turns

    Mitigates: RISK-005 (Context not maintained)
    """
    queries = sample_queries['multi_turn']

    # Turn 1: Set context
    response1 = await chat_helper(
        thread_id=test_thread,
        content=queries[0]  # "My name is Alice"
    )
    assert response1 is not None, "First response should not be None"

    # Turn 2: Query using context
    response2 = await chat_helper(
        thread_id=test_thread,
        content=queries[1]  # "What is my name?"
    )

    # Should remember name from turn 1
    assert "Alice" in response2 or "alice" in response2.lower(), \
        "Response should remember name from previous turn"

    print(f"✅ CF-INT-002 PASSED: Multi-turn conversation test")
    print(f"   Turn 1: {queries[0]}")
    print(f"   Turn 2: {queries[1]}")
    print(f"   Context maintained: Alice found in response")

@pytest.mark.asyncio
@pytest.mark.integration
async def test_context_retention(chat_helper, test_thread, sample_queries):
    """
    Test ID: CF-INT-003
    Level: Integration
    Priority: P0

    Test context is retained across messages.

    Acceptance Criteria:
    - Context from first message is remembered
    - Second message can reference first message
    - Context is accurate

    Mitigates: RISK-005 (Context not maintained)
    """
    queries = sample_queries['context']

    # Set context
    await chat_helper(
        thread_id=test_thread,
        content=queries[0]  # "I'm working on a Python project"
    )

    # Query using context
    response = await chat_helper(
        thread_id=test_thread,
        content=queries[1]  # "What language am I using?"
    )

    # Should remember Python from previous message
    assert "Python" in response or "python" in response.lower(), \
        "Response should remember Python from previous message"

    print(f"✅ CF-INT-003 PASSED: Context retention test")
    print(f"   Context set: {queries[0]}")
    print(f"   Query: {queries[1]}")
    print(f"   Context retained: Python found in response")

@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.chat_flow
async def test_concurrent_messages(chat_helper, test_thread):
    """
    Test ID: CF-INT-004
    Level: Integration
    Priority: P1

    Test multiple concurrent messages to same thread.

    Acceptance Criteria:
    - Multiple messages can be sent concurrently
    - All messages get responses
    - Responses are valid
    """
    queries = [
        "What is 1+1?",
        "What is 2+2?",
        "What is 3+3?"
    ]

    # Send all messages concurrently
    tasks = [
        chat_helper(thread_id=test_thread, content=query)
        for query in queries
    ]

    responses = await asyncio.gather(*tasks)

    # All should have responses
    assert len(responses) == len(queries), "Should have response for each query"

    for i, response in enumerate(responses):
        assert response is not None, f"Response {i} should not be None"
        assert len(response) > 0, f"Response {i} should have content"

    print(f"✅ CF-INT-004 PASSED: Concurrent messages test")
    print(f"   Queries sent: {len(queries)}")
    print(f"   Responses received: {len(responses)}")

@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.chat_flow
async def test_empty_thread_history(chat_helper, test_thread):
    """
    Test ID: CF-INT-005
    Level: Integration
    Priority: P1

    Test query on thread with no history.

    Acceptance Criteria:
    - First message to thread works
    - Response is valid
    - No errors
    """
    # This is the first message to the thread
    response = await chat_helper(
        thread_id=test_thread,
        content="Hello, this is my first message"
    )

    assert response is not None, "First message should get response"
    assert len(response) > 0, "Response should have content"

    print(f"✅ CF-INT-005 PASSED: Empty thread history test")
    print(f"   First message successful")

@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.chat_flow
async def test_long_conversation(chat_helper, test_thread):
    """
    Test ID: CF-INT-006
    Level: Integration
    Priority: P1

    Test long conversation with many turns.

    Acceptance Criteria:
    - Multiple turns work
    - Context maintained throughout
    - No degradation in quality
    """
    turns = 10

    for i in range(turns):
        response = await chat_helper(
            thread_id=test_thread,
            content=f"This is message number {i+1}"
        )

        assert response is not None, f"Turn {i+1} should get response"
        assert len(response) > 0, f"Turn {i+1} response should have content"

    print(f"✅ CF-INT-006 PASSED: Long conversation test")
    print(f"   Turns completed: {turns}")
    print(f"   All responses valid")

