# System Prompt Optimization - Implementation Examples

## 1. Module Structure Implementation

### Directory Structure
```
backend/core/prompts/
├── __init__.py
├── prompt.py (legacy - to be deprecated)
├── modules/
│   ├── __init__.py
│   ├── core.py
│   ├── file_ops.py
│   ├── web_search.py
│   ├── browser.py
│   ├── code_dev.py
│   ├── design.py
│   └── workflow.py
├── builders/
│   ├── __init__.py
│   ├── dynamic_builder.py
│   └── query_classifier.py
└── tests/
    ├── test_modules.py
    ├── test_builder.py
    └── test_classifier.py
```

### Core Module (modules/core.py)
```python
"""
Core prompt module - Always loaded
Size: ~700 chars (~175 tokens)
"""

CORE_PROMPT = """You are Chainlens.so, an autonomous AI Worker created by Epsilon team.

# Core Capabilities:
- Execute complex tasks across domains
- Access to Linux environment with internet
- File system operations, terminal commands
- Web browsing and programming runtimes

# Key Guidelines:
- Use tools efficiently, call in parallel when possible
- Always validate data before processing
- Ask for clarification when ambiguous
- Follow user instructions precisely
- Use structured task lists for complex work

# Critical Rules:
- Never hallucinate data or make up information
- Always verify tool results before proceeding
- Maintain data integrity and consistency
- Respect user privacy and security
- Document your reasoning and decisions

# Response Format:
- Be concise but complete
- Use markdown for formatting
- Provide code in appropriate language blocks
- Include error handling in solutions
"""

def get_core_prompt() -> str:
    """Get the core prompt that's always loaded."""
    return CORE_PROMPT.strip()
```

### File Operations Module (modules/file_ops.py)
```python
"""
File operations module - Loaded when file operations detected
Size: ~1,500 chars (~375 tokens)
"""

FILE_OPS_MODULE = """
# File Operations Capabilities

## Available Operations:
- **Create/Edit Files:** Use edit_file tool for AI-powered editing
- **Read Files:** Access file contents with proper encoding
- **Delete Files:** Remove files/directories safely
- **Search Files:** Semantic search across documents
- **Organize:** Create directories, move files
- **Convert:** Transform between formats (CSV, JSON, XML, etc.)
- **Batch Process:** Handle multiple files efficiently

## Tools Available:
- `edit_file`: Create or modify files with AI assistance
- `search_files`: Semantic search in documents
- `init_kb`: Initialize knowledge base from files
- `global_kb_*`: Manage global knowledge base
- `execute_command`: Run shell commands for file ops

## File Path Guidelines:
- All paths relative to `/workspace`
- Use forward slashes (/) for paths
- Create parent directories if needed
- Validate paths before operations

## Best Practices:
1. **Validate First:** Check file exists before reading
2. **Handle Errors:** Graceful error handling for I/O
3. **Backup Important:** Consider backups for destructive ops
4. **Encoding:** Default to UTF-8, specify if different
5. **Permissions:** Check write permissions before editing

## Common Workflows:

### Create New File:
1. Determine file path and name
2. Prepare content
3. Use edit_file with full content
4. Verify creation success

### Edit Existing File:
1. Read current content
2. Identify changes needed
3. Use edit_file with modifications
4. Verify changes applied

### Search Files:
1. Use search_files for semantic search
2. Review results
3. Read relevant files for details
4. Process information

## Error Handling:
- File not found: Verify path, offer to create
- Permission denied: Check permissions, suggest alternatives
- Encoding errors: Try different encodings, inform user
- Disk full: Check space, suggest cleanup
"""

def get_file_ops_module() -> str:
    """Get file operations module."""
    return FILE_OPS_MODULE.strip()

# Metadata for module loading
MODULE_METADATA = {
    'name': 'file_ops',
    'size_chars': len(FILE_OPS_MODULE),
    'size_tokens': len(FILE_OPS_MODULE) // 4,  # Rough estimate
    'triggers': [
        'file', 'create', 'edit', 'read', 'write', 'delete',
        'folder', 'directory', 'save', 'open', 'search files'
    ],
    'dependencies': [],
    'priority': 1
}
```

