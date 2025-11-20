"""
LLM API interface for making calls to various language models.

This module provides a unified interface for making API calls to different LLM providers
using LiteLLM with simplified error handling and clean parameter management.
"""

from typing import Union, Dict, Any, Optional, AsyncGenerator, List
import os
import asyncio
import time
import litellm
from litellm.router import Router
from litellm.files.main import ModelResponse
from core.utils.logger import logger
from core.utils.config import config
from core.agentpress.error_processor import ErrorProcessor

# Story 1.3: Anthropic Explicit Caching
def _is_anthropic_model(model_name: str) -> bool:
    """
    Check if model is an Anthropic Claude model (Story 1.3).
    
    Supports both direct Anthropic API models and Bedrock-served Claude models.
    
    Detection strategy:
    1. Check for Anthropic/Claude keywords in model name
    2. Check model registry for aliases (for Bedrock ARNs)
    """
    if not model_name:
        return False
    
    resolved_model = model_name.lower()
    
    # Direct keyword check (works for resolved model names)
    if any(keyword in resolved_model for keyword in ['anthropic', 'claude', 'sonnet', 'haiku', 'opus']):
        return True
    
    # Check model registry for Bedrock ARNs (more robust)
    try:
        from core.ai_models import registry
        model = registry.get(model_name)
        if model:
            # Check if the resolved model ID contains Anthropic keywords
            resolved_id = model.id.lower()
            if any(keyword in resolved_id for keyword in ['anthropic', 'claude', 'sonnet', 'haiku', 'opus']):
                return True
            # Check if provider is Anthropic
            if hasattr(model, 'provider') and str(model.provider).lower() == 'anthropic':
                return True
    except Exception as e:
        # If registry lookup fails, fall back to keyword detection only
        logger.debug(f"Model registry lookup failed for {model_name}: {e}")
    
    return False


def _add_anthropic_cache_control(messages: List[Dict[str, Any]], model_name: str) -> List[Dict[str, Any]]:
    """
    Add cache_control directives to system messages for Claude models (Story 1.3).
    
    Anthropic explicit caching requires cache_control in message content format:
    {"type": "text", "text": content, "cache_control": {"type": "ephemeral"}}
    
    Only applies to system messages with ≥1024 tokens (Anthropic's minimum cacheable size).
    """
    if not _is_anthropic_model(model_name):
        return messages
    
    # Check if caching is enabled
    cache_enabled = getattr(config, 'ANTHROPIC_CACHE_ENABLED', True)
    if not cache_enabled:
        logger.debug(f"Anthropic caching disabled for {model_name}")
        return messages
    
    # Process messages to add cache_control to system messages
    processed_messages = []
    for message in messages:
        role = message.get('role', '')
        content = message.get('content', '')
        
        # Only add cache_control to system messages
        if role == 'system':
            # Check if already has cache_control
            if isinstance(content, list):
                if content and isinstance(content[0], dict) and 'cache_control' in content[0]:
                    # Already has cache_control, keep as-is
                    processed_messages.append(message)
                    continue
                # Extract text content from list format
                text_content = ""
                for item in content:
                    if isinstance(item, dict) and item.get('type') == 'text':
                        text_content += item.get('text', '')
                content = text_content
            
            # Accurate token counting for Anthropic models (Story 1.3 - Minor Recommendation)
            # Use litellm.token_counter for accurate token counting
            try:
                from litellm import token_counter
                # Use the model name for accurate token counting
                estimated_tokens = token_counter(model=model_name, text=str(content))
                logger.debug(f"Token count for system message: {estimated_tokens} tokens (accurate)")
            except Exception as e:
                # Fallback to rough estimation if token counting fails
                logger.debug(f"Accurate token counting failed, using fallback: {e}")
                estimated_tokens = len(str(content)) / 4  # Rough estimate: ~4 chars per token
            
            if estimated_tokens >= 1024:  # Anthropic's minimum cacheable size
                # Add cache_control directive
                processed_messages.append({
                    "role": role,
                    "content": [
                        {
                            "type": "text",
                            "text": str(content),
                            "cache_control": {"type": "ephemeral"}
                        }
                    ]
                })
                logger.debug(f"✅ Added cache_control to system message for {model_name} ({estimated_tokens:.0f} estimated tokens)")
            else:
                # System message too small for caching
                processed_messages.append(message)
                logger.debug(f"System message too small for caching: {estimated_tokens:.0f} estimated tokens")
        else:
            # Non-system messages: keep as-is
            processed_messages.append(message)
    
    return processed_messages

# Configure LiteLLM
# os.environ['LITELLM_LOG'] = 'DEBUG'
# litellm.set_verbose = True  # Enable verbose logging
litellm.modify_params = True
litellm.drop_params = True

