"""
Test data factories for Task Complexity Classification tests (Story 3.1).

Factories provide reusable test data with sensible defaults and override support.
"""


def create_simple_task() -> str:
    """Factory for simple tasks (<50 words, single intent).
    
    Returns:
        Simple task string
    """
    return "What is Python?"


def create_medium_task() -> str:
    """Factory for medium tasks (50-150 words, multiple intents).
    
    Returns:
        Medium task string
    """
    return "Explain Python and compare it with JavaScript. Describe the main differences."


def create_complex_task() -> str:
    """Factory for complex tasks (150-300 words, complex reasoning).
    
    Returns:
        Complex task string
    """
    return "Analyze the performance of Python vs JavaScript for web development, compare their ecosystems, and provide recommendations for choosing between them for different use cases."


def create_very_complex_task() -> str:
    """Factory for very complex tasks (>300 words, advanced reasoning).
    
    Returns:
        Very complex task string (>300 words)
    """
    return (
        "Research the current state of Python and JavaScript ecosystems, analyze their performance characteristics, "
        "compare their tooling and libraries, evaluate their suitability for different project types, create a comprehensive "
        "comparison matrix, and provide strategic recommendations for technology selection based on specific project requirements. "
        "This analysis should include consideration of factors such as development speed, runtime performance, ecosystem maturity, "
        "community support, hiring availability, long-term maintenance costs, and alignment with organizational goals and technical "
        "constraints. Additionally, evaluate the learning curve for each technology, assess the availability of third-party libraries "
        "and frameworks, consider the deployment and hosting options, analyze the debugging and profiling tools available, "
        "review the security best practices and vulnerability management, examine the scalability characteristics, and provide "
        "guidance on when to choose one technology over the other based on specific use cases such as web development, data science, "
        "machine learning, automation, and system administration."
    )


def create_multi_step_task() -> str:
    """Factory for multi-step tasks (contains step indicators).
    
    Returns:
        Multi-step task string
    """
    return "First, analyze the problem. Then, create a plan. Finally, execute the solution."


def create_task_with_simple_keywords() -> str:
    """Factory for tasks with simple keywords.
    
    Returns:
        Task string with simple keywords
    """
    return "What is Python?"


def create_task_with_complex_keywords() -> str:
    """Factory for tasks with complex keywords.
    
    Returns:
        Task string with complex keywords
    """
    return "Analyze and evaluate the performance"


def create_empty_task() -> str:
    """Factory for empty tasks.
    
    Returns:
        Empty task string
    """
    return ""


def create_long_task() -> str:
    """Factory for very long tasks (exceeds MAX_TASK_LENGTH for validation testing).
    
    Returns:
        Very long task string (~150,000 words)
    """
    return "What is Python? " * 10000