### Web Search Module (modules/web_search.py)
```python
"""
Web search module - Loaded when web research detected
Size: ~1,000 chars (~250 tokens)
"""

WEB_SEARCH_MODULE = """
# Web Search & Research Capabilities

## Available Operations:
- **Web Search:** Direct Q&A from web sources
- **Image Search:** Find and retrieve images
- **News Search:** Get latest news and updates
- **Webpage Scraping:** Extract content from URLs
- **Browser Automation:** Interactive web browsing

## Tools Available:
- `web_search`: Direct web search with Q&A
- `scrape_webpage`: Extract content from URL
- `browser_*`: Interactive browser tools (if needed)

## Research Workflow:
1. **Start Simple:** Use web_search for direct answers
2. **Scrape if Needed:** Use scrape_webpage for specific pages
3. **Browser Last Resort:** Only use browser tools if interactive needed

## Best Practices:
1. **Verify Sources:** Check credibility of information
2. **Multiple Sources:** Cross-reference important facts
3. **Recent Data:** Prefer recent sources for current topics
4. **Cite Sources:** Always provide URLs for information
5. **Respect Robots.txt:** Follow website scraping policies

## Search Query Tips:
- Be specific and clear
- Use quotes for exact phrases
- Include year for recent info (e.g., "AI trends 2025")
- Use site: operator for specific domains

## Common Workflows:

### Quick Research:
1. Use web_search with clear query
2. Review results
3. Extract relevant information
4. Cite sources

### Deep Research:
1. web_search for overview
2. scrape_webpage for detailed content
3. Synthesize information
4. Provide comprehensive summary

### Image Research:
1. Use web_search with image query
2. Review image results
3. Download if needed
4. Provide attribution
"""

def get_web_search_module() -> str:
    """Get web search module."""
    return WEB_SEARCH_MODULE.strip()

MODULE_METADATA = {
    'name': 'web_search',
    'size_chars': len(WEB_SEARCH_MODULE),
    'size_tokens': len(WEB_SEARCH_MODULE) // 4,
    'triggers': [
        'search', 'research', 'find', 'look up', 'information',
        'latest', 'news', 'article', 'web', 'internet'
    ],
    'dependencies': [],
    'priority': 2
}
```

## 2. Query Classifier Implementation

### Simple Pattern-Based Classifier (builders/query_classifier.py)
```python
"""
Query classifier for determining which modules to load.
"""

from typing import List, Dict, Tuple
import re
from dataclasses import dataclass

@dataclass
class ModuleScore:
    """Score for a module based on query analysis."""
    module_name: str
    score: float
    matched_keywords: List[str]

class QueryClassifier:
    """
    Classify user queries to determine which prompt modules to load.
    Uses pattern matching for fast, reliable classification.
    """
    
    PATTERNS = {
        'file_ops': {
            'keywords': [
                'file', 'create', 'edit', 'read', 'write', 'delete',
                'folder', 'directory', 'save', 'open', 'search files',
                'organize', 'move', 'copy', 'rename'
            ],
            'priority': 1,  # Lower = higher priority
            'weight': 1.0
        },
        'web_search': {
            'keywords': [
                'search', 'research', 'find', 'look up', 'information',
                'latest', 'news', 'article', 'web', 'internet',
                'google', 'query'
            ],
            'priority': 2,
            'weight': 1.0
        },
        'browser': {
            'keywords': [
                'navigate', 'click', 'fill', 'form', 'website',
                'webpage', 'scrape', 'extract', 'browser',
                'url', 'link', 'page'
            ],
            'priority': 3,
            'weight': 0.8
        },
        'code_dev': {
            'keywords': [
                'develop', 'build', 'create app', 'code', 'program',
                'deploy', 'server', 'api', 'function', 'class',
                'script', 'application', 'software'
            ],
            'priority': 2,
            'weight': 1.0
        },
        'design': {
            'keywords': [
                'design', 'poster', 'image', 'graphic', 'logo',
                'banner', 'social media', 'visual', 'create image',
                'generate image', 'illustration'
            ],
            'priority': 2,
            'weight': 1.0
        },
        'workflow': {
            'keywords': [
                'task', 'workflow', 'steps', 'process', 'plan',
                'organize', 'multi-step', 'sequence', 'procedure',
                'checklist'
            ],
            'priority': 3,
            'weight': 0.7
        }
    }
    
    def __init__(self, max_modules: int = 3):
        """
        Initialize classifier.
        
        Args:
            max_modules: Maximum number of modules to return
        """
        self.max_modules = max_modules
    
    def classify(self, query: str) -> List[str]:
        """
        Classify query and return relevant module names.
        
        Args:
            query: User's query string
            
        Returns:
            List of module names sorted by relevance
        """
        query_lower = query.lower()
        scores = []
        
        for module_name, config in self.PATTERNS.items():
            matched_keywords = []
            score = 0.0
            
            # Check each keyword
            for keyword in config['keywords']:
                if keyword in query_lower:
                    matched_keywords.append(keyword)
                    # Exact word match gets higher score
                    if re.search(r'\b' + re.escape(keyword) + r'\b', query_lower):
                        score += 2.0
                    else:
                        score += 1.0
            
            if score > 0:
                # Adjust by priority and weight
                adjusted_score = score * config['weight'] * (4 - config['priority'])
                scores.append(ModuleScore(
                    module_name=module_name,
                    score=adjusted_score,
                    matched_keywords=matched_keywords
                ))
        
        # Sort by score descending
        scores.sort(key=lambda x: x.score, reverse=True)
        
        # Return top N modules
        return [s.module_name for s in scores[:self.max_modules]]
    
    def classify_with_scores(self, query: str) -> List[ModuleScore]:
        """
        Classify query and return detailed scores.
        Useful for debugging and analysis.
        """
        query_lower = query.lower()
        scores = []
        
        for module_name, config in self.PATTERNS.items():
            matched_keywords = []
            score = 0.0
            
            for keyword in config['keywords']:
                if keyword in query_lower:
                    matched_keywords.append(keyword)
                    if re.search(r'\b' + re.escape(keyword) + r'\b', query_lower):
                        score += 2.0
                    else:
                        score += 1.0
            
            if score > 0:
                adjusted_score = score * config['weight'] * (4 - config['priority'])
                scores.append(ModuleScore(
                    module_name=module_name,
                    score=adjusted_score,
                    matched_keywords=matched_keywords
                ))
        
        scores.sort(key=lambda x: x.score, reverse=True)
        return scores[:self.max_modules]


# Example usage
if __name__ == "__main__":
    classifier = QueryClassifier(max_modules=3)
    
    test_queries = [
        "Create a Python script to process CSV files",
        "Search for the latest AI trends in 2025",
        "Navigate to website and fill out the form",
        "Design a poster for social media campaign",
        "Build a REST API with authentication"
    ]
    
    for query in test_queries:
        modules = classifier.classify(query)
        print(f"\nQuery: {query}")
        print(f"Modules: {modules}")
        
        # Detailed scores
        scores = classifier.classify_with_scores(query)
        for score in scores:
            print(f"  - {score.module_name}: {score.score:.2f} "
                  f"(matched: {', '.join(score.matched_keywords)})")
```

