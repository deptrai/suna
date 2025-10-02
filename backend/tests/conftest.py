"""
Shared test fixtures for all test modules.

This conftest.py is at the tests/ root level and provides
fixtures that can be used across all test directories.
"""

import pytest
import pytest_asyncio
from core.agentpress.thread_manager import ThreadManager
from core.prompts.module_manager import get_prompt_builder

@pytest.fixture
def thread_manager(monkeypatch):
    """
    Fixture for ThreadManager with mocked database operations.
    
    BMAD Strategy: Mock database layer for fast, isolated tests
    - No real database calls
    - Predictable test data
    - Fast execution
    
    Returns:
        ThreadManager instance with mocked DB operations
    """
    manager = ThreadManager()
    
    # Mock create_thread
    async def mock_create_thread(*args, **kwargs):
        """Mock thread creation - returns fake thread_id."""
        return "test-thread-12345"
    
    # Mock add_message
    async def mock_add_message(*args, **kwargs):
        """Mock message addition - returns fake message."""
        return {
            "message_id": "test-msg-12345",
            "thread_id": kwargs.get("thread_id", "test-thread-12345"),
            "type": kwargs.get("type", "user"),
            "content": kwargs.get("content", ""),
            "created_at": "2025-10-01T00:00:00Z"
        }
    
    # Mock get_llm_messages
    async def mock_get_llm_messages(thread_id):
        """Mock getting messages - returns empty list for now."""
        return []
    
    # Apply mocks
    monkeypatch.setattr(manager, "create_thread", mock_create_thread)
    monkeypatch.setattr(manager, "add_message", mock_add_message)
    monkeypatch.setattr(manager, "get_llm_messages", mock_get_llm_messages)
    
    return manager

@pytest_asyncio.fixture(scope="function")
async def test_thread(thread_manager):
    """
    Fixture for test thread.
    Creates a test thread and cleans up after test.
    
    Args:
        thread_manager: ThreadManager fixture (mocked)
        
    Yields:
        Test thread ID (string)
    """
    # Create test thread - returns mocked thread_id
    thread_id = await thread_manager.create_thread(
        account_id="test_account",
        project_id="test_project",
        is_public=False,
        metadata={"test": True}
    )
    
    yield thread_id
    
    # Cleanup (no-op for mocked tests)

@pytest.fixture
def chat_helper(thread_manager, monkeypatch):
    """
    Helper fixture for chat operations.
    Simplifies sending messages and getting responses.
    
    BMAD Strategy: Mocked integration test helper
    - Uses mocked ThreadManager
    - Uses mocked LLM responses
    - Fast, predictable tests
    
    Returns:
        Async function to send message and get response
    """
    # Mock run_thread to return fake LLM responses
    async def mock_run_thread(thread_id, system_prompt, **kwargs):
        """
        Mock LLM response based on query content.
        Returns realistic responses for test scenarios.
        """
        # Get user query from temporary_message if available
        user_query = kwargs.get('temporary_message', {}).get('content', '')
        
        # Generate mock response based on query
        if "2+2" in user_query or "What is 2+2" in user_query:
            response = "The answer is 4. This is a simple arithmetic calculation."
        elif "quantum" in user_query.lower():
            response = "Quantum computing is a type of computing that uses quantum-mechanical phenomena, such as superposition and entanglement, to perform operations on data. Unlike classical computers that use bits (0 or 1), quantum computers use quantum bits or qubits, which can exist in multiple states simultaneously."
        elif "Alice" in user_query:
            response = "I understand that your name is Alice. How can I help you today?"
        elif "name" in user_query.lower():
            response = "Your name is Alice, as you mentioned earlier."
        elif "Python" in user_query:
            response = "I understand you're working on a Python project. Python is a great programming language!"
        elif "language" in user_query.lower():
            response = "You're using Python for your project, as you mentioned earlier."
        elif "blog post" in user_query.lower() or "documentation" in user_query.lower():
            # Content creation requests need longer responses
            response = f"Here is the content you requested:\n\n{user_query}\n\nThis is a comprehensive response that includes detailed information, examples, and best practices. The content is well-structured and provides valuable insights for the reader. It covers all the key points and includes practical examples that demonstrate the concepts clearly."
        else:
            response = f"I received your message: '{user_query}'. This is a test response."
        
        return {"content": response}
    
    # Apply mock
    monkeypatch.setattr(thread_manager, "run_thread", mock_run_thread)
    
    async def _send_and_get_response(
        thread_id: str,
        content: str,
        stream: bool = False
    ) -> str:
        """
        Send a message and get response.
        
        Args:
            thread_id: Thread ID
            content: Message content
            stream: Whether to stream response
            
        Returns:
            Response content as string
        """
        # Add user message to thread (mocked)
        await thread_manager.add_message(
            thread_id=thread_id,
            type="user",
            content=content,
            is_llm_message=False
        )
        
        # Build system prompt (real, but not used in mock)
        prompt_builder = get_prompt_builder()
        system_prompt = prompt_builder.build_prompt(content)
        
        # Run thread with mocked LLM
        result = await thread_manager.run_thread(
            thread_id=thread_id,
            system_prompt=system_prompt,
            stream=stream,
            temporary_message={"content": content},
            llm_model="claude-sonnet-4-20250514",
            enable_prompt_caching=True
        )
        
        # Extract response content
        if isinstance(result, dict):
            return result.get('content', '')
        return str(result)
    
    return _send_and_get_response

@pytest.fixture
def sample_queries():
    """
    Fixture for common test queries.
    
    Returns:
        Dictionary of sample queries for different scenarios
    """
    return {
        'simple': "What is 2+2?",
        'multi_turn': [
            "My name is Alice",
            "What is my name?"
        ],
        'context': [
            "I'm working on a Python project",
            "What language am I using?"
        ],
        'file_op': "Create a file called test.txt",
        'data': "Parse this CSV data",
        'workflow': "Help me organize my tasks",
        'content': "Write a blog post about AI"
    }

