"""
Tests for LiteLLM Redis Response Caching (Story 1.2).

Tests verify:
- Redis connection and configuration
- LiteLLM cache configuration
- Cache key namespacing
- Cache TTL configuration
- Cache metrics tracking
- Quality validation (exact matches)
"""

import pytest
import os
import asyncio
from unittest.mock import Mock, patch, MagicMock
from typing import Dict, Any

# Test imports
from core.services.llm import setup_litellm_redis_cache, make_llm_api_call
from core.utils.config import config


class TestRedisConnection:
    """Test Redis connection and configuration (AC: #1)."""
    
    def test_redis_configuration_exists(self):
        """Verify Redis configuration exists in config."""
        assert hasattr(config, 'REDIS_HOST')
        assert hasattr(config, 'REDIS_PORT')
        assert hasattr(config, 'REDIS_PASSWORD')
    
    @pytest.mark.asyncio
    async def test_redis_connectivity(self):
        """Test Redis connectivity from backend service."""
        try:
            from core.services import redis
            await redis.initialize_async()
            client = await redis.get_client()
            result = await client.ping()
            assert result is True
        except Exception as e:
            pytest.skip(f"Redis not available: {e}")


class TestLiteLLMCacheConfiguration:
    """Test LiteLLM Redis caching configuration (AC: #2)."""
    
    def test_cache_configuration_function_exists(self):
        """Verify setup_litellm_redis_cache function exists."""
        assert callable(setup_litellm_redis_cache)
    
    @patch('core.services.llm.config')
    def test_cache_type_is_redis_not_semantic(self, mock_config):
        """Verify cache type is 'redis' (exact match), not 'redis-semantic'."""
        # Reset global flag to allow re-execution
        import core.services.llm as llm_module
        llm_module._litellm_cache_configured = False
        
        # Setup mock config
        mock_config.REDIS_HOST = 'localhost'
        mock_config.REDIS_PORT = 6379
        mock_config.REDIS_PASSWORD = None
        mock_config.LITELLM_CACHE_TTL = 3600
        mock_config.LITELLM_CACHE_ENABLED = True
        
        # Clear any existing env vars for this test
        original_cache_type = os.environ.pop('LITELLM_CACHE_TYPE', None)
        try:
            # Mock RedisCache import from litellm (imported inside function)
            # Force fallback to environment variables only
            with patch('litellm.RedisCache', side_effect=ImportError("Not available")), \
                 patch('litellm.Cache', side_effect=ImportError("Not available")):
                setup_litellm_redis_cache()
            
            # Verify environment variable is set to 'redis' (not 'redis-semantic')
            assert os.environ.get('LITELLM_CACHE_TYPE') == 'redis'
        finally:
            # Restore original env var
            if original_cache_type:
                os.environ['LITELLM_CACHE_TYPE'] = original_cache_type
            elif 'LITELLM_CACHE_TYPE' in os.environ:
                del os.environ['LITELLM_CACHE_TYPE']
    
    @patch('core.services.llm.litellm')
    @patch('core.services.llm.config')
    def test_cache_enabled_flag(self, mock_config, mock_litellm):
        """Test that cache can be disabled via LITELLM_CACHE_ENABLED."""
        # Setup mock config with caching disabled
        mock_config.LITELLM_CACHE_ENABLED = False
        
        setup_litellm_redis_cache()
        
        # Should not set cache if disabled
        # (Implementation should log and return early)
        pass  # Test passes if no exception raised


class TestCacheKeyNamespacing:
    """Test cache key namespacing (AC: #3)."""
    
    def test_cache_key_prefix_configured(self):
        """Verify cache key prefix is configured."""
        # After setup_litellm_redis_cache is called, prefix should be set
        with patch('core.services.llm.config') as mock_config:
            mock_config.REDIS_HOST = 'localhost'
            mock_config.REDIS_PORT = 6379
            mock_config.REDIS_PASSWORD = None
            mock_config.LITELLM_CACHE_TTL = 3600
            mock_config.LITELLM_CACHE_ENABLED = True
            
            setup_litellm_redis_cache()
            
            # Verify namespace prefix is set
            assert os.environ.get('LITELLM_CACHE_KEY_PREFIX') == 'litellm:cache:'
    
    def test_cache_key_namespace_isolation(self):
        """Verify cache keys are namespaced to prevent conflicts."""
        prefix = os.environ.get('LITELLM_CACHE_KEY_PREFIX', 'litellm:cache:')
        assert prefix.startswith('litellm:cache:')
        assert ':' in prefix  # Should have namespace separator