## 3. Dynamic Prompt Builder Implementation

### Main Builder Class (builders/dynamic_builder.py)
```python
"""
Dynamic prompt builder that constructs optimized prompts based on query.
"""

from typing import List, Dict, Optional
import logging
from ..modules import (
    core, file_ops, web_search, browser, 
    code_dev, design, workflow
)
from .query_classifier import QueryClassifier

logger = logging.getLogger(__name__)

class DynamicPromptBuilder:
    """
    Build optimized prompts dynamically based on user query.
    """
    
    def __init__(self, max_modules: int = 3):
        """
        Initialize builder.
        
        Args:
            max_modules: Maximum number of context modules to load
        """
        self.max_modules = max_modules
        self.classifier = QueryClassifier(max_modules=max_modules)
        
        # Module registry
        self.modules = {
            'file_ops': file_ops.get_file_ops_module(),
            'web_search': web_search.get_web_search_module(),
            'browser': browser.get_browser_module(),
            'code_dev': code_dev.get_code_dev_module(),
            'design': design.get_design_module(),
            'workflow': workflow.get_workflow_module()
        }
        
        # Core prompt (always loaded)
        self.core_prompt = core.get_core_prompt()
    
    def build(self, 
              query: str,
              enabled_tools: Optional[List[str]] = None,
              conversation_history: Optional[List[Dict]] = None) -> str:
        """
        Build optimized prompt for the given query.
        
        Args:
            query: User's query/request
            enabled_tools: List of enabled tool names
            conversation_history: Recent conversation messages
            
        Returns:
            Optimized prompt string
        """
        # 1. Start with core prompt
        prompt_parts = [self.core_prompt]
        
        # 2. Classify query to get relevant modules
        relevant_modules = self.classifier.classify(query)
        
        logger.info(f"Query classified. Relevant modules: {relevant_modules}")
        
        # 3. Load relevant modules
        loaded_modules = []
        for module_name in relevant_modules:
            if module_name in self.modules:
                prompt_parts.append(self.modules[module_name])
                loaded_modules.append(module_name)
        
        # 4. Add tool schemas (if enabled_tools provided)
        if enabled_tools:
            tool_schemas = self._build_tool_schemas(
                enabled_tools, 
                loaded_modules
            )
            if tool_schemas:
                prompt_parts.append(tool_schemas)
        
        # 5. Combine all parts
        final_prompt = "\n\n".join(prompt_parts)
        
        # 6. Log metrics
        self._log_metrics(query, loaded_modules, final_prompt)
        
        return final_prompt
    
    def _build_tool_schemas(self, 
                           enabled_tools: List[str],
                           loaded_modules: List[str]) -> str:
        """
        Build compressed tool schemas for relevant tools.
        
        Args:
            enabled_tools: List of enabled tool names
            loaded_modules: List of loaded module names
            
        Returns:
            Formatted tool schemas string
        """
        # Filter tools based on loaded modules
        relevant_tools = self._filter_tools_by_modules(
            enabled_tools, 
            loaded_modules
        )
        
        if not relevant_tools:
            return ""
        
        # Build compressed schemas
        schemas = ["# Available Tools:"]
        for tool_name in relevant_tools:
            schema = self._get_compressed_tool_schema(tool_name)
            if schema:
                schemas.append(schema)
        
        return "\n".join(schemas)
    
    def _filter_tools_by_modules(self,
                                 enabled_tools: List[str],
                                 loaded_modules: List[str]) -> List[str]:
        """Filter tools based on loaded modules."""
        # Tool to module mapping
        TOOL_MODULE_MAP = {
            'edit_file': 'file_ops',
            'search_files': 'file_ops',
            'web_search': 'web_search',
            'scrape_webpage': 'web_search',
            'browser_navigate': 'browser',
            'browser_click': 'browser',
            # ... add more mappings
        }
        
        relevant_tools = []
        for tool in enabled_tools:
            tool_module = TOOL_MODULE_MAP.get(tool)
            if tool_module in loaded_modules or tool_module is None:
                relevant_tools.append(tool)
        
        return relevant_tools
    
    def _get_compressed_tool_schema(self, tool_name: str) -> str:
        """Get compressed schema for a tool."""
        # This would integrate with your existing tool registry
        # For now, return placeholder
        return f"- {tool_name}: [compressed description]"
    
    def _log_metrics(self, 
                    query: str,
                    loaded_modules: List[str],
                    final_prompt: str):
        """Log metrics for monitoring."""
        metrics = {
            'query_length': len(query),
            'modules_loaded': len(loaded_modules),
            'module_names': loaded_modules,
            'prompt_length_chars': len(final_prompt),
            'prompt_length_tokens': len(final_prompt) // 4,  # Rough estimate
        }
        
        logger.info(f"Prompt built: {metrics}")
        
        # Could also send to GlitchTip/monitoring
        try:
            import sentry_sdk
            sentry_sdk.set_context("prompt_optimization", metrics)
        except:
            pass


# Example usage
if __name__ == "__main__":
    builder = DynamicPromptBuilder(max_modules=3)
    
    query = "Create a Python script to search the web and save results to a file"
    prompt = builder.build(query, enabled_tools=['edit_file', 'web_search'])
    
    print(f"Query: {query}")
    print(f"\nGenerated Prompt ({len(prompt)} chars):")
    print("=" * 80)
    print(prompt)
```

