"""
LLM API interface for making calls to various language models.

This module provides a unified interface for making API calls to different LLM providers
using LiteLLM with simplified error handling and clean parameter management.
"""

from typing import Union, Dict, Any, Optional, AsyncGenerator, List
import os
import asyncio
import litellm
from litellm.router import Router
from litellm.files.main import ModelResponse
from core.utils.logger import logger
from core.utils.config import config
from core.agentpress.error_processor import ErrorProcessor
from core.ai_models.provider_config import ProviderConfigFactory, CredentialValidator
from core.ai_models.llm_strategies import LLMCallContext, LLMStrategyFactory
from core.ai_models.llm_metrics import track_llm_call, record_llm_call

# Configure LiteLLM
os.environ['LITELLM_LOG'] = 'INFO'  # Reduced verbosity
litellm.modify_params = True
litellm.drop_params = True

# Constants
MAX_RETRIES = 3
provider_router = None


class LLMError(Exception):
    """Exception for LLM-related errors."""
    pass

def setup_api_keys() -> None:
    """Set up API keys from environment variables."""
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
        key = getattr(config, f"{provider}_API_KEY")
        if key:
            # logger.debug(f"API key set for provider: {provider}")
            pass
        else:
            logger.warning(f"No API key found for provider: {provider}")

    # Set up OpenRouter API base if not already set
    if config.OPENROUTER_API_KEY and config.OPENROUTER_API_BASE:
        os.environ["OPENROUTER_API_BASE"] = config.OPENROUTER_API_BASE
        # logger.debug(f"Set OPENROUTER_API_BASE to {config.OPENROUTER_API_BASE}")


    # Set up AWS Bedrock credentials
    aws_access_key = config.AWS_ACCESS_KEY_ID
    aws_secret_key = config.AWS_SECRET_ACCESS_KEY
    aws_region = config.AWS_REGION_NAME

    if aws_access_key and aws_secret_key and aws_region:
        logger.debug(f"AWS Bedrock configured for region: {aws_region}")
        # Configure LiteLLM to use AWS credentials
        os.environ["AWS_ACCESS_KEY_ID"] = aws_access_key
        os.environ["AWS_SECRET_ACCESS_KEY"] = aws_secret_key
        os.environ["AWS_REGION_NAME"] = aws_region
    else:
        logger.warning(f"Missing AWS credentials for Bedrock integration - access_key: {bool(aws_access_key)}, secret_key: {bool(aws_secret_key)}, region: {aws_region}")

def setup_provider_router(openai_compatible_api_key: str = None, openai_compatible_api_base: str = None):
    global provider_router

    # Use centralized credential validation
    if not CredentialValidator.validate_openai_compatible(openai_compatible_api_key, openai_compatible_api_base):
        logger.warning("OpenAI-compatible credentials not available, skipping router setup")
        return

    model_list = [
        {
            "model_name": "openai-compatible/gpt-4o-mini", # Specific model for v98store
            "litellm_params": {
                "model": "gpt-4o-mini",  # Transform to actual model name for v98store API
                "api_key": openai_compatible_api_key or config.OPENAI_COMPATIBLE_API_KEY,
                "api_base": openai_compatible_api_base or config.OPENAI_COMPATIBLE_API_BASE,
                "custom_llm_provider": "openai",  # Tell LiteLLM to use OpenAI format
            },
        },
        {
            "model_name": "openai-compatible/gpt-4o", # Specific model for v98store
            "litellm_params": {
                "model": "gpt-4o",  # Transform to actual model name for v98store API
                "api_key": openai_compatible_api_key or config.OPENAI_COMPATIBLE_API_KEY,
                "api_base": openai_compatible_api_base or config.OPENAI_COMPATIBLE_API_BASE,
                "custom_llm_provider": "openai",  # Tell LiteLLM to use OpenAI format
            },
        },
        {
            "model_name": "*", # supported LLM provider by LiteLLM
            "litellm_params": {
                "model": "*",
            },
        },
    ]
    provider_router = Router(model_list=model_list)
    logger.info(f"Provider router setup complete with {len(model_list)} model configurations")