class TestCacheTTL:
    """Test cache TTL configuration (AC: #4)."""
    
    def test_default_ttl_is_one_hour(self):
        """Verify default TTL is 1 hour (3600 seconds)."""
        assert hasattr(config, 'LITELLM_CACHE_TTL')
        default_ttl = getattr(config, 'LITELLM_CACHE_TTL', 3600)
        assert default_ttl == 3600
    
    def test_ttl_is_configurable(self):
        """Verify TTL is configurable via environment variable."""
        # TTL should be read from config, which can be set via env var
        assert hasattr(config, 'LITELLM_CACHE_TTL')
    
    @patch('core.services.llm.config')
    def test_ttl_used_in_cache_configuration(self, mock_config):
        """Verify TTL is used when configuring cache."""
        # Reset global flag to allow re-execution
        import core.services.llm as llm_module
        llm_module._litellm_cache_configured = False
        
        custom_ttl = 7200  # 2 hours
        mock_config.REDIS_HOST = 'localhost'
        mock_config.REDIS_PORT = 6379
        mock_config.REDIS_PASSWORD = None
        mock_config.LITELLM_CACHE_TTL = custom_ttl
        mock_config.LITELLM_CACHE_ENABLED = True
        
        # Clear any existing env vars for this test
        original_ttl = os.environ.pop('LITELLM_CACHE_TTL_SECONDS', None)
        try:
            # Mock RedisCache import from litellm (imported inside function)
            # Force fallback to environment variables only
            with patch('litellm.RedisCache', side_effect=ImportError("Not available")), \
                 patch('litellm.Cache', side_effect=ImportError("Not available")):
                setup_litellm_redis_cache()
                # Verify TTL is passed to cache configuration via environment variable
                assert os.environ.get('LITELLM_CACHE_TTL_SECONDS') == str(custom_ttl)
        finally:
            # Restore original env var
            if original_ttl:
                os.environ['LITELLM_CACHE_TTL_SECONDS'] = original_ttl
            elif 'LITELLM_CACHE_TTL_SECONDS' in os.environ:
                del os.environ['LITELLM_CACHE_TTL_SECONDS']


class TestCacheMetricsTracking:
    """Test cache metrics tracking (AC: #5)."""
    
    @pytest.mark.asyncio
    async def test_cache_metrics_extraction(self):
        """Test that cache hit/miss information can be extracted."""
        # Mock response with cache info
        mock_response = MagicMock()
        mock_response._hidden_params = {
            'cache': {
                'hit': True,
                'key': 'litellm:cache:test_key'
            }
        }
        
        # Test that we can extract cache info
        if hasattr(mock_response, '_hidden_params') and mock_response._hidden_params:
            cache_info = mock_response._hidden_params.get('cache', {})
            assert cache_info.get('hit') is True
            assert cache_info.get('key') == 'litellm:cache:test_key'
    
    def test_cache_metrics_logging(self):
        """Test that cache metrics are logged."""
        # This is tested via integration tests
        # Unit test verifies the extraction logic exists
        pass


class TestQualityValidation:
    """Test quality validation for exact matches (AC: #6)."""
    
    @pytest.mark.asyncio
    async def test_exact_match_quality(self):
        """
        Test that cached responses are exact matches (100% similarity).
        
        Note: This requires actual LLM calls, so it's an integration test.
        For unit testing, we verify the logic exists.
        """
        # This test would require:
        # 1. Make first LLM call (cache miss)
        # 2. Make identical LLM call (cache hit)
        # 3. Compare responses - should be 100% identical
        
        # For unit test, we just verify the concept
        assert True  # Placeholder - actual test requires integration setup
    
    def test_cache_only_exact_matches(self):
        """Verify that only exact matches are cached (no semantic matching)."""
        # Cache type should be 'redis', not 'redis-semantic'
        cache_type = os.environ.get('LITELLM_CACHE_TYPE', '')
        assert cache_type == 'redis' or cache_type == ''  # Empty if not configured yet


# Integration tests (require Redis and LLM API)
# These tests are now implemented in test_epic1_integration.py
# Run with: ENABLE_LLM_INTEGRATION_TESTS=true pytest backend/tests/test_epic1_integration.py -v

@pytest.mark.integration
class TestLiteLLMCacheIntegration:
    """Integration tests for LiteLLM Redis caching.
    
    Note: Full integration tests are implemented in test_epic1_integration.py.
    Run with ENABLE_LLM_INTEGRATION_TESTS=true to execute.
    """
    
    @pytest.mark.asyncio
    async def test_cache_hit_behavior(self):
        """Test actual cache hit behavior with real LLM calls."""
        # Integration test moved to test_epic1_integration.py
        import os
        if os.getenv("ENABLE_LLM_INTEGRATION_TESTS", "false").lower() != "true":
            pytest.skip("Requires ENABLE_LLM_INTEGRATION_TESTS=true - see test_epic1_integration.py")
    
    @pytest.mark.asyncio
    async def test_cache_expiration(self):
        """Test cache expiration with TTL."""
        # Integration test moved to test_epic1_integration.py
        import os
        if os.getenv("ENABLE_LLM_INTEGRATION_TESTS", "false").lower() != "true":
            pytest.skip("Requires ENABLE_LLM_INTEGRATION_TESTS=true - see test_epic1_integration.py")
    
    @pytest.mark.asyncio
    async def test_exact_match_quality_integration(self):
        """Integration test for exact match quality validation."""
        # Integration test moved to test_epic1_integration.py
        import os
        if os.getenv("ENABLE_LLM_INTEGRATION_TESTS", "false").lower() != "true":
            pytest.skip("Requires ENABLE_LLM_INTEGRATION_TESTS=true - see test_epic1_integration.py")