# Enable additional debug logging
# import logging
# litellm_logger = logging.getLogger("LiteLLM")
# litellm_logger.setLevel(logging.DEBUG)

# Constants
MAX_RETRIES = 3
provider_router = None
_litellm_cache_configured = False


class LLMError(Exception):
    """Exception for LLM-related errors."""
    pass

async def _perform_cache_health_check() -> None:
    """Perform cache health check (async helper)."""
    try:
        from core.services.cache_metrics import check_cache_health
        health_status = await check_cache_health()
        if health_status.get('healthy'):
            logger.info("✅ LiteLLM cache health check passed")
        else:
            logger.warning(
                f"⚠️ LiteLLM cache health check failed: {health_status.get('details', {})}"
            )
    except Exception as e:
        logger.debug(f"Cache health check error (non-critical): {e}")


def setup_litellm_redis_cache() -> None:
    """
    Configure LiteLLM Redis caching for exact match responses (Story 1.2).
    
    This enables LiteLLM to cache LLM responses in Redis for exact query matches,
    reducing API calls by 10-20% without quality impact.
    """
    global _litellm_cache_configured
    
    if _litellm_cache_configured:
        return  # Already configured
    
    if not config:
        logger.warning("Config not loaded - skipping LiteLLM cache setup")
        return
    
    # Check if caching is enabled
    cache_enabled = getattr(config, 'LITELLM_CACHE_ENABLED', True)
    if not cache_enabled:
        logger.info("LiteLLM Redis caching is disabled (LITELLM_CACHE_ENABLED=False)")
        # Explicitly disable cache to prevent LiteLLM from using it
        import litellm
        litellm.cache = None
        _litellm_cache_configured = True
        return
    
    try:
        # Get Redis configuration
        redis_host = getattr(config, 'REDIS_HOST', 'localhost')
        redis_port = getattr(config, 'REDIS_PORT', 6379)
        redis_password = getattr(config, 'REDIS_PASSWORD', None)
        cache_ttl = getattr(config, 'LITELLM_CACHE_TTL', 3600)  # Default 1 hour
        
        # Configure LiteLLM Redis cache (exact match only, not semantic)
        # Use environment variables for LiteLLM cache configuration
        # LiteLLM reads these automatically when cache_type="redis"
        os.environ['LITELLM_CACHE_TYPE'] = 'redis'  # Exact match only (not redis-semantic)
        os.environ['LITELLM_CACHE_HOST'] = str(redis_host)
        os.environ['LITELLM_CACHE_PORT'] = str(redis_port)
        if redis_password:
            os.environ['LITELLM_CACHE_PASSWORD'] = redis_password
        os.environ['LITELLM_CACHE_TTL_SECONDS'] = str(cache_ttl)
        
        # Set cache namespace prefix to prevent conflicts with other Redis keys
        os.environ['LITELLM_CACHE_KEY_PREFIX'] = 'litellm:cache:'
        
        # Initialize LiteLLM cache using Cache class
        # LiteLLM supports Redis caching via Cache or RedisCache class
        try:
            # Try RedisCache first (more specific)
            try:
                from litellm import RedisCache
                litellm.cache = RedisCache(
                    host=redis_host,
                    port=redis_port,
                    password=redis_password,
                    ttl=cache_ttl,
                )
            except (ImportError, AttributeError):
                # Fallback to Cache class
                from litellm import Cache
                litellm.cache = Cache(
                    type="redis",
                    host=redis_host,
                    port=redis_port,
                    password=redis_password,
                    ttl=cache_ttl,
                )
        except Exception as e:
            # Fallback: Use environment variables only (LiteLLM will read them)
            logger.debug(f"LiteLLM Cache class not available ({e}), using environment variables only")
        
        _litellm_cache_configured = True
        logger.info(
            f"✅ LiteLLM Redis caching configured: "
            f"host={redis_host}, port={redis_port}, ttl={cache_ttl}s, "
            f"namespace=litellm:cache:"
        )
        
        # Minor Recommendation: Cache Health Check (deferred to first use)
        # Health check will be performed when cache is first used
        logger.debug("Cache health check will be performed on first cache operation")
        
    except Exception as e:
        logger.warning(f"Failed to configure LiteLLM Redis caching: {e}. Continuing without cache.")
        _litellm_cache_configured = True  # Mark as configured to avoid repeated attempts