def _configure_token_limits(params: Dict[str, Any], model_name: str, max_tokens: Optional[int]) -> None:
    """Configure token limits based on model type."""
    # Only set max_tokens if explicitly provided - let providers use their defaults otherwise
    if max_tokens is None:
        # logger.debug(f"No max_tokens specified, using provider defaults for model: {model_name}")
        return
    
    if model_name.startswith("bedrock/") and "claude-3-7" in model_name:
        # For Claude 3.7 in Bedrock, do not set max_tokens or max_tokens_to_sample
        # as it causes errors with inference profiles
        # logger.debug(f"Skipping max_tokens for Claude 3.7 model: {model_name}")
        return
    
    is_openai_o_series = 'o1' in model_name
    is_openai_gpt5 = 'gpt-5' in model_name
    param_name = "max_completion_tokens" if (is_openai_o_series or is_openai_gpt5) else "max_tokens"
    params[param_name] = max_tokens
    # logger.debug(f"Set {param_name}={max_tokens} for model: {model_name}")

def _configure_anthropic(params: Dict[str, Any], model_name: str, messages: List[Dict[str, Any]]) -> None:
    """Configure Anthropic-specific parameters."""
    if not ("claude" in model_name.lower() or "anthropic" in model_name.lower()):
        return
    
    # Include prompt caching and context-1m beta features
    params["extra_headers"] = {
        "anthropic-beta": "prompt-caching-2024-07-31,context-1m-2025-08-07"
    }
    logger.debug(f"Added Anthropic-specific headers for prompt caching and 1M context window")

def _configure_openrouter(params: Dict[str, Any], model_name: str) -> None:
    """Configure OpenRouter-specific parameters."""
    if not model_name.startswith("openrouter/"):
        return
    
    # logger.debug(f"Preparing OpenRouter parameters for model: {model_name}")

    # Add optional site URL and app name from config
    site_url = config.OR_SITE_URL
    app_name = config.OR_APP_NAME
    if site_url or app_name:
        extra_headers = params.get("extra_headers", {})
        if site_url:
            extra_headers["HTTP-Referer"] = site_url
        if app_name:
            extra_headers["X-Title"] = app_name
        params["extra_headers"] = extra_headers
        # logger.debug(f"Added OpenRouter site URL and app name to headers")

def _configure_bedrock(params: Dict[str, Any], model_name: str, model_id: Optional[str]) -> None:
    """Configure Bedrock-specific parameters."""
    if not model_name.startswith("bedrock/"):
        return
    
    # logger.debug(f"Preparing AWS Bedrock parameters for model: {model_name}")

    # Auto-set model_id for Claude 3.7 Sonnet if not provided
    if not model_id and "anthropic.claude-3-7-sonnet" in model_name:
        params["model_id"] = "arn:aws:bedrock:us-west-2:935064898258:inference-profile/us.anthropic.claude-3-7-sonnet-20250219-v1:0"
        # logger.debug(f"Auto-set model_id for Claude 3.7 Sonnet: {params['model_id']}")

def _configure_openai_gpt5(params: Dict[str, Any], model_name: str) -> None:
    """Configure OpenAI GPT-5 specific parameters."""
    if "gpt-5" not in model_name:
        return
    

    # Drop unsupported temperature param (only default 1 allowed)
    if "temperature" in params and params["temperature"] != 1:
        params.pop("temperature", None)

    # Request priority service tier when calling OpenAI directly

    # Pass via both top-level and extra_body for LiteLLM compatibility
    if not model_name.startswith("openrouter/"):
        params["service_tier"] = "priority"
        extra_body = params.get("extra_body", {})
        if "service_tier" not in extra_body:
            extra_body["service_tier"] = "priority"
        params["extra_body"] = extra_body

def _configure_kimi_k2(params: Dict[str, Any], model_name: str) -> None:
    """Configure Kimi K2-specific parameters."""
    is_kimi_k2 = "kimi-k2" in model_name.lower() or model_name.startswith("moonshotai/kimi-k2")
    if not is_kimi_k2:
        return
    
    params["provider"] = {
        "order": ["groq", "moonshotai"] #, "groq", "together/fp8", "novita/fp8", "baseten/fp8", 
    }