## 4. Integration with Existing Code

### Modify ThreadManager (core/agentpress/thread_manager.py)
```python
# Add at top of file
from core.prompts.builders.dynamic_builder import DynamicPromptBuilder

class ThreadManager:
    def __init__(self, ...):
        # ... existing code ...
        
        # Add dynamic prompt builder
        self.dynamic_prompt_builder = DynamicPromptBuilder(max_modules=3)
    
    async def send_message(self, ...):
        # ... existing code ...
        
        # Extract user query from messages
        user_query = self._extract_user_query(messages)
        
        # Build optimized prompt dynamically
        if user_query:
            optimized_system_prompt = self.dynamic_prompt_builder.build(
                query=user_query,
                enabled_tools=list(self.tool_registry.tools.keys()),
                conversation_history=messages[-10:]  # Last 10 messages
            )
            
            # Replace system prompt
            for msg in messages:
                if msg.get('role') == 'system':
                    msg['content'] = optimized_system_prompt
                    break
        
        # ... rest of existing code ...
```

## 5. Testing Examples

### Unit Tests (tests/test_classifier.py)
```python
import pytest
from core.prompts.builders.query_classifier import QueryClassifier

def test_file_operations_classification():
    classifier = QueryClassifier()
    
    queries = [
        "Create a new Python file",
        "Edit the config.json file",
        "Search for files containing 'test'"
    ]
    
    for query in queries:
        modules = classifier.classify(query)
        assert 'file_ops' in modules, f"Failed for: {query}"

def test_web_search_classification():
    classifier = QueryClassifier()
    
    queries = [
        "Search for AI trends in 2025",
        "Find information about Python",
        "Look up the latest news"
    ]
    
    for query in queries:
        modules = classifier.classify(query)
        assert 'web_search' in modules, f"Failed for: {query}"

def test_multi_module_classification():
    classifier = QueryClassifier()
    
    query = "Search the web and save results to a file"
    modules = classifier.classify(query)
    
    assert 'web_search' in modules
    assert 'file_ops' in modules
```

---

**Next Steps:**
1. Review implementation examples
2. Adapt to your specific codebase
3. Start with Phase 1 (modularization)
4. Test thoroughly before deployment

