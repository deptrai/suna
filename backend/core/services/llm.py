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
    
    # Configure fallbacks: MAP-tagged Bedrock app inference profiles (global routing, 14B tokens/day)
    fallbacks = [
        # MAP-tagged Haiku 4.5 (default) -> Sonnet 4 -> Sonnet 4.5 -> Anthropic fallbacks
        {
            "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/heol2zyy5v48": [
                "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/tyj1ks3nj9qf",
                "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/few7z4l830xh",
                "anthropic/claude-haiku-4-5-20251001",
                "anthropic/claude-sonnet-4-20250514"
            ]
        },
        # MAP-tagged Sonnet 4.5 -> Sonnet 4 -> Haiku 4.5 -> Anthropic fallbacks
        {
            "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/few7z4l830xh": [
                "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/tyj1ks3nj9qf",
                "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/heol2zyy5v48",
                "anthropic/claude-sonnet-4-5-20250929",
                "anthropic/claude-sonnet-4-20250514"
            ]
        },
        # MAP-tagged Sonnet 4 -> Haiku 4.5 -> Anthropic fallbacks
        {
            "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/tyj1ks3nj9qf": [
                "bedrock/converse/arn:aws:bedrock:us-west-2:935064898258:application-inference-profile/heol2zyy5v48",
                "anthropic/claude-sonnet-4-20250514"
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
) -> Union[Dict[str, Any], AsyncGenerator, ModelResponse]:
    """Make an API call to a language model using LiteLLM."""
    logger.info(f"Making LLM API call to model: {model_name} with {len(messages)} messages")
    
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
        
        # For streaming responses, we need to handle errors that occur during iteration
        if hasattr(response, '__aiter__') and stream:
            return _wrap_streaming_response(response)
        
        return response
        
    except Exception as e:
        # Use ErrorProcessor to handle the error consistently
        processed_error = ErrorProcessor.process_llm_error(e, context={"model": model_name})
        ErrorProcessor.log_error(processed_error)
        raise LLMError(processed_error.message)

async def _wrap_streaming_response(response) -> AsyncGenerator:
    """Wrap streaming response to handle errors during iteration."""
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