def _configure_thinking(params: Dict[str, Any], model_name: str, enable_thinking: Optional[bool], reasoning_effort: Optional[str]) -> None:
    """Configure reasoning/thinking parameters for supported models."""
    if not enable_thinking:
        return
    

    effort_level = reasoning_effort or 'low'
    is_anthropic = "anthropic" in model_name.lower() or "claude" in model_name.lower()
    is_xai = "xai" in model_name.lower() or model_name.startswith("xai/")
    
    if is_anthropic:
        params["reasoning_effort"] = effort_level
        params["temperature"] = 1.0  # Required by Anthropic when reasoning_effort is used
        logger.info(f"Anthropic thinking enabled with reasoning_effort='{effort_level}'")
    elif is_xai:
        params["reasoning_effort"] = effort_level
        logger.info(f"xAI thinking enabled with reasoning_effort='{effort_level}'")


def _add_tools_config(params: Dict[str, Any], tools: Optional[List[Dict[str, Any]]], tool_choice: str) -> None:
    """Add tools configuration to parameters."""
    if tools is None:
        return

    # Check if this is a v98store model - they don't support tool schemas
    model_name = params.get("model", "")
    api_base = params.get("api_base", "")

    if "v98store.com" in api_base or "openai-compatible" in model_name:
        logger.info(f"🚫 SKIPPING TOOLS for v98store model: {model_name} (v98store doesn't support tool schemas)")
        return

    params.update({
        "tools": tools,
        "tool_choice": tool_choice
    })
    logger.debug(f"✅ Added {len(tools)} tools to API parameters for model: {model_name}")

