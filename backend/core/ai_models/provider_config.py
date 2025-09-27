"""
Provider-specific configuration classes for LLM integrations.

This module provides centralized configuration management for different LLM providers,
following the principle of separation of concerns and making provider configurations
easily extensible and maintainable.
"""

from dataclasses import dataclass
from typing import Dict, Optional
from core.utils.config import config
import structlog

logger = structlog.get_logger(__name__)


@dataclass
class ProviderConfig:
    """Base class for provider configurations."""
    
    def validate(self) -> bool:
        """Validate the configuration. Override in subclasses."""
        raise NotImplementedError
    
    def get_credentials(self) -> Dict[str, str]:
        """Get credentials for the provider. Override in subclasses."""
        raise NotImplementedError


@dataclass
class OpenAICompatibleConfig(ProviderConfig):
    """Configuration for OpenAI-compatible providers like v98store."""
    
    api_key: Optional[str] = None
    api_base: Optional[str] = None
    model_transformations: Dict[str, str] = None
    
    def __post_init__(self):
        if self.model_transformations is None:
            self.model_transformations = {"openai-compatible/": ""}
    
    @classmethod
    def from_env(cls) -> 'OpenAICompatibleConfig':
        """Create configuration from environment variables."""
        return cls(
            api_key=config.OPENAI_COMPATIBLE_API_KEY,
            api_base=config.OPENAI_COMPATIBLE_API_BASE,
            model_transformations={"openai-compatible/": ""}
        )
    
    @classmethod
    def from_params(cls, api_key: str = None, api_base: str = None) -> 'OpenAICompatibleConfig':
        """Create configuration from parameters with env fallback."""
        return cls(
            api_key=api_key or config.OPENAI_COMPATIBLE_API_KEY,
            api_base=api_base or config.OPENAI_COMPATIBLE_API_BASE,
            model_transformations={"openai-compatible/": ""}
        )
    
    def validate(self) -> bool:
        """Validate that required credentials are present."""
        is_valid = bool(self.api_key and self.api_base)
        if not is_valid:
            logger.warning(
                "OpenAI-compatible configuration validation failed",
                has_api_key=bool(self.api_key),
                has_api_base=bool(self.api_base)
            )
        return is_valid
    
    def get_credentials(self) -> Dict[str, str]:
        """Get credentials dictionary for LiteLLM."""
        return {
            "api_key": self.api_key,
            "api_base": self.api_base,
            "custom_llm_provider": "openai"
        }
    
    def transform_model_name(self, model_name: str) -> str:
        """Transform model name according to provider requirements."""
        for prefix, replacement in self.model_transformations.items():
            if model_name.startswith(prefix):
                transformed = model_name.replace(prefix, replacement)
                logger.debug(
                    "Model name transformed",
                    original=model_name,
                    transformed=transformed,
                    provider="openai_compatible"
                )
                return transformed
        return model_name


class CredentialValidator:
    """Centralized credential validation for all providers."""
    
    @staticmethod
    def validate_openai_compatible(api_key: str = None, api_base: str = None) -> bool:
        """Validate OpenAI-compatible credentials."""
        config_obj = OpenAICompatibleConfig.from_params(api_key, api_base)
        return config_obj.validate()
    
    @staticmethod
    def validate_provider_config(provider_config: ProviderConfig) -> bool:
        """Validate any provider configuration."""
        return provider_config.validate()


class ProviderConfigFactory:
    """Factory for creating provider configurations."""
    
    @staticmethod
    def create_openai_compatible_config(
        api_key: str = None, 
        api_base: str = None
    ) -> OpenAICompatibleConfig:
        """Create OpenAI-compatible configuration."""
        return OpenAICompatibleConfig.from_params(api_key, api_base)
    
    @staticmethod
    def get_config_for_model(model_name: str, **kwargs) -> Optional[ProviderConfig]:
        """Get appropriate configuration for a model."""
        if model_name.startswith("openai-compatible/"):
            return ProviderConfigFactory.create_openai_compatible_config(
                kwargs.get('api_key'),
                kwargs.get('api_base')
            )
        return None
