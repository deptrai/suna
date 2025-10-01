"""
Dynamic Prompt Router
Phase 3 Task 3.1.1

Routes user queries to appropriate prompt modules based on keywords.
"""
from typing import List, Dict
from core.prompts.module_manager import PromptModule
from core.utils.logger import logger


class DynamicPromptRouter:
    """
    Routes user queries to appropriate prompt modules.
    
    Features:
    - Keyword-based routing
    - Always includes core modules
    - Logs routing decisions
    - Extensible pattern matching
    """
    
    def __init__(self):
        """Initialize router with keyword patterns"""
        
        # Define keyword patterns for each module
        self.keyword_patterns: Dict[PromptModule, List[str]] = {
            # Tool modules
            PromptModule.TOOL_TOOLKIT: [
                'file', 'create', 'edit', 'read', 'write', 'delete', 'list',
                'directory', 'folder', 'path', 'save', 'load',
                'search', 'browse', 'navigate', 'web', 'url', 'website',
                'terminal', 'command', 'shell', 'execute', 'run',
                'image', 'screenshot', 'visual', 'picture', 'photo'
            ],
            PromptModule.TOOL_DATA_PROCESSING: [
                'data', 'csv', 'json', 'xml', 'parse', 'analyze',
                'extract', 'transform', 'process', 'scrape',
                'table', 'spreadsheet', 'database', 'query'
            ],
            PromptModule.TOOL_WORKFLOW: [
                'task', 'workflow', 'steps', 'plan', 'organize',
                'project', 'setup', 'initialize', 'configure',
                'deploy', 'build', 'install', 'package'
            ],
            PromptModule.TOOL_CONTENT_CREATION: [
                'write', 'blog', 'article', 'post', 'content',
                'document', 'report', 'presentation', 'slide',
                'readme', 'documentation', 'guide', 'tutorial'
            ]
        }
        
        logger.info("🧭 DynamicPromptRouter initialized")
    
    def route(self, user_query: str) -> List[PromptModule]:
        """
        Route user query to appropriate modules.
        
        Args:
            user_query: User's query string
        
        Returns:
            List of modules to include in prompt
        """
        # Always include core modules (identity, workspace, critical rules, response format)
        modules = [
            PromptModule.CORE_IDENTITY,
            PromptModule.CORE_WORKSPACE,
            PromptModule.CORE_CRITICAL_RULES,
            PromptModule.RESPONSE_FORMAT
        ]
        
        # Add conditional modules based on keywords
        query_lower = user_query.lower()
        
        for module, keywords in self.keyword_patterns.items():
            if any(keyword in query_lower for keyword in keywords):
                if module not in modules:
                    modules.append(module)
        
        # If no specific modules matched, include all tool modules
        # (conservative approach to avoid missing functionality)
        tool_modules = [
            PromptModule.TOOL_TOOLKIT,
            PromptModule.TOOL_DATA_PROCESSING,
            PromptModule.TOOL_WORKFLOW,
            PromptModule.TOOL_CONTENT_CREATION
        ]
        
        has_tool_module = any(m in modules for m in tool_modules)
        if not has_tool_module:
            # Add all tool modules if none matched
            modules.extend(tool_modules)
            logger.debug(f"🧭 No specific tool modules matched, including all")
        
        # Log routing decision
        logger.info(f"🧭 Routing: {len(modules)} modules selected")
        logger.debug(f"   Query: {user_query[:100]}...")
        logger.debug(f"   Modules: {[m.value for m in modules]}")
        
        # Log to GlitchTip
        try:
            import sentry_sdk
            sentry_sdk.set_context("routing_decision", {
                "query_length": len(user_query),
                "query_preview": user_query[:200],
                "modules_selected": [m.value for m in modules],
                "module_count": len(modules),
                "has_specific_match": has_tool_module
            })
            sentry_sdk.capture_message(
                f"Routing: {len(modules)} modules selected",
                level="info"
            )
        except Exception as e:
            logger.warning(f"Failed to log routing to GlitchTip: {e}")
        
        return modules
    
    def get_keyword_patterns(self) -> Dict[PromptModule, List[str]]:
        """Get keyword patterns for debugging"""
        return self.keyword_patterns
    
    def add_keyword_pattern(self, module: PromptModule, keywords: List[str]):
        """
        Add or update keyword pattern for a module.
        
        Args:
            module: Module to add pattern for
            keywords: List of keywords
        """
        if module in self.keyword_patterns:
            self.keyword_patterns[module].extend(keywords)
        else:
            self.keyword_patterns[module] = keywords
        
        logger.info(f"🧭 Added {len(keywords)} keywords for {module.value}")
    
    def analyze_query(self, user_query: str) -> Dict[str, any]:
        """
        Analyze query and return detailed routing information.
        
        Args:
            user_query: User's query string
        
        Returns:
            Analysis results
        """
        query_lower = user_query.lower()
        
        # Find matching modules and keywords
        matches = {}
        for module, keywords in self.keyword_patterns.items():
            matched_keywords = [kw for kw in keywords if kw in query_lower]
            if matched_keywords:
                matches[module.value] = matched_keywords
        
        # Get final module list
        modules = self.route(user_query)
        
        analysis = {
            "query": user_query,
            "query_length": len(user_query),
            "matched_modules": matches,
            "final_modules": [m.value for m in modules],
            "module_count": len(modules),
            "core_modules": 4,  # Always 4 core modules
            "tool_modules": len(modules) - 4
        }
        
        return analysis


# Singleton instance
_router_instance = None


def get_router() -> DynamicPromptRouter:
    """Get singleton instance of DynamicPromptRouter"""
    global _router_instance
    if _router_instance is None:
        _router_instance = DynamicPromptRouter()
    return _router_instance