def setup_api_keys() -> None:
    """Set up API keys from environment variables."""
    if not config:
        logger.warning("Config not loaded - skipping API key setup")
        return
        
    providers = [
        "OPENAI",
        "ANTHROPIC",
        "GROQ",
        "OPENROUTER",
        "XAI",
        "MORPH",
        "GEMINI",
        "OPENAI_COMPATIBLE",
    ]
    
    for provider in providers:
        try:
            key = getattr(config, f"{provider}_API_KEY", None)
            if key:
                # logger.debug(f"API key set for provider: {provider}")
                pass
            else:
                logger.debug(f"No API key found for provider: {provider} (this is normal if not using this provider)")
        except AttributeError as e:
            logger.debug(f"Could not access {provider}_API_KEY: {e}")

    # Set up OpenRouter API base if not already set
    if hasattr(config, 'OPENROUTER_API_KEY') and hasattr(config, 'OPENROUTER_API_BASE'):
        if config.OPENROUTER_API_KEY and config.OPENROUTER_API_BASE:
            os.environ["OPENROUTER_API_BASE"] = config.OPENROUTER_API_BASE
            # logger.debug(f"Set OPENROUTER_API_BASE to {config.OPENROUTER_API_BASE}")

    # Set up AWS Bedrock bearer token authentication
    if hasattr(config, 'AWS_BEARER_TOKEN_BEDROCK'):
        bedrock_token = config.AWS_BEARER_TOKEN_BEDROCK
        if bedrock_token:
            os.environ["AWS_BEARER_TOKEN_BEDROCK"] = bedrock_token
            logger.debug("AWS Bedrock bearer token configured")
        else:
            logger.debug("AWS_BEARER_TOKEN_BEDROCK not configured - Bedrock models will not be available")

def setup_provider_router(openai_compatible_api_key: str = None, openai_compatible_api_base: str = None):
    global provider_router
    
    # Get config values safely
    config_openai_key = getattr(config, 'OPENAI_COMPATIBLE_API_KEY', None) if config else None
    config_openai_base = getattr(config, 'OPENAI_COMPATIBLE_API_BASE', None) if config else None
    
    model_list = [
        {
            "model_name": "openai-compatible/*", # support OpenAI-Compatible LLM provider
            "litellm_params": {
                "model": "openai/*",
                "api_key": openai_compatible_api_key or config_openai_key,
                "api_base": openai_compatible_api_base or config_openai_base,
            },
        },
        {
            "model_name": "*", # supported LLM provider by LiteLLM
            "litellm_params": {
                "model": "*",
            },
        },
    ]
    
    fallbacks = [
        # MAP-tagged Haiku 4.5 (default) -> Sonnet 4 -> Sonnet 4.5
        {
            "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/heol2zyy5v48": [
                "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/tyj1ks3nj9qf",
                "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/few7z4l830xh",
            ]
        },
        # MAP-tagged Sonnet 4.5 -> Sonnet 4 -> Haiku 4.5
        {
            "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/few7z4l830xh": [
                "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/tyj1ks3nj9qf",
                "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/heol2zyy5v48",
            ]
        },
        # MAP-tagged Sonnet 4 -> Haiku 4.5
        {
            "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/tyj1ks3nj9qf": [
                "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/heol2zyy5v48",
            ]
        }
    ]
    
    provider_router = Router(
        model_list=model_list,
        retry_after=15,
        fallbacks=fallbacks,
    )
    
    logger.info(f"Configured LiteLLM Router with {len(fallbacks)} Bedrock-only fallback rules")

def _configure_openai_compatible(params: Dict[str, Any], model_name: str, api_key: Optional[str], api_base: Optional[str]) -> None:
    """Configure OpenAI-compatible provider setup."""
    if not model_name.startswith("openai-compatible/"):
        return
    
    # Get config values safely
    config_openai_key = getattr(config, 'OPENAI_COMPATIBLE_API_KEY', None) if config else None
    config_openai_base = getattr(config, 'OPENAI_COMPATIBLE_API_BASE', None) if config else None
    
    # Use provided values or fallback to config
    final_api_key = api_key or config_openai_key
    final_api_base = api_base or config_openai_base
    
    # Check if have required config either from parameters or environment
    if not final_api_key or not final_api_base:
        raise LLMError(
            "OPENAI_COMPATIBLE_API_KEY and OPENAI_COMPATIBLE_API_BASE is required for openai-compatible models. If just updated the environment variables, wait a few minutes or restart the service to ensure they are loaded."
        )
    
    # Inject API key and base into params for DirectLiteLLMStrategy
    params["api_key"] = final_api_key
    params["api_base"] = final_api_base
    
    setup_provider_router(final_api_key, final_api_base)
    logger.debug(f"Configured OpenAI-compatible provider with custom API base: {final_api_base}")