def prepare_params(
    messages: List[Dict[str, Any]],
    model_name: str,
    temperature: float = 0,
    max_tokens: Optional[int] = None,
    response_format: Optional[Any] = None,
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: str = "auto",
    api_key: Optional[str] = None,
    api_base: Optional[str] = None,
    stream: bool = False,
    top_p: Optional[float] = None,
    model_id: Optional[str] = None,
    enable_thinking: Optional[bool] = False,
    reasoning_effort: Optional[str] = "low",
) -> Dict[str, Any]:
    from core.ai_models import model_manager

    logger.info(f"🔍 PREPARE_PARAMS: Input model_name='{model_name}'")
    resolved_model_name = model_manager.resolve_model_id(model_name)
    logger.info(f"🔍 PREPARE_PARAMS: Resolved model_name='{resolved_model_name}'")

    params = {
        "model": resolved_model_name,
        "messages": messages,
        "temperature": temperature,
        "response_format": response_format,
        "top_p": top_p,
        "stream": stream,
        "num_retries": MAX_RETRIES,
    }
    
    # Enable usage tracking for streaming requests
    if stream:
        params["stream_options"] = {"include_usage": True}
        # logger.debug(f"Added stream_options for usage tracking: {params['stream_options']}")

    if model_id:
        params["model_id"] = model_id

    if model_name.startswith("openai-compatible/"):
        logger.info(f"🔍 Processing openai-compatible model: {model_name}")

        # Use centralized configuration management
        provider_config = ProviderConfigFactory.create_openai_compatible_config(api_key, api_base)
        if not provider_config.validate():
            raise LLMError(
                "OPENAI_COMPATIBLE_API_KEY and OPENAI_COMPATIBLE_API_BASE is required for openai-compatible models. If just updated the environment variables, wait a few minutes or restart the service to ensure they are loaded."
            )

        setup_provider_router(api_key, api_base)

        # For Router strategy, keep original model name for pattern matching
        # Model transformation will be handled by Router internally
        logger.info(f"🔄 Using Router strategy - keeping original model name: {model_name}")

        params["model"] = model_name  # Keep original for Router pattern matching

        # Apply provider configuration
        credentials = provider_config.get_credentials()
        params.update(credentials)

        logger.info(f"🔑 Using API base: {params['api_base']}")
        logger.info(f"🔑 Using API key: {params['api_key'][:10]}...{params['api_key'][-4:] if params['api_key'] else 'None'}")
        logger.info(f"📋 Final params for LiteLLM: model={params['model']}, custom_llm_provider={params.get('custom_llm_provider')}")
        logger.info(f"📋 All LiteLLM params: {list(params.keys())}")
    else:
        # For non-openai-compatible models, set API credentials normally
        if api_key:
            params["api_key"] = api_key
        if api_base:
            params["api_base"] = api_base

    # Handle token limits
    _configure_token_limits(params, resolved_model_name, max_tokens)
    # Add tools if provided
    _add_tools_config(params, tools, tool_choice)
    # Add Anthropic-specific parameters
    _configure_anthropic(params, resolved_model_name, params["messages"])
    # Add OpenRouter-specific parameters
    _configure_openrouter(params, resolved_model_name)
    # Add Bedrock-specific parameters
    _configure_bedrock(params, resolved_model_name, model_id)

    # Add OpenAI GPT-5 specific parameters
    _configure_openai_gpt5(params, resolved_model_name)
    # Add Kimi K2-specific parameters
    _configure_kimi_k2(params, resolved_model_name)
    _configure_thinking(params, resolved_model_name, enable_thinking, reasoning_effort)

    return params

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
    stream: bool = False,
    top_p: Optional[float] = None,
    model_id: Optional[str] = None,
    enable_thinking: Optional[bool] = False,
    reasoning_effort: Optional[str] = "low",
) -> Union[Dict[str, Any], AsyncGenerator, ModelResponse]:
    """Make an API call to a language model using LiteLLM."""
    logger.info(f"Making LLM API call to model: {model_name} with {len(messages)} messages")

    # DEBUG: Log actual messages content
    logger.info(f"🔍 MESSAGES DEBUG: Total messages: {len(messages)}")
    for i, msg in enumerate(messages):
        role = msg.get('role', 'unknown')
        content = msg.get('content', '')
        content_preview = str(content)[:100] + "..." if len(str(content)) > 100 else str(content)
        logger.info(f"🔍 MESSAGES DEBUG [{i}]: role={role}, content_length={len(str(content))}, preview='{content_preview}'")
    
    # DEBUG: Log if any messages have cache_control
    cache_messages = [i for i, msg in enumerate(messages) if 
                     isinstance(msg.get('content'), list) and 
                     msg['content'] and 
                     isinstance(msg['content'][0], dict) and 
                     'cache_control' in msg['content'][0]]
    if cache_messages:
        logger.info(f"🔥 CACHE CONTROL: Found cache_control in messages at positions: {cache_messages}")
    else:
        logger.info(f"❌ NO CACHE CONTROL: No cache_control found in any messages")
    
    # Check token count for context window issues
    # try:
    #     from litellm import token_counter
    #     total_tokens = token_counter(model=model_name, messages=messages)
    #     logger.debug(f"Estimated input tokens: {total_tokens}")
        
    #     if total_tokens > 200000:
    #         logger.warning(f"High token count detected: {total_tokens}")
    # except Exception:
    #     pass  # Token counting is optional
    
    # Prepare parameters
    params = prepare_params(
        messages=messages,
        model_name=model_name,
        temperature=temperature,
        max_tokens=max_tokens,
        response_format=response_format,
        tools=tools,
        tool_choice=tool_choice,
        api_key=api_key,
        api_base=api_base,
        stream=stream,
        top_p=top_p,
        model_id=model_id,
        enable_thinking=enable_thinking,
        reasoning_effort=reasoning_effort,
    )
    
    # Start metrics tracking
    provider = "openai_compatible" if model_name.startswith("openai-compatible/") else "standard"
    strategy = "DirectLiteLLM" if model_name.startswith("openai-compatible/") else "Router"
    metrics = track_llm_call(model_name, provider, strategy, stream)

    try:
        logger.info(f"🔍 MAKE_LLM_API_CALL: model_name='{model_name}', params['model']='{params.get('model')}'")

        # Use strategy pattern for LLM calls
        call_context = LLMCallContext(model_name, provider_router)
        logger.info(f"🚀 Using strategy: {call_context.get_strategy_info()}")

        response = await call_context.execute_call(**params)

        # For streaming responses, we need to handle errors that occur during iteration
        if hasattr(response, '__aiter__') and stream:
            # Mark success for streaming (we'll track tokens later if available)
            metrics.mark_success()
            record_llm_call(metrics)
            return _wrap_streaming_response(response)

        # Extract token usage if available
        token_usage = {}
        if hasattr(response, 'usage') and response.usage:
            token_usage = {
                'prompt_tokens': getattr(response.usage, 'prompt_tokens', 0),
                'completion_tokens': getattr(response.usage, 'completion_tokens', 0),
                'total_tokens': getattr(response.usage, 'total_tokens', 0)
            }

        metrics.mark_success(token_usage)
        record_llm_call(metrics)
        return response

    except Exception as e:
        # Record failure metrics
        error_type = type(e).__name__
        metrics.mark_failure(error_type, str(e))
        record_llm_call(metrics)

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

setup_api_keys()
setup_provider_router()
