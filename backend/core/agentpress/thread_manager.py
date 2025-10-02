"""
Simplified conversation thread management system for AgentPress.
"""

import json
from typing import List, Dict, Any, Optional, Type, Union, AsyncGenerator, Literal, cast
from core.services.llm import make_llm_api_call, LLMError
from core.agentpress.prompt_caching import apply_anthropic_caching_strategy, validate_cache_blocks
from core.agentpress.tool import Tool
from core.agentpress.tool_registry import ToolRegistry
from core.agentpress.context_manager import ContextManager
from core.agentpress.response_processor import ResponseProcessor, ProcessorConfig
from core.agentpress.error_processor import ErrorProcessor
from core.services.supabase import DBConnection
from core.utils.logger import logger
from langfuse.client import StatefulGenerationClient, StatefulTraceClient
from core.services.langfuse import langfuse
from datetime import datetime, timezone
from core.billing.billing_integration import billing_integration

ToolChoice = Literal["auto", "required", "none"]

class ThreadManager:
    """Manages conversation threads with LLM models and tool execution."""

    def __init__(self, trace: Optional[StatefulTraceClient] = None, agent_config: Optional[dict] = None):
        self.db = DBConnection()
        self.tool_registry = ToolRegistry()
        
        self.trace = trace
        if not self.trace:
            self.trace = langfuse.trace(name="anonymous:thread_manager")
            
        self.agent_config = agent_config
        self.response_processor = ResponseProcessor(
            tool_registry=self.tool_registry,
            add_message_callback=self.add_message,
            trace=self.trace,
            agent_config=self.agent_config
        )

    def add_tool(self, tool_class: Type[Tool], function_names: Optional[List[str]] = None, **kwargs):
        """Add a tool to the ThreadManager."""
        self.tool_registry.register_tool(tool_class, function_names, **kwargs)

    async def create_thread(
        self,
        account_id: Optional[str] = None,
        project_id: Optional[str] = None,
        is_public: bool = False,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Create a new thread in the database."""
        # logger.debug(f"Creating new thread (account_id: {account_id}, project_id: {project_id})")
        client = await self.db.client

        thread_data = {'is_public': is_public, 'metadata': metadata or {}}
        if account_id:
            thread_data['account_id'] = account_id
        if project_id:
            thread_data['project_id'] = project_id

        try:
            result = await client.table('threads').insert(thread_data).execute()
            if result.data and len(result.data) > 0 and 'thread_id' in result.data[0]:
                thread_id = result.data[0]['thread_id']
                logger.info(f"Successfully created thread: {thread_id}")
                return thread_id
            else:
                raise Exception("Failed to create thread: no thread_id returned")
        except Exception as e:
            logger.error(f"Failed to create thread: {str(e)}", exc_info=True)
            raise Exception(f"Thread creation failed: {str(e)}")

    async def add_message(
        self,
        thread_id: str,
        type: str,
        content: Union[Dict[str, Any], List[Any], str],
        is_llm_message: bool = False,
        metadata: Optional[Dict[str, Any]] = None,
        agent_id: Optional[str] = None,
        agent_version_id: Optional[str] = None
    ):
        """Add a message to the thread in the database."""
        # logger.debug(f"Adding message of type '{type}' to thread {thread_id}")
        client = await self.db.client

        data_to_insert = {
            'thread_id': thread_id,
            'type': type,
            'content': content,
            'is_llm_message': is_llm_message,
            'metadata': metadata or {},
        }

        if agent_id:
            data_to_insert['agent_id'] = agent_id
        if agent_version_id:
            data_to_insert['agent_version_id'] = agent_version_id

        try:
            result = await client.table('messages').insert(data_to_insert).execute()
            # logger.debug(f"Successfully added message to thread {thread_id}")

            if result.data and len(result.data) > 0 and 'message_id' in result.data[0]:
                saved_message = result.data[0]
                
                # Handle billing for assistant response end messages
                if type == "assistant_response_end" and isinstance(content, dict):
                    await self._handle_billing(thread_id, content, saved_message)
                
                return saved_message
            else:
                logger.error(f"Insert operation failed for thread {thread_id}")
                return None
        except Exception as e:
            logger.error(f"Failed to add message to thread {thread_id}: {str(e)}", exc_info=True)
            raise

    async def _handle_billing(self, thread_id: str, content: dict, saved_message: dict):
        """Handle billing for LLM usage."""
        try:
            usage = content.get("usage", {})
            
            # DEBUG: Log the complete usage object to see what data we have
            logger.info(f"🔍 THREAD MANAGER USAGE: {usage}")
            logger.info(f"🔍 THREAD MANAGER CONTENT: {content}")
            
            prompt_tokens = int(usage.get("prompt_tokens", 0) or 0)
            completion_tokens = int(usage.get("completion_tokens", 0) or 0)
            
            # Try cache_read_input_tokens first (Anthropic standard), then fallback to prompt_tokens_details.cached_tokens
            cache_read_tokens = int(usage.get("cache_read_input_tokens", 0) or 0)
            if cache_read_tokens == 0:
                cache_read_tokens = int(usage.get("prompt_tokens_details", {}).get("cached_tokens", 0) or 0)
            
            cache_creation_tokens = int(usage.get("cache_creation_input_tokens", 0) or 0)
            model = content.get("model")
            
            # DEBUG: Log what we detected
            logger.info(f"🔍 CACHE DETECTION: cache_read={cache_read_tokens}, cache_creation={cache_creation_tokens}, prompt={prompt_tokens}")
            
            client = await self.db.client
            thread_row = await client.table('threads').select('account_id').eq('thread_id', thread_id).limit(1).execute()
            user_id = thread_row.data[0]['account_id'] if thread_row.data and len(thread_row.data) > 0 else None
            
            if user_id and (prompt_tokens > 0 or completion_tokens > 0):

                if cache_read_tokens > 0:
                    cache_hit_percentage = (cache_read_tokens / prompt_tokens * 100) if prompt_tokens > 0 else 0
                    logger.info(f"🎯 CACHE HIT: {cache_read_tokens}/{prompt_tokens} tokens ({cache_hit_percentage:.1f}%)")
                elif cache_creation_tokens > 0:
                    logger.info(f"💾 CACHE WRITE: {cache_creation_tokens} tokens stored for future use")
                else:
                    logger.debug(f"❌ NO CACHE: All {prompt_tokens} tokens processed fresh")

                deduct_result = await billing_integration.deduct_usage(
                    account_id=user_id,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    model=model or "unknown",
                    message_id=saved_message['message_id'],
                    cache_read_tokens=cache_read_tokens,
                    cache_creation_tokens=cache_creation_tokens
                )
                
                if deduct_result.get('success'):
                    logger.info(f"Successfully deducted ${deduct_result.get('cost', 0):.6f}")
                else:
                    logger.error(f"Failed to deduct credits: {deduct_result}")
        except Exception as e:
            logger.error(f"Error handling billing: {str(e)}", exc_info=True)

    async def get_llm_messages(self, thread_id: str) -> List[Dict[str, Any]]:
        """Get all messages for a thread."""
        logger.debug(f"Getting messages for thread {thread_id}")
        client = await self.db.client

        try:
            all_messages = []
            batch_size = 1000
            offset = 0
            
            while True:
                result = await client.table('messages').select('message_id, type, content').eq('thread_id', thread_id).eq('is_llm_message', True).order('created_at').range(offset, offset + batch_size - 1).execute()
                
                if not result.data:
                    break
                    
                all_messages.extend(result.data)
                if len(result.data) < batch_size:
                    break
                offset += batch_size

            if not all_messages:
                return []

            messages = []
            for item in all_messages:
                if isinstance(item['content'], str):
                    try:
                        parsed_item = json.loads(item['content'])
                        parsed_item['message_id'] = item['message_id']
                        messages.append(parsed_item)
                    except json.JSONDecodeError:
                        logger.error(f"Failed to parse message: {item['content']}")
                else:
                    content = item['content']
                    content['message_id'] = item['message_id']
                    messages.append(content)

            return messages

        except Exception as e:
            logger.error(f"Failed to get messages for thread {thread_id}: {str(e)}", exc_info=True)
            return []
    
    async def run_thread(
        self,
        thread_id: str,
        system_prompt: Dict[str, Any],
        stream: bool = True,
        temporary_message: Optional[Dict[str, Any]] = None,
        llm_model: str = "gpt-5",
        llm_temperature: float = 0,
        llm_max_tokens: Optional[int] = None,
        processor_config: Optional[ProcessorConfig] = None,
        tool_choice: ToolChoice = "auto",
        native_max_auto_continues: int = 25,
        max_xml_tool_calls: int = 0,
        enable_thinking: Optional[bool] = False,
        reasoning_effort: Optional[str] = 'low',
        generation: Optional[StatefulGenerationClient] = None,
        enable_prompt_caching: bool = True,
        enable_context_manager: Optional[bool] = None,
    ) -> Union[Dict[str, Any], AsyncGenerator]:
        """Run a conversation thread with LLM integration and tool execution."""
        logger.debug(f"🚀 Starting thread execution for {thread_id} with model {llm_model}")

        # Phase 1 Task 1.1.2: Add Comprehensive Request Logging
        try:
            import sentry_sdk
            from datetime import datetime
            sentry_sdk.set_context("prompt_request", {
                "thread_id": thread_id,
                "model": llm_model,
                "prompt_size": len(system_prompt.get('content', '')),
                "cache_enabled": enable_prompt_caching,
                "tool_count": len(processor_config.tools) if processor_config and processor_config.tools else 0,
                "timestamp": datetime.now().isoformat()
            })
            sentry_sdk.capture_message(
                f"Prompt Request: {llm_model}, {len(system_prompt.get('content', ''))} chars",
                level="info"
            )
        except Exception as e:
            logger.warning(f"Failed to log request to GlitchTip: {e}")

        # NOTE: Moved GlitchTip logging to AFTER optimization (line ~575)
        # to log the FINAL context sent to LLM, not the initial context

        # Ensure we have a valid ProcessorConfig object FIRST (before dynamic routing)
        if processor_config is None:
            config = ProcessorConfig()
        elif isinstance(processor_config, ProcessorConfig):
            config = processor_config
        else:
            logger.error(f"Invalid processor_config type: {type(processor_config)}, creating default")
            config = ProcessorConfig()

        # Phase 3 Task 3.1.2: Dynamic Prompt Routing
        # Use modular prompt builder with dynamic routing
        use_dynamic_routing = True  # Feature flag

        if use_dynamic_routing:
            try:
                from core.prompts.router import get_router
                from core.prompts.module_manager import get_prompt_builder

                # Get user query for routing
                user_query = ""
                if temporary_message:
                    user_query = temporary_message.get('content', '')
                else:
                    # Get last user message from thread
                    messages_for_routing = await self.get_llm_messages(thread_id)
                    for msg in reversed(messages_for_routing):
                        if isinstance(msg, dict) and msg.get('role') == 'user':
                            user_query = str(msg.get('content', ''))
                            break

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
                else:
                    logger.debug("🧭 No user query found, using original system prompt")

            except Exception as e:
                logger.warning(f"Dynamic routing failed, using original prompt: {e}")

        # Determine if context manager should be used (default to True)
        use_context_manager = enable_context_manager if enable_context_manager is not None else True
        logger.info(f"🔧 THREAD MANAGER DEBUG: enable_context_manager={enable_context_manager}, use_context_manager={use_context_manager}")
            
        if max_xml_tool_calls > 0 and not config.max_xml_tool_calls:
            config.max_xml_tool_calls = max_xml_tool_calls

        auto_continue_state = {
            'count': 0,
            'active': True,
            'continuous_state': {'accumulated_content': '', 'thread_run_id': None}
        }

        # Single execution if auto-continue is disabled
        if native_max_auto_continues == 0:
            result = await self._execute_run(
                thread_id, system_prompt, llm_model, llm_temperature, llm_max_tokens,
                tool_choice, config, stream, enable_thinking, reasoning_effort,
                generation, auto_continue_state, temporary_message, enable_prompt_caching,
                use_context_manager
            )
            
            # If result is an error dict, convert it to a generator that yields the error
            if isinstance(result, dict) and result.get("status") == "error":
                return self._create_single_error_generator(result)
            
            return result

        # Auto-continue execution
        return self._auto_continue_generator(
            thread_id, system_prompt, llm_model, llm_temperature, llm_max_tokens,
            tool_choice, config, stream, enable_thinking, reasoning_effort,
            generation, auto_continue_state, temporary_message,
            native_max_auto_continues, enable_prompt_caching, use_context_manager
        )

    async def _execute_run(
        self, thread_id: str, system_prompt: Dict[str, Any], llm_model: str,
        llm_temperature: float, llm_max_tokens: Optional[int], tool_choice: ToolChoice,
        config: ProcessorConfig, stream: bool, enable_thinking: Optional[bool],
        reasoning_effort: Optional[str], generation: Optional[StatefulGenerationClient],
        auto_continue_state: Dict[str, Any], temporary_message: Optional[Dict[str, Any]] = None,
        enable_prompt_caching: bool = False, use_context_manager: bool = True
    ) -> Union[Dict[str, Any], AsyncGenerator]:
        """Execute a single LLM run."""
        
        # CRITICAL: Ensure config is always a ProcessorConfig object
        if not isinstance(config, ProcessorConfig):
            logger.error(f"ERROR: config is {type(config)}, expected ProcessorConfig. Value: {config}")
            config = ProcessorConfig()  # Create new instance as fallback
            
        try:
            # Get and prepare messages
            messages = await self.get_llm_messages(thread_id)

            # Handle auto-continue context
            if auto_continue_state['count'] > 0 and auto_continue_state['continuous_state'].get('accumulated_content'):
                partial_content = auto_continue_state['continuous_state']['accumulated_content']
                messages.append({"role": "assistant", "content": partial_content})

            # 📊 LOG STAGE 1: Original context from DB
            from litellm import token_counter
            original_token_count = token_counter(model=llm_model, messages=messages)
            logger.info(f"📊 CONTEXT STAGE 1 - Original from DB: {len(messages)} messages, {original_token_count} tokens")

            # Log to GlitchTip for analysis
            try:
                import sentry_sdk
                sentry_sdk.capture_message(
                    f"Context Optimization - Stage 1: Original",
                    level="info",
                    extras={
                        "stage": "1_original",
                        "thread_id": thread_id,
                        "message_count": len(messages),
                        "token_count": original_token_count,
                        "messages_preview": [
                            {
                                "role": msg.get("role"),
                                "content_length": len(str(msg.get("content", ""))),
                                "content_preview": str(msg.get("content", ""))[:200]
                            }
                            for msg in messages[:5]  # First 5 messages
                        ]
                    }
                )
            except Exception as e:
                logger.warning(f"Failed to log to GlitchTip: {e}")

            # Apply context compression if enabled
            if use_context_manager:
                logger.debug(f"Context manager enabled, compressing {len(messages)} messages")
                ctx_mgr = ContextManager()
                compressed_messages = ctx_mgr.compress_messages(
                    messages, llm_model, max_tokens=llm_max_tokens
                )
                logger.debug(f"Context compression completed: {len(messages)} -> {len(compressed_messages)} messages")
                messages = compressed_messages

                # 📊 LOG STAGE 2: After context manager compression
                compressed_token_count = token_counter(model=llm_model, messages=messages)
                reduction_ratio = ((original_token_count - compressed_token_count) / original_token_count * 100) if original_token_count > 0 else 0
                logger.info(f"📊 CONTEXT STAGE 2 - After compression: {len(messages)} messages, {compressed_token_count} tokens ({reduction_ratio:.1f}% reduction)")

                # Log to GlitchTip
                try:
                    import sentry_sdk
                    sentry_sdk.capture_message(
                        f"Context Optimization - Stage 2: After Compression",
                        level="info",
                        extras={
                            "stage": "2_compressed",
                            "thread_id": thread_id,
                            "message_count": len(messages),
                            "token_count": compressed_token_count,
                            "original_token_count": original_token_count,
                            "reduction_ratio": f"{reduction_ratio:.1f}%",
                            "messages_preview": [
                                {
                                    "role": msg.get("role"),
                                    "content_length": len(str(msg.get("content", ""))),
                                    "content_preview": str(msg.get("content", ""))[:200]
                                }
                                for msg in messages[:5]
                            ]
                        }
                    )
                except Exception as e:
                    logger.warning(f"Failed to log to GlitchTip: {e}")
            else:
                logger.debug("Context manager disabled, using raw messages")

            # Phase 1 Task 1.2.1: DISABLE aggressive optimization (broke tool calling)
            # TEMPORARY FIX: Use original system prompt without optimization
            logger.info(f"🔧 OPTIMIZATION DEBUG: use_context_manager={use_context_manager}")
            optimized_system_prompt = system_prompt
            original_system_prompt_length = len(system_prompt.get('content', '')) if isinstance(system_prompt, dict) else 0

            logger.info(f"📝 Using original system prompt (optimization disabled): {original_system_prompt_length} chars")

            # Log to GlitchTip
            try:
                import sentry_sdk
                sentry_sdk.capture_message(
                    "Optimization disabled - using original prompt",
                    level="info",
                    extras={"prompt_size": original_system_prompt_length}
                )
            except Exception as e:
                logger.warning(f"Failed to log optimization status to GlitchTip: {e}")

            # COMMENTED OUT: Aggressive optimization (99.8% reduction broke tool calling)
            # try:
            #     ctx_optimizer = ContextManager()
            #     user_query = ""
            #     if messages:
            #         for msg in reversed(messages):
            #             if isinstance(msg, dict) and msg.get('role') == 'user':
            #                 user_query = str(msg.get('content', ''))[:200]
            #                 break
            #
            #     if user_query and system_prompt and isinstance(system_prompt, dict):
            #         original_content = system_prompt.get('content', '')
            #         optimized_content = ctx_optimizer.get_optimized_system_prompt(user_query, original_content)
            #         optimized_system_prompt = system_prompt.copy()
            #         optimized_system_prompt['content'] = optimized_content
            # except Exception as e:
            #     logger.warning(f"System prompt optimization failed: {e}")
            #     optimized_system_prompt = system_prompt

            # Apply caching if enabled
            if enable_prompt_caching:
                prepared_messages = apply_anthropic_caching_strategy(optimized_system_prompt, messages, llm_model)
                prepared_messages = validate_cache_blocks(prepared_messages, llm_model)
            else:
                prepared_messages = [optimized_system_prompt] + messages

            # Get tool schemas if needed with query-based filtering
            openapi_tool_schemas = None
            original_tool_count = 0
            if config.native_tool_calling:
                # Get user query for tool filtering
                user_query = ""
                if messages:
                    for msg in reversed(messages):
                        if isinstance(msg, dict) and msg.get('role') == 'user':
                            user_query = str(msg.get('content', ''))[:200]  # First 200 chars
                            break

                # Get original tool count before filtering
                original_tool_count = len(self.tool_registry.get_openapi_schemas())

                # Use balanced schemas (essential + query-specific tools)
                openapi_tool_schemas = self.tool_registry.get_filtered_schemas(user_query)

                # For v98store models, limit to 3 tools with smart selection
                # v98store gpt-4o supports native tool calling with up to 3 tools
                if llm_model.startswith("openai-compatible/") and openapi_tool_schemas and len(openapi_tool_schemas) > 3:
                    logger.info(f"🔧 Limiting tools for v98store model {llm_model}: {len(openapi_tool_schemas)} → 3 tools")

                    # Smart tool selection based on query keywords
                    query_lower = user_query.lower() if user_query else ""
                    priority_tools = []

                    # Priority 1: Search-related queries
                    if any(keyword in query_lower for keyword in ['search', 'tìm kiếm', 'find', 'research', 'look up', 'tra cứu']):
                        web_search = next((t for t in openapi_tool_schemas if t.get("function", {}).get("name") == "web_search"), None)
                        if web_search and web_search not in priority_tools:
                            priority_tools.append(web_search)
                            logger.debug(f"🎯 Priority tool added: web_search (search query detected)")

                    # Priority 2: Task management queries
                    if any(keyword in query_lower for keyword in ['task', 'todo', 'create', 'tạo', 'add', 'thêm']):
                        create_tasks = next((t for t in openapi_tool_schemas if t.get("function", {}).get("name") == "create_tasks"), None)
                        if create_tasks and create_tasks not in priority_tools:
                            priority_tools.append(create_tasks)
                            logger.debug(f"🎯 Priority tool added: create_tasks (task query detected)")

                    # Priority 3: Command execution queries
                    if any(keyword in query_lower for keyword in ['run', 'execute', 'command', 'chạy', 'thực thi']):
                        execute_command = next((t for t in openapi_tool_schemas if t.get("function", {}).get("name") == "execute_command"), None)
                        if execute_command and execute_command not in priority_tools:
                            priority_tools.append(execute_command)
                            logger.debug(f"🎯 Priority tool added: execute_command (command query detected)")

                    # Fill remaining slots with top filtered tools
                    for tool in openapi_tool_schemas:
                        if tool not in priority_tools and len(priority_tools) < 3:
                            priority_tools.append(tool)

                    openapi_tool_schemas = priority_tools[:3]

                # Log which tools were selected
                if openapi_tool_schemas:
                    tool_names = [t.get("function", {}).get("name", "unknown") for t in openapi_tool_schemas]
                    logger.info(f"🔧 Tools enabled for model {llm_model}: {len(openapi_tool_schemas)} tools - {tool_names}")
                else:
                    logger.info(f"🔧 Tools enabled for model {llm_model}: 0 tools")

            # 📊 LOG STAGE 3: Final optimized context (with system prompt + tools)
            from litellm import token_counter
            final_token_count = token_counter(model=llm_model, messages=prepared_messages)
            tool_count = len(openapi_tool_schemas) if openapi_tool_schemas else 0

            # Calculate tool reduction ratio
            tool_reduction_ratio = ((original_tool_count - tool_count) / original_tool_count * 100) if original_tool_count > 0 else 0

            # Calculate overall reduction from original
            overall_reduction = ((original_token_count - final_token_count) / original_token_count * 100) if original_token_count > 0 else 0

            logger.info(f"📊 CONTEXT STAGE 3 - Final optimized: {len(prepared_messages)} messages, {final_token_count} tokens, {tool_count} tools")
            logger.info(f"📊 OVERALL OPTIMIZATION: {original_token_count} → {final_token_count} tokens ({overall_reduction:.1f}% reduction)")
            logger.info(f"📊 TOOL FILTERING: {original_tool_count} → {tool_count} tools ({tool_reduction_ratio:.1f}% reduction)")

            # Log to GlitchTip
            try:
                import sentry_sdk
                sentry_sdk.capture_message(
                    f"Context Optimization - Stage 3: Final Optimized",
                    level="info",
                    extras={
                        "stage": "3_final_optimized",
                        "thread_id": thread_id,
                        "message_count": len(prepared_messages),
                        "token_count": final_token_count,
                        "original_token_count": original_token_count,
                        "overall_reduction_ratio": f"{overall_reduction:.1f}%",
                        "tool_count": tool_count,
                        "original_tool_count": original_tool_count,
                        "tool_reduction_ratio": f"{tool_reduction_ratio:.1f}%",
                        "system_prompt_original_length": original_system_prompt_length,
                        "system_prompt_optimized_length": len(optimized_system_prompt.get('content', '')) if isinstance(optimized_system_prompt, dict) else 0,
                        "prompt_caching_enabled": enable_prompt_caching,
                        "context_manager_enabled": use_context_manager,
                        "optimization_features": {
                            "context_compression": use_context_manager,
                            "system_prompt_optimization": True,
                            "tool_filtering": config.native_tool_calling,
                            "prompt_caching": enable_prompt_caching
                        },
                        "messages_preview": [
                            {
                                "role": msg.get("role"),
                                "content_length": len(str(msg.get("content", ""))),
                                "content_preview": str(msg.get("content", ""))[:200],
                                "has_cache_control": "cache_control" in msg if isinstance(msg, dict) else False
                            }
                            for msg in prepared_messages[:5]
                        ]
                    }
                )
            except Exception as e:
                logger.warning(f"Failed to log to GlitchTip: {e}")

            # Update generation tracking
            if generation:
                try:
                    generation.update(
                        input=prepared_messages,
                        start_time=datetime.now(timezone.utc),
                        model=llm_model,
                        model_parameters={
                            "max_tokens": llm_max_tokens,
                            "temperature": llm_temperature,
                            "enable_thinking": enable_thinking,
                            "reasoning_effort": reasoning_effort,
                            "tool_choice": tool_choice,
                            "tools": openapi_tool_schemas,
                        }
                    )
                except Exception as e:
                    logger.warning(f"Failed to update Langfuse generation: {e}")

            # Phase 1 Task 1.1.2: Log FINAL request metrics to GlitchTip (AFTER optimization)
            try:
                import sentry_sdk
                from datetime import datetime
                from litellm import token_counter

                # Calculate FINAL token count (what's actually sent to LLM)
                final_token_count = token_counter(model=llm_model, messages=prepared_messages)
                final_tool_count = len(openapi_tool_schemas) if openapi_tool_schemas else 0

                sentry_sdk.set_context("prompt_request", {
                    "thread_id": thread_id,
                    "model": llm_model,
                    "prompt_size": final_token_count,  # Use token count, not char count
                    "cache_enabled": enable_prompt_caching,
                    "tool_count": final_tool_count,
                    "temperature": llm_temperature,
                    "max_tokens": llm_max_tokens,
                    "timestamp": datetime.now().isoformat(),
                    "message_count": len(prepared_messages),
                    "native_tool_calling": config.native_tool_calling
                })
                sentry_sdk.capture_message(
                    f"Prompt Request: {llm_model}, {final_token_count} tokens, {final_tool_count} tools",
                    level="info"
                )
                logger.debug(f"📊 FINAL Request logged to GlitchTip: {final_token_count} tokens, {final_tool_count} tools")
            except Exception as e:
                logger.warning(f"Failed to log final request to GlitchTip: {e}")

            # Make LLM call
            try:
                llm_response = await make_llm_api_call(
                    prepared_messages, llm_model,
                    temperature=llm_temperature,
                    max_tokens=llm_max_tokens,
                    tools=openapi_tool_schemas,
                    tool_choice=tool_choice if config.native_tool_calling else "none",
                    stream=stream,
                    enable_thinking=enable_thinking,
                    reasoning_effort=reasoning_effort
                )
            except LLMError as e:
                return {"type": "status", "status": "error", "message": str(e)}

            # Check for error response
            if isinstance(llm_response, dict) and llm_response.get("status") == "error":
                return llm_response

            # Process response - ensure config is ProcessorConfig object
            # logger.debug(f"Config type before response processing: {type(config)}")
            # if not isinstance(config, ProcessorConfig):
            #     logger.error(f"Config is not ProcessorConfig! Type: {type(config)}, Value: {config}")
            #     config = ProcessorConfig()  # Fallback
                
            if stream and hasattr(llm_response, '__aiter__'):
                return self.response_processor.process_streaming_response(
                    cast(AsyncGenerator, llm_response), thread_id, prepared_messages,
                    llm_model, config, True,
                    auto_continue_state['count'], auto_continue_state['continuous_state'],
                    generation
                )
            else:
                return self.response_processor.process_non_streaming_response(
                    llm_response, thread_id, prepared_messages, llm_model, config, generation
                )

        except Exception as e:
            processed_error = ErrorProcessor.process_system_error(e, context={"thread_id": thread_id})
            ErrorProcessor.log_error(processed_error)
            return processed_error.to_stream_dict()

    async def _auto_continue_generator(
        self, thread_id: str, system_prompt: Dict[str, Any], llm_model: str,
        llm_temperature: float, llm_max_tokens: Optional[int], tool_choice: ToolChoice,
        config: ProcessorConfig, stream: bool, enable_thinking: Optional[bool],
        reasoning_effort: Optional[str], generation: Optional[StatefulGenerationClient],
        auto_continue_state: Dict[str, Any], temporary_message: Optional[Dict[str, Any]],
        native_max_auto_continues: int, enable_prompt_caching: bool = False,
        use_context_manager: bool = True
    ) -> AsyncGenerator:
        """Generator that handles auto-continue logic."""
        logger.debug(f"Starting auto-continue generator, max: {native_max_auto_continues}")
        # logger.debug(f"Config type in auto-continue generator: {type(config)}")
        
        # Ensure config is valid ProcessorConfig
        if not isinstance(config, ProcessorConfig):
            logger.error(f"Invalid config type in auto-continue: {type(config)}, creating new one")
            config = ProcessorConfig()
        
        while auto_continue_state['active'] and auto_continue_state['count'] < native_max_auto_continues:
            auto_continue_state['active'] = False  # Reset for this iteration
            
            try:
                response_gen = await self._execute_run(
                    thread_id, system_prompt, llm_model, llm_temperature, llm_max_tokens,
                    tool_choice, config, stream, enable_thinking, reasoning_effort,
                    generation, auto_continue_state,
                    temporary_message if auto_continue_state['count'] == 0 else None,
                    enable_prompt_caching, use_context_manager
                )

                # Handle error responses
                if isinstance(response_gen, dict) and response_gen.get("status") == "error":
                    yield response_gen
                    break

                # Process streaming response
                if hasattr(response_gen, '__aiter__'):
                    async for chunk in cast(AsyncGenerator, response_gen):
                        # Check for auto-continue triggers
                        should_continue = self._check_auto_continue_trigger(
                            chunk, auto_continue_state, native_max_auto_continues
                        )
                        
                        # Skip finish chunks that trigger auto-continue
                        if should_continue:
                            if chunk.get('type') == 'finish' and chunk.get('finish_reason') == 'tool_calls':
                                continue
                            elif chunk.get('type') == 'status':
                                try:
                                    content = json.loads(chunk.get('content', '{}'))
                                    if content.get('finish_reason') == 'length':
                                        continue
                                except (json.JSONDecodeError, TypeError):
                                    pass
                        
                        yield chunk
                else:
                    yield response_gen

                if not auto_continue_state['active']:
                    break

            except Exception as e:
                if "AnthropicException - Overloaded" in str(e):
                    logger.error(f"Anthropic overloaded, falling back to OpenRouter")
                    llm_model = f"openrouter/{llm_model.replace('-20250514', '')}"
                    auto_continue_state['active'] = True
                    continue
                else:
                    processed_error = ErrorProcessor.process_system_error(e, context={"thread_id": thread_id})
                    ErrorProcessor.log_error(processed_error)
                    yield processed_error.to_stream_dict()
                    return

        # Handle max iterations reached
        if auto_continue_state['active'] and auto_continue_state['count'] >= native_max_auto_continues:
            logger.warning(f"Reached maximum auto-continue limit ({native_max_auto_continues})")
            yield {
                "type": "content",
                "content": f"\n[Agent reached maximum auto-continue limit of {native_max_auto_continues}]"
            }

    def _check_auto_continue_trigger(
        self, chunk: Dict[str, Any], auto_continue_state: Dict[str, Any],
        native_max_auto_continues: int
    ) -> bool:
        """Check if a response chunk should trigger auto-continue."""
        # Initialize tool_call_count if not present
        if 'tool_call_count' not in auto_continue_state:
            auto_continue_state['tool_call_count'] = 0

        # Maximum tool calls per query (to prevent infinite loops)
        MAX_TOOL_CALLS_PER_QUERY = 5

        if chunk.get('type') == 'finish':
            if chunk.get('finish_reason') == 'tool_calls':
                # Increment tool call counter
                auto_continue_state['tool_call_count'] += 1
                tool_call_count = auto_continue_state['tool_call_count']

                # Check if max tool calls reached
                if tool_call_count >= MAX_TOOL_CALLS_PER_QUERY:
                    logger.warning(f"⚠️ Max tool calls ({MAX_TOOL_CALLS_PER_QUERY}) reached. Stopping auto-continue to force final response.")
                    auto_continue_state['active'] = False
                    return False

                if native_max_auto_continues > 0:
                    logger.debug(f"Auto-continuing for tool_calls (tool call {tool_call_count}/{MAX_TOOL_CALLS_PER_QUERY}, iteration {auto_continue_state['count'] + 1}/{native_max_auto_continues})")
                    auto_continue_state['active'] = True
                    auto_continue_state['count'] += 1
                    return True
            elif chunk.get('finish_reason') == 'xml_tool_limit_reached':
                logger.debug("Stopping auto-continue due to XML tool limit")
                auto_continue_state['active'] = False

        elif chunk.get('type') == 'status':
            try:
                content = json.loads(chunk.get('content', '{}'))
                if content.get('finish_reason') == 'length':
                    logger.debug(f"Auto-continuing for length limit ({auto_continue_state['count'] + 1}/{native_max_auto_continues})")
                    auto_continue_state['active'] = True
                    auto_continue_state['count'] += 1
                    return True
            except (json.JSONDecodeError, TypeError):
                pass
                
        return False

    async def _create_single_error_generator(self, error_dict: Dict[str, Any]):
        """Create an async generator that yields a single error message."""
        yield error_dict