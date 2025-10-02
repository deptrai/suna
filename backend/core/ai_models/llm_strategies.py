"""
LLM Strategy Pattern Implementation.

This module implements the Strategy pattern for different LLM calling approaches,
providing a clean abstraction for router-based vs direct LiteLLM calls.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, AsyncGenerator, Union
import litellm
from litellm import Router
import structlog

logger = structlog.get_logger(__name__)


class LLMStrategy(ABC):
    """Abstract base class for LLM calling strategies."""
    
    @abstractmethod
    async def call_llm(self, **params) -> Union[Any, AsyncGenerator]:
        """Execute the LLM call with the given parameters."""
        pass
    
    @abstractmethod
    def get_strategy_name(self) -> str:
        """Get the name of this strategy for logging."""
        pass


class DirectLiteLLMStrategy(LLMStrategy):
    """Strategy for direct LiteLLM calls (used for OpenAI-compatible models)."""
    
    async def call_llm(self, **params) -> Union[Any, AsyncGenerator]:
        """Execute direct LiteLLM acompletion call."""
        logger.info(
            "Executing direct LiteLLM call",
            strategy=self.get_strategy_name(),
            model=params.get('model'),
            stream=params.get('stream', False)
        )
        
        try:
            # DEBUG: Log actual request parameters
            logger.info(f"🔍 LITELLM REQUEST DEBUG: params keys: {list(params.keys())}")
            logger.info(f"🔍 LITELLM REQUEST DEBUG: model={params.get('model')}")
            logger.info(f"🔍 LITELLM REQUEST DEBUG: messages count={len(params.get('messages', []))}")
            if 'messages' in params:
                for i, msg in enumerate(params['messages'][:2]):  # Log first 2 messages
                    logger.info(f"🔍 LITELLM REQUEST DEBUG: message[{i}] role={msg.get('role')}, content_len={len(str(msg.get('content', '')))}")
            logger.info(f"🔍 LITELLM REQUEST DEBUG: tools count={len(params.get('tools', []))}")
            logger.info(f"🔍 LITELLM REQUEST DEBUG: extra_headers={params.get('extra_headers')}")
            logger.info(f"🔍 LITELLM REQUEST DEBUG: api_base={params.get('api_base')}")
            logger.info(f"🔍 LITELLM REQUEST DEBUG: custom_llm_provider={params.get('custom_llm_provider')}")

            # Save full request to file for debugging
            import json
            import os
            debug_dir = os.path.join(os.path.dirname(__file__), '../../logs')
            os.makedirs(debug_dir, exist_ok=True)
            debug_file = os.path.join(debug_dir, 'litellm_request_debug.json')

            # Create a copy without sensitive data for logging
            debug_params = {
                'model': params.get('model'),
                'messages': params.get('messages', []),
                'tools': params.get('tools', []),
                'tool_choice': params.get('tool_choice'),
                'temperature': params.get('temperature'),
                'api_base': params.get('api_base'),
                'custom_llm_provider': params.get('custom_llm_provider'),
                'extra_headers': params.get('extra_headers')
            }

            with open(debug_file, 'w') as f:
                json.dump(debug_params, f, indent=2, default=str)

            logger.info(f"🔍 LITELLM REQUEST DEBUG: Full request saved to {debug_file}")

            # For openai-compatible models, use OpenAI client directly to avoid LiteLLM transformation issues
            model = params.get('model', '')
            if model.startswith('openai-compatible/'):
                logger.info(f"🔄 BYPASSING LITELLM: Using OpenAI client directly for {model}")

                # Import OpenAI client
                from openai import AsyncOpenAI

                # Extract actual model name (remove openai-compatible/ prefix)
                actual_model = model.replace('openai-compatible/', '')

                # Get API configuration
                api_key = params.get('api_key')
                api_base = params.get('api_base')
                extra_headers = params.get('extra_headers', {})

                # Create OpenAI client with custom base URL
                client = AsyncOpenAI(
                    api_key=api_key,
                    base_url=api_base,
                    default_headers=extra_headers
                )

                # Prepare request parameters for OpenAI client
                openai_params = {
                    'model': actual_model,
                    'messages': params.get('messages', []),
                    'temperature': params.get('temperature', 0),
                    'stream': params.get('stream', False),
                }

                # Add optional parameters
                if 'tools' in params and params['tools']:
                    openai_params['tools'] = params['tools']
                if 'tool_choice' in params:
                    openai_params['tool_choice'] = params['tool_choice']
                if 'max_tokens' in params:
                    openai_params['max_tokens'] = params['max_tokens']
                if 'top_p' in params:
                    openai_params['top_p'] = params['top_p']
                if 'response_format' in params:
                    openai_params['response_format'] = params['response_format']
                if 'stream_options' in params:
                    openai_params['stream_options'] = params['stream_options']

                logger.info(f"🔍 OPENAI CLIENT REQUEST: model={actual_model}, messages={len(openai_params['messages'])}, tools={len(openai_params.get('tools', []))}")

                # Call OpenAI client directly
                response = await client.chat.completions.create(**openai_params)

                logger.info(f"✅ OPENAI CLIENT SUCCESS: Got response from {actual_model}")
                return response

            # For non-openai-compatible models, use LiteLLM as before
            logger.info(f"🔍 USING LITELLM: model={model}")
            response = await litellm.acompletion(**params)
            logger.debug(
                "Direct LiteLLM call successful",
                strategy=self.get_strategy_name(),
                model=params.get('model')
            )
            return response
        except Exception as e:
            logger.error(
                "Direct LiteLLM call failed",
                strategy=self.get_strategy_name(),
                model=params.get('model'),
                error=str(e)
            )
            raise
    
    def get_strategy_name(self) -> str:
        return "DirectLiteLLM"


class RouterStrategy(LLMStrategy):
    """Strategy for router-based LLM calls (used for standard providers)."""
    
    def __init__(self, router: Router):
        self.router = router
    
    async def call_llm(self, **params) -> Union[Any, AsyncGenerator]:
        """Execute router-based LLM call."""
        logger.info(
            "Executing router-based LLM call",
            strategy=self.get_strategy_name(),
            model=params.get('model'),
            stream=params.get('stream', False)
        )
        
        if self.router is None:
            raise ValueError("Router is not initialized")
        
        try:
            # DEBUG: Log actual router request parameters
            logger.info(f"🔍 ROUTER REQUEST DEBUG: params keys: {list(params.keys())}")
            logger.info(f"🔍 ROUTER REQUEST DEBUG: model={params.get('model')}")
            logger.info(f"🔍 ROUTER REQUEST DEBUG: messages count={len(params.get('messages', []))}")
            if 'messages' in params:
                for i, msg in enumerate(params['messages'][:2]):  # Log first 2 messages
                    logger.info(f"🔍 ROUTER REQUEST DEBUG: message[{i}] role={msg.get('role')}, content_len={len(str(msg.get('content', '')))}")
            logger.info(f"🔍 ROUTER REQUEST DEBUG: tools count={len(params.get('tools', []))}")

            response = await self.router.acompletion(**params)
            logger.debug(
                "Router-based LLM call successful",
                strategy=self.get_strategy_name(),
                model=params.get('model')
            )
            return response
        except Exception as e:
            logger.error(
                "Router-based LLM call failed",
                strategy=self.get_strategy_name(),
                model=params.get('model'),
                error=str(e)
            )
            raise
    
    def get_strategy_name(self) -> str:
        return "Router"


class LLMStrategyFactory:
    """Factory for creating appropriate LLM strategies."""
    
    @staticmethod
    def get_strategy(model_name: str, router: Router = None) -> LLMStrategy:
        """Get the appropriate strategy for the given model."""
        # Use DirectLiteLLM for openai-compatible models to avoid Router issues with tools
        if model_name.startswith("openai-compatible/"):
            logger.debug(
                "Selected DirectLiteLLM strategy for openai-compatible model",
                model=model_name,
                reason="router hangs with tools for openai-compatible models, using direct LiteLLM instead"
            )
            return DirectLiteLLMStrategy()

        # Use Router for all other models
        logger.debug(
            "Selected Router strategy",
            model=model_name,
            reason="router works well for standard providers"
        )
        return RouterStrategy(router)
    
    @staticmethod
    def get_strategy_for_provider(provider: str, router: Router = None) -> LLMStrategy:
        """Get strategy based on provider type."""
        # Use DirectLiteLLM for openai_compatible provider to avoid Router hanging with tools
        if provider == "openai_compatible":
            logger.debug(
                "Selected DirectLiteLLM strategy for openai_compatible provider",
                provider=provider,
                reason="router hangs with tools for openai-compatible models"
            )
            return DirectLiteLLMStrategy()

        # Use Router strategy for all other providers
        logger.debug(
            "Selected Router strategy for provider",
            provider=provider,
            reason="router works well for standard providers"
        )
        return RouterStrategy(router)


class LLMCallContext:
    """Context object for LLM calls with strategy selection."""
    
    def __init__(self, model_name: str, router: Router = None):
        self.model_name = model_name
        self.router = router
        self.strategy = LLMStrategyFactory.get_strategy(model_name, router)
    
    async def execute_call(self, **params) -> Union[Any, AsyncGenerator]:
        """Execute the LLM call using the selected strategy."""
        logger.info(
            "Executing LLM call with context",
            model=self.model_name,
            strategy=self.strategy.get_strategy_name(),
            params_keys=list(params.keys())
        )
        
        return await self.strategy.call_llm(**params)
    
    def get_strategy_info(self) -> Dict[str, str]:
        """Get information about the selected strategy."""
        return {
            "strategy_name": self.strategy.get_strategy_name(),
            "model_name": self.model_name,
            "strategy_class": self.strategy.__class__.__name__
        }
