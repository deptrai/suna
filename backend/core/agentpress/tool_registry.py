from typing import Dict, Type, Any, List, Optional, Callable
from core.agentpress.tool import Tool, SchemaType
from core.utils.logger import logger
import json


class ToolRegistry:
    """Registry for managing and accessing tools.
    
    Maintains a collection of tool instances and their schemas, allowing for
    selective registration of tool functions and easy access to tool capabilities.
    
    Attributes:
        tools (Dict[str, Dict[str, Any]]): OpenAPI-style tools and schemas
        
    Methods:
        register_tool: Register a tool with optional function filtering
        get_tool: Get a specific tool by name
        get_openapi_schemas: Get OpenAPI schemas for function calling
    """
    
    def __init__(self):
        """Initialize a new ToolRegistry instance."""
        self.tools = {}
        logger.debug("Initialized new ToolRegistry instance")
    
    def register_tool(self, tool_class: Type[Tool], function_names: Optional[List[str]] = None, **kwargs):
        """Register a tool with optional function filtering.
        
        Args:
            tool_class: The tool class to register
            function_names: Optional list of specific functions to register
            **kwargs: Additional arguments passed to tool initialization
            
        Notes:
            - If function_names is None, all functions are registered
            - Handles OpenAPI schema registration
        """
        # logger.debug(f"Registering tool class: {tool_class.__name__}")
        tool_instance = tool_class(**kwargs)
        schemas = tool_instance.get_schemas()
        
        # logger.debug(f"Available schemas for {tool_class.__name__}: {list(schemas.keys())}")
        
        registered_openapi = 0
        
        for func_name, schema_list in schemas.items():
            if function_names is None or func_name in function_names:
                for schema in schema_list:
                    if schema.schema_type == SchemaType.OPENAPI:
                        self.tools[func_name] = {
                            "instance": tool_instance,
                            "schema": schema
                        }
                        registered_openapi += 1
                        # logger.debug(f"Registered OpenAPI function {func_name} from {tool_class.__name__}")
        
        # logger.debug(f"Tool registration complete for {tool_class.__name__}: {registered_openapi} OpenAPI functions")

    def get_available_functions(self) -> Dict[str, Callable]:
        """Get all available tool functions.
        
        Returns:
            Dict mapping function names to their implementations
        """
        available_functions = {}
        
        # Get OpenAPI tool functions
        for tool_name, tool_info in self.tools.items():
            tool_instance = tool_info['instance']
            function_name = tool_name
            function = getattr(tool_instance, function_name)
            available_functions[function_name] = function
            
        # logger.debug(f"Retrieved {len(available_functions)} available functions")
        return available_functions

    def get_tool(self, tool_name: str) -> Dict[str, Any]:
        """Get a specific tool by name.
        
        Args:
            tool_name: Name of the tool function
            
        Returns:
            Dict containing tool instance and schema, or empty dict if not found
        """
        tool = self.tools.get(tool_name, {})
        if not tool:
            logger.warning(f"Tool not found: {tool_name}")
        return tool

    def get_openapi_schemas(self) -> List[Dict[str, Any]]:
        """Get OpenAPI schemas for function calling.
        
        Returns:
            List of OpenAPI-compatible schema definitions
        """
        schemas = [
            tool_info['schema'].schema 
            for tool_info in self.tools.values()
            if tool_info['schema'].schema_type == SchemaType.OPENAPI
        ]
        # logger.debug(f"Retrieved {len(schemas)} OpenAPI schemas")
        return schemas

    def get_usage_examples(self) -> Dict[str, str]:
        """Get usage examples for tools.
        
        Returns:
            Dict mapping function names to their usage examples
        """
        examples = {}
        
        # Get all registered tools and their schemas
        for tool_name, tool_info in self.tools.items():
            tool_instance = tool_info['instance']
            all_schemas = tool_instance.get_schemas()
            
            # Look for usage examples for this function
            if tool_name in all_schemas:
                for schema in all_schemas[tool_name]:
                    if schema.schema_type == SchemaType.USAGE_EXAMPLE:
                        examples[tool_name] = schema.schema.get('example', '')
                        # logger.debug(f"Found usage example for {tool_name}")
                        break
        
        # logger.debug(f"Retrieved {len(examples)} usage examples")
        return examples

    def get_filtered_schemas(self, query: str = "") -> List[Dict[str, Any]]:
        """Get balanced tool schemas - essential tools + query-specific tools."""
        if not query.strip():
            return self.get_openapi_schemas()

        query_lower = query.lower()

        # Essential tools that should ALWAYS be available (using ACTUAL registered tool names)
        essential_tools = [
            # Core communication & feedback
            'ask', 'complete',  # User communication

            # Web research (CONFIRMED available)
            'web_search', 'scrape_webpage',  # Web research

            # Task management (CONFIRMED available)
            'create_tasks', 'update_tasks', 'view_tasks',  # Task management

            # File operations (CONFIRMED available)
            'str_replace', 'create_file', 'edit_file',  # File operations
            'search_files', 'full_file_rewrite',  # Extended file ops

            # Browser operations
            'browser_navigate_to', 'browser_act', 'browser_extract_content',

            # Command execution
            'execute_command', 'check_command_output', 'terminate_command',

            # Image and media
            'load_image', 'image_search',

            # Utility
            'expand_message', 'wait'
        ]

        # Query-specific tool categories (using ACTUAL registered tool names)
        query_specific_categories = {
            'file_ops': ['delete_file', 'upload_file'],
            'git_ops': [],  # No git tools currently registered
            'browser_ops': ['browser_screenshot', 'web_browser_takeover'],
            'process_ops': ['list_commands'],
            'memory_ops': ['global_kb_create_folder', 'global_kb_list_contents', 'global_kb_upload_file'],
            'advanced_ops': ['designer_create_or_edit', 'image_edit_or_generate'],
            'data_ops': ['execute_data_provider_call', 'get_data_provider_endpoints'],
            'presentation_ops': ['create_presentation_outline', 'create_slide', 'present_presentation'],
            'document_ops': ['create_document', 'read_document', 'delete_document'],
            'sheet_ops': ['create_sheet', 'analyze_sheet', 'format_sheet', 'update_sheet', 'view_sheet']
        }

        # Start with essential tools
        relevant_tools = essential_tools.copy()

        # Add query-specific tools based on keywords
        if any(word in query_lower for word in ['file', 'code', 'edit', 'create', 'read', 'write', 'programming']):
            relevant_tools.extend(query_specific_categories['file_ops'])
        if any(word in query_lower for word in ['git', 'commit', 'branch', 'repository', 'version']):
            relevant_tools.extend(query_specific_categories['git_ops'])
        if any(word in query_lower for word in ['browser', 'chrome', 'navigate', 'click', 'website']):
            relevant_tools.extend(query_specific_categories['browser_ops'])
        if any(word in query_lower for word in ['run', 'execute', 'command', 'process', 'terminal']):
            relevant_tools.extend(query_specific_categories['process_ops'])
        if any(word in query_lower for word in ['memory', 'remember', 'knowledge', 'entity', 'kb']):
            relevant_tools.extend(query_specific_categories['memory_ops'])
        if any(word in query_lower for word in ['diagram', 'chart', 'visualization', 'design']):
            relevant_tools.extend(query_specific_categories['advanced_ops'])
        if any(word in query_lower for word in ['data', 'api', 'provider', 'endpoint']):
            relevant_tools.extend(query_specific_categories['data_ops'])
        if any(word in query_lower for word in ['presentation', 'slide', 'present']):
            relevant_tools.extend(query_specific_categories['presentation_ops'])
        if any(word in query_lower for word in ['document', 'doc', 'text']):
            relevant_tools.extend(query_specific_categories['document_ops'])
        if any(word in query_lower for word in ['sheet', 'spreadsheet', 'table', 'excel']):
            relevant_tools.extend(query_specific_categories['sheet_ops'])

        # Filter schemas - use exact matching for essential tools, partial for others
        filtered = []
        for tool_name, tool_info in self.tools.items():
            # Exact match for essential tools or partial match for query-specific tools
            if (tool_name in relevant_tools or
                any(relevant in tool_name or tool_name.startswith(relevant) for relevant in relevant_tools)):
                if tool_info['schema'].schema_type == SchemaType.OPENAPI:
                    filtered.append(tool_info['schema'].schema)

        logger.debug(f"Balanced tool filtering: {len(filtered)}/{len(self.tools)} tools for query: '{query[:50]}...'")
        return filtered

    def get_minimal_schemas(self, query_context: str = "") -> List[Dict[str, Any]]:
        """Get minimal tool schemas with only essential information."""

        full_schemas = self.get_filtered_schemas(query_context)
        minimal_schemas = []

        for schema in full_schemas:
            # Keep only essential fields
            minimal_schema = {
                'type': 'function',
                'function': {
                    'name': schema['function']['name'],
                    'description': self.compress_description(schema['function']['description']),
                    'parameters': self.compress_parameters(schema['function']['parameters'])
                }
            }
            minimal_schemas.append(minimal_schema)

        logger.debug(f"Schema compression: {len(full_schemas)} schemas minimized")
        return minimal_schemas

    def compress_description(self, description: str) -> str:
        """Compress tool description to essential information."""
        if not description:
            return description

        # Keep only first sentence or up to 60 characters
        sentences = description.split('.')
        if sentences and sentences[0]:
            first_sentence = sentences[0].strip()
            if len(first_sentence) <= 60:
                return first_sentence
            else:
                return first_sentence[:57] + '...'

        return description[:60] + ('...' if len(description) > 60 else '')

    def compress_parameters(self, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Compress parameter descriptions."""
        if not isinstance(parameters, dict) or 'properties' not in parameters:
            return parameters

        compressed_props = {}
        for prop_name, prop_info in parameters['properties'].items():
            if isinstance(prop_info, dict):
                compressed_props[prop_name] = {
                    'type': prop_info.get('type', 'string'),
                    'description': self.compress_description(prop_info.get('description', ''))
                }
            else:
                compressed_props[prop_name] = prop_info

        return {
            'type': parameters.get('type', 'object'),
            'properties': compressed_props,
            'required': parameters.get('required', [])
        }