def _add_tools_config(params: Dict[str, Any], tools: Optional[List[Dict[str, Any]]], tool_choice: str) -> None:
    """Add tools configuration to parameters."""
    if tools is None:
        return
    
    params.update({
        "tools": tools,
        "tool_choice": tool_choice
    })
    # logger.debug(f"Added {len(tools)} tools to API parameters")


async def make_llm_api_call(
    messages: List[Dict[str, Any]],
    model_name: str,
    response_format: Optional[Any] = None,
    temperature: float = 0,
    max_tokens: Optional[int] = None,
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: str = "auto",
    api_key: Optional[str] = None,
    api_base: Optional[str] = None,
    stream: bool = True,  # Always stream for better UX
    top_p: Optional[float] = None,
    model_id: Optional[str] = None,
    headers: Optional[Dict[str, str]] = None,
    extra_headers: Optional[Dict[str, str]] = None,
    thread_id: Optional[str] = None,  # Added for semantic cache context (Story 2.1)
) -> Union[Dict[str, Any], AsyncGenerator, ModelResponse]:
    """Make an API call to a language model using LiteLLM."""
    logger.info(f"Making LLM API call to model: {model_name} with {len(messages)} messages")
    
    # Story 2.2: Message History Compression (only in OPTIMIZED mode)
    compression_metadata = None
    try:
        from core.utils.config import OptimizationConfig, OptimizationMode
        
        # Only use history compression in OPTIMIZED mode
        if OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.OPTIMIZED:
            from core.optimizations.history_compressor import get_history_compressor
            
            history_compressor = get_history_compressor()
            
            # Compress message history if enabled
            if history_compressor.enabled and len(messages) >= (history_compressor.sliding_window_size + 5):
                # Only compress if we have enough messages (sliding window + some older messages)
                min_messages = config.HISTORY_COMPRESSION_MIN_MESSAGES if hasattr(config, 'HISTORY_COMPRESSION_MIN_MESSAGES') else 15
                compressed_messages, compression_metadata = await history_compressor.compress_history(
                    messages,
                    model_name,
                    min_messages_to_compress=min_messages
                )
                
                if compression_metadata.get("compressed"):
                    logger.info(
                        f"✅ Message history compressed: "
                        f"{compression_metadata.get('original_message_count')} → "
                        f"{compression_metadata.get('compressed_message_count')} messages, "
                        f"{compression_metadata.get('tokens_before')} → "
                        f"{compression_metadata.get('tokens_after')} tokens "
                        f"({compression_metadata.get('reduction_percentage', 0):.1f}% reduction)"
                    )
                    messages = compressed_messages
    except Exception as e:
        logger.debug(f"Message history compression failed (non-critical): {e}")
        # Continue with original messages
    
    # Story 2.1: Semantic Response Caching (only in OPTIMIZED mode)
    semantic_cache_hit = False
    cached_response_data = None
    user_query_for_cache = None
    try:
        from core.utils.config import OptimizationConfig, OptimizationMode
        
        # Only use semantic caching in OPTIMIZED mode
        if OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.OPTIMIZED:
            from core.optimizations.semantic_cache import get_semantic_cache
            
            semantic_cache = get_semantic_cache()
            
            # Extract user query from messages (last user message)
            user_query_for_cache = None
            for message in reversed(messages):
                if isinstance(message, dict) and message.get("role") == "user":
                    content = message.get("content", "")
                    if isinstance(content, str):
                        user_query_for_cache = content
                    elif isinstance(content, list):
                        # Extract text from content array
                        texts = []
                        for item in content:
                            if isinstance(item, dict) and "text" in item:
                                texts.append(item["text"])
                            elif isinstance(item, str):
                                texts.append(item)
                        user_query_for_cache = " ".join(texts) if texts else None
                    break
            
            # Only check cache if we have a user query and not streaming
            # Note: For streaming, we'll cache after the response is complete
            if user_query_for_cache and semantic_cache.enabled and not stream:
                # Build context for cache key
                # Note: Exclude temperature and max_tokens from context as they don't affect
                # semantic similarity. This improves cache hit rate for semantically identical
                # queries with different parameters.
                context = {
                    "model_name": model_name,
                    "thread_id": thread_id,
                    # temperature and max_tokens excluded - they don't affect semantic similarity
                    "tools_count": len(tools) if tools else 0
                }
                
                # Check semantic cache
                cached_result = await semantic_cache.get_cached_response(user_query_for_cache, context)
                
                if cached_result and cached_result.get("cache_hit"):
                    semantic_cache_hit = True
                    cached_response_data = cached_result
                    
                    logger.info(
                        f"✅ Semantic cache HIT for query: '{user_query_for_cache[:50]}...' "
                        f"(similarity={cached_result.get('similarity_score', 0):.3f})"
                    )
                    
                    # Track metrics in quality monitor
                    try:
                        from core.optimizations.quality_monitor import get_quality_monitor
                        quality_monitor = get_quality_monitor()
                        await quality_monitor.track_metric(
                            "semantic_cache_hit_rate",
                            value=1.0,
                            metadata={
                                "model": model_name,
                                "similarity_score": cached_result.get("similarity_score", 0),
                                "thread_id": thread_id,
                                "cache_key": cached_result.get("cache_key", "")
                            }
                        )
                    except Exception as e:
                        logger.debug(f"Failed to track semantic cache hit in quality monitor: {e}")
                    
                    # Return cached response
                    # Note: May need format conversion based on caller expectations
                    cached_response = cached_result.get("response", {})
                    return cached_response
    except Exception as e:
        logger.debug(f"Semantic cache lookup failed (non-critical): {e}")
        # Continue with normal LLM call
    
    # Prepare parameters using centralized model configuration
    from core.ai_models import model_manager
    resolved_model_name = model_manager.resolve_model_id(model_name)
    # logger.debug(f"Model resolution: '{model_name}' -> '{resolved_model_name}'")
    
    # Only pass headers/extra_headers if they are not None to avoid overriding model config
    override_params = {
        "messages": messages,
        "temperature": temperature,
        "response_format": response_format,
        "top_p": top_p,
        "stream": stream,
        "api_key": api_key,
        "api_base": api_base
    }
    
    # Only add headers if they are provided (not None)
    if headers is not None:
        override_params["headers"] = headers
    if extra_headers is not None:
        override_params["extra_headers"] = extra_headers
    
    params = model_manager.get_litellm_params(resolved_model_name, **override_params)
    
    # logger.debug(f"Parameters from model_manager.get_litellm_params: {params}")
    
    if model_id:
        params["model_id"] = model_id
    
    if stream:
        params["stream_options"] = {"include_usage": True}
    
    # Apply additional configurations that aren't in the model config yet
    _configure_openai_compatible(params, model_name, api_key, api_base)
    _add_tools_config(params, tools, tool_choice)
    
    # Story 1.3: Add Anthropic cache_control directives to system messages
    if _is_anthropic_model(resolved_model_name):
        params["messages"] = _add_anthropic_cache_control(params["messages"], resolved_model_name)
    
    try:
        # Log the complete parameters being sent to LiteLLM
        # logger.debug(f"Calling LiteLLM acompletion for {resolved_model_name}")
        # logger.debug(f"Complete LiteLLM parameters: {params}")
        
        # # Save parameters to txt file for debugging
        # import json
        # import os
        # from datetime import datetime
        
        # debug_dir = "debug_logs"
        # os.makedirs(debug_dir, exist_ok=True)
        
        # timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        # filename = f"{debug_dir}/llm_params_{timestamp}.txt"
        
        # with open(filename, 'w') as f:
        #     f.write(f"Timestamp: {datetime.now().isoformat()}\n")
        #     f.write(f"Model Name: {model_name}\n")
        #     f.write(f"Resolved Model Name: {resolved_model_name}\n")
        #     f.write(f"Parameters:\n{json.dumps(params, indent=2, default=str)}\n")
        
        # logger.debug(f"LiteLLM parameters saved to: {filename}")
        
        response = await provider_router.acompletion(**params)
        
        # Story 1.3: Track Anthropic cache creation/read tokens
        cache_creation_tokens = 0
        cache_read_tokens = 0
        try:
            if _is_anthropic_model(resolved_model_name):
                # Extract cache token metrics from Anthropic response usage
                if hasattr(response, 'usage') and response.usage:
                    usage = response.usage
                    # Anthropic response usage includes cache_creation_input_tokens and cache_read_input_tokens
                    cache_creation_tokens = getattr(usage, 'cache_creation_input_tokens', 0) or 0
                    cache_read_tokens = getattr(usage, 'cache_read_input_tokens', 0) or 0
                    
                    if cache_creation_tokens > 0 or cache_read_tokens > 0:
                        total_cached_tokens = cache_creation_tokens + cache_read_tokens
                        total_input_tokens = getattr(usage, 'input_tokens', 0) or 0
                        cache_hit_rate = (cache_read_tokens / total_input_tokens * 100) if total_input_tokens > 0 else 0.0
                        
                        logger.info(
                            f"📊 Anthropic Cache Metrics - model={resolved_model_name}, "
                            f"cache_creation_tokens={cache_creation_tokens}, "
                            f"cache_read_tokens={cache_read_tokens}, "
                            f"total_cached_tokens={total_cached_tokens}, "
                            f"cache_hit_rate={cache_hit_rate:.2f}%"
                        )
                elif hasattr(response, '_hidden_params') and response._hidden_params:
                    # Try alternative response format (LiteLLM wrapped)
                    usage = response._hidden_params.get('usage', {})
                    if usage:
                        cache_creation_tokens = usage.get('cache_creation_input_tokens', 0) or 0
                        cache_read_tokens = usage.get('cache_read_input_tokens', 0) or 0
                        
                        if cache_creation_tokens > 0 or cache_read_tokens > 0:
                            total_cached_tokens = cache_creation_tokens + cache_read_tokens
                            total_input_tokens = usage.get('input_tokens', 0) or 0
                            cache_hit_rate = (cache_read_tokens / total_input_tokens * 100) if total_input_tokens > 0 else 0.0
                            
                            logger.info(
                                f"📊 Anthropic Cache Metrics - model={resolved_model_name}, "
                                f"cache_creation_tokens={cache_creation_tokens}, "
                                f"cache_read_tokens={cache_read_tokens}, "
                                f"total_cached_tokens={total_cached_tokens}, "
                                f"cache_hit_rate={cache_hit_rate:.2f}%"
                            )
                
                # Story 1.3: Track Anthropic cache metrics in quality monitor (Task 4)
                try:
                    from core.optimizations.quality_monitor import get_quality_monitor
                    quality_monitor = get_quality_monitor()
                    
                    if cache_read_tokens > 0 or cache_creation_tokens > 0:
                        # Get total input tokens for cache hit rate calculation
                        total_input_tokens = 0
                        if hasattr(response, 'usage') and response.usage:
                            total_input_tokens = getattr(response.usage, 'input_tokens', 0) or 0
                        elif hasattr(response, '_hidden_params') and response._hidden_params:
                            usage = response._hidden_params.get('usage', {})
                            total_input_tokens = usage.get('input_tokens', 0) or 0
                        
                        if total_input_tokens > 0:
                            cache_hit_rate_percentage = (cache_read_tokens / total_input_tokens) * 100.0
                            await quality_monitor.track_metric(
                                "anthropic_cache_hit_rate",
                                value=cache_hit_rate_percentage,
                                metadata={
                                    "model": resolved_model_name,
                                    "cache_creation_tokens": cache_creation_tokens,
                                    "cache_read_tokens": cache_read_tokens,
                                    "total_input_tokens": total_input_tokens
                                }
                            )
                except Exception as e:
                    logger.debug(f"Quality monitor tracking error (non-critical): {e}")
        except Exception as e:
            logger.debug(f"Anthropic cache token tracking error (non-critical): {e}")
        
        # Story 2.1: Cache response in semantic cache (only in OPTIMIZED mode)
        try:
            from core.utils.config import OptimizationConfig, OptimizationMode
            
            if (
                OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.OPTIMIZED
                and user_query_for_cache
                and not semantic_cache_hit
            ):
                from core.optimizations.semantic_cache import get_semantic_cache
                
                semantic_cache = get_semantic_cache()
                
                if semantic_cache.enabled:
                    # Build context for cache key
                    # Note: Exclude temperature and max_tokens from context as they don't affect
                    # semantic similarity. This improves cache hit rate for semantically identical
                    # queries with different parameters.
                    context = {
                        "model_name": model_name,
                        "thread_id": thread_id,
                        # temperature and max_tokens excluded - they don't affect semantic similarity
                        "tools_count": len(tools) if tools else 0
                    }
                    
                    # Convert response to dictionary format for caching
                    response_dict = None
                    if isinstance(response, ModelResponse):
                        # Convert ModelResponse to dict
                        response_dict = {
                            "id": getattr(response, 'id', None),
                            "object": getattr(response, 'object', None),
                            "created": getattr(response, 'created', None),
                            "model": getattr(response, 'model', None),
                            "choices": [
                                {
                                    "index": getattr(choice, 'index', None),
                                    "message": {
                                        "role": getattr(choice.message, 'role', None) if hasattr(choice, 'message') else None,
                                        "content": getattr(choice.message, 'content', None) if hasattr(choice, 'message') else None,
                                    } if hasattr(choice, 'message') else {},
                                    "finish_reason": getattr(choice, 'finish_reason', None),
                                }
                                for choice in (getattr(response, 'choices', []) or [])
                            ],
                            "usage": {
                                "prompt_tokens": getattr(response.usage, 'prompt_tokens', None) if hasattr(response, 'usage') and response.usage else None,
                                "completion_tokens": getattr(response.usage, 'completion_tokens', None) if hasattr(response, 'usage') and response.usage else None,
                                "total_tokens": getattr(response.usage, 'total_tokens', None) if hasattr(response, 'usage') and response.usage else None,
                            } if hasattr(response, 'usage') and response.usage else {},
                        }
                    elif isinstance(response, dict):
                        response_dict = response
                    elif hasattr(response, '__dict__'):
                        # Try to convert object to dict
                        import json
                        try:
                            response_dict = json.loads(json.dumps(response, default=str))
                        except:
                            response_dict = {"response": str(response)}
                    
                    # Cache response if we have a valid response dictionary
                    if response_dict:
                        # Validate cache quality if we had a previous cache hit
                        quality_score = None
                        if cached_response_data:
                            quality_score = await semantic_cache.validate_cache_quality(
                                cached_response_data.get("response", {}),
                                response_dict
                            )
                            logger.info(
                                f"Cache quality validation: quality_score={quality_score:.3f} "
                                f"(threshold={semantic_cache.quality_threshold:.3f})"
                            )
                        
                        # Cache the response
                        await semantic_cache.cache_response(
                            user_query_for_cache,
                            response_dict,
                            context,
                            quality_score=quality_score
                        )
                        
                        # Track cache miss in quality monitor
                        try:
                            from core.optimizations.quality_monitor import get_quality_monitor
                            quality_monitor = get_quality_monitor()
                            await quality_monitor.track_metric(
                                "semantic_cache_miss",
                                value=1.0,
                                metadata={
                                    "model": model_name,
                                    "thread_id": thread_id
                                }
                            )
                        except Exception as e:
                            logger.debug(f"Failed to track semantic cache miss in quality monitor: {e}")
        except Exception as e:
            logger.debug(f"Semantic cache storage failed (non-critical): {e}")
        
        # Track LiteLLM cache metrics (Story 1.2 - Redis Response Caching)
        # Minor Recommendation: Cache Metrics Aggregation
        cache_hit = False
        cache_key = None
        response_time_ms = None
        
        try:
            # Extract cache hit/miss information from LiteLLM response
            # LiteLLM adds cache metadata to response object in various ways
            start_time = time.time() if hasattr(response, '_response_ms') else None
            
            # Method 1: Check _hidden_params (most common)
            if hasattr(response, '_hidden_params') and response._hidden_params:
                cache_info = response._hidden_params.get('cache', {})
                if cache_info:
                    cache_hit = cache_info.get('hit', False) or cache_info.get('cache_hit', False)
                    cache_key = cache_info.get('key', None) or cache_info.get('cache_key', None)
            
            # Calculate response time if available
            if hasattr(response, '_response_ms'):
                response_time_ms = response._response_ms
            elif start_time:
                response_time_ms = (time.time() - start_time) * 1000
            
            # Note: LiteLLM cache hit/miss info is primarily in _hidden_params
            # Other methods are provider-specific and not reliable
            
            # Record metrics in collector (Minor Recommendation: Cache Metrics Aggregation)
            try:
                from core.services.cache_metrics import get_cache_metrics_collector, check_cache_health
                collector = get_cache_metrics_collector()
                
                # Perform health check on first cache operation (Minor Recommendation: Cache Health Check)
                if collector.total_requests == 0:
                    try:
                        health_status = await check_cache_health()
                        if health_status.get('healthy'):
                            logger.info("✅ LiteLLM cache health check passed (first operation)")
                        else:
                            logger.warning(
                                f"⚠️ LiteLLM cache health check failed: {health_status.get('details', {})}"
                            )
                    except Exception as e:
                        logger.debug(f"Cache health check error (non-critical): {e}")
                
                await collector.record_cache_operation(
                    cache_hit=cache_hit,
                    model_name=model_name,
                    cache_key=cache_key,
                    response_time_ms=response_time_ms,
                    metadata={'stream': stream}
                )
                
                # Log aggregated metrics periodically (every 100 requests)
                if collector.total_requests % 100 == 0:
                    hit_rate = collector.get_cache_hit_rate_percentage()
                    logger.info(
                        f"📊 Cache Metrics Summary - "
                        f"Total: {collector.total_requests}, "
                        f"Hits: {collector.cache_hits}, "
                        f"Misses: {collector.cache_misses}, "
                        f"Hit Rate: {hit_rate:.2f}%"
                    )
            except Exception as e:
                logger.debug(f"Cache metrics collection error (non-critical): {e}")
            
            # Log cache metrics
            if cache_hit:
                logger.info(
                    f"📊 LiteLLM Cache HIT - model={model_name}, "
                    f"cache_key={cache_key[:50] if cache_key else 'N/A'}..."
                )
            else:
                logger.debug(
                    f"📊 LiteLLM Cache MISS - model={model_name}"
                )
                
        except Exception as e:
            # Don't fail LLM calls if cache metrics extraction fails
            logger.debug(f"Cache metrics extraction error (non-critical): {e}")
        
        # Track quality metrics (Story 2.4 - Quality Monitoring Framework)
        try:
            from core.optimizations.quality_monitor import get_quality_monitor
            quality_monitor = get_quality_monitor()
            
            # Track error rate (if response indicates error)
            if isinstance(response, dict) and response.get("status") == "error":
                await quality_monitor.track_metric(
                    "error_rate",
                    value=1.0,  # 100% error for this call
                    metadata={"model": model_name, "error": str(response.get("message", "unknown"))}
                )
        except Exception as e:
            # Don't fail LLM calls if quality monitoring fails
            logger.debug(f"Quality monitoring error (non-critical): {e}")
        
        # Story 2.1: Cache streaming responses after completion
        # For streaming responses, wrap to collect and cache the complete response
        if hasattr(response, '__aiter__') and stream:
            return _wrap_streaming_response_with_cache(
                response,
                user_query_for_cache,
                model_name,
                thread_id,
                tools
            )
        
        return response
        
    except Exception as e:
        # Use ErrorProcessor to handle the error consistently
        processed_error = ErrorProcessor.process_llm_error(e, context={"model": model_name})
        ErrorProcessor.log_error(processed_error)
        raise LLMError(processed_error.message)

