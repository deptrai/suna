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
        if model_name.startswith("openai-compatible/"):
            logger.debug(
                "Selected DirectLiteLLM strategy",
                model=model_name,
                reason="openai-compatible prefix"
            )
            return DirectLiteLLMStrategy()
        else:
            logger.debug(
                "Selected Router strategy",
                model=model_name,
                reason="standard provider"
            )
            return RouterStrategy(router)
    
    @staticmethod
    def get_strategy_for_provider(provider: str, router: Router = None) -> LLMStrategy:
        """Get strategy based on provider type."""
        if provider == "openai_compatible":
            return DirectLiteLLMStrategy()
        else:
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