async def _wrap_streaming_response_with_cache(
    response: AsyncGenerator,
    user_query: Optional[str],
    model_name: str,
    thread_id: Optional[str],
    tools: Optional[List[Dict[str, Any]]]
) -> AsyncGenerator:
    """
    Wrap streaming response to collect complete response and cache it.
    
    Story 2.1: Cache streaming responses after completion for future cache hits.
    """
    from core.utils.config import OptimizationConfig, OptimizationMode
    
    # Only cache in OPTIMIZED mode
    should_cache = (
        OptimizationConfig.OPTIMIZATION_MODE == OptimizationMode.OPTIMIZED
        and user_query
    )
    
    collected_chunks = []
    complete_content = ""
    
    try:
        async for chunk in response:
            collected_chunks.append(chunk)
            yield chunk
            
            # Extract content from chunk (OpenAI-style streaming)
            if isinstance(chunk, dict):
                choices = chunk.get("choices", [])
                if choices and len(choices) > 0:
                    delta = choices[0].get("delta", {})
                    content = delta.get("content", "")
                    if content:
                        complete_content += content
        
        # After streaming completes, cache the response
        if should_cache and complete_content:
            try:
                from core.optimizations.semantic_cache import get_semantic_cache
                
                semantic_cache = get_semantic_cache()
                
                if semantic_cache.enabled:
                    # Build complete response from collected content
                    complete_response = {
                        "choices": [
                            {
                                "message": {
                                    "role": "assistant",
                                    "content": complete_content
                                },
                                "finish_reason": "stop"
                            }
                        ]
                    }
                    
                    # Build context for cache key
                    context = {
                        "model_name": model_name,
                        "thread_id": thread_id,
                        "tools_count": len(tools) if tools else 0
                    }
                    
                    # Cache the complete response
                    await semantic_cache.cache_response(
                        user_query,
                        complete_response,
                        context
                    )
                    
                    logger.debug(f"Cached streaming response for query: '{user_query[:50]}...'")
            except Exception as e:
                logger.debug(f"Failed to cache streaming response (non-critical): {e}")
    
    except Exception as e:
        # Convert streaming errors to processed errors
        processed_error = ErrorProcessor.process_llm_error(e)
        ErrorProcessor.log_error(processed_error)
        raise LLMError(processed_error.message)

async def _wrap_streaming_response(response) -> AsyncGenerator:
    """Wrap streaming response to handle errors during iteration (legacy wrapper)."""
    try:
        async for chunk in response:
            yield chunk
    except Exception as e:
        # Convert streaming errors to processed errors
        processed_error = ErrorProcessor.process_llm_error(e)
        ErrorProcessor.log_error(processed_error)
        raise LLMError(processed_error.message)

# Initialize LiteLLM Redis caching (Story 1.2)
setup_litellm_redis_cache()

setup_api_keys()
setup_provider_router()


if __name__ == "__main__":
    from litellm import completion
    import os

    setup_api_keys()

    response = completion(
        model="bedrock/anthropic.claude-sonnet-4-20250115-v1:0",
        messages=[{"role": "user", "content": "Hello! Testing 1M context window."}],
        max_tokens=100,
        extra_headers={
            "anthropic-beta": "context-1m-2025-08-07"  # 👈 Enable 1M context
        }
    )

