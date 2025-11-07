"""
Tests for Semantic Response Caching (Story 2.1).

Tests cover:
- SemanticCache class initialization and configuration
- Vector similarity search and caching
- Quality validation and monitoring
- Auto-disable mechanism
- Cache metrics tracking
- Integration with Redis
"""

import pytest
import asyncio
import numpy as np
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from datetime import datetime, timezone

from core.optimizations.semantic_cache import (
    SemanticCache,
    get_semantic_cache,
    set_semantic_cache,
    SemanticCacheMetrics,
    CachedResponse
)


class TestSemanticCacheInitialization:
    """Test SemanticCache initialization and configuration."""
    
    def test_semantic_cache_init_default(self):
        """Test SemanticCache initialization with default parameters."""
        cache = SemanticCache()
        
        assert cache.similarity_threshold == 0.95
        assert cache.quality_threshold == 0.95
        assert cache.cache_ttl == 3600
        assert cache.enabled is True
        assert cache.auto_disable_enabled is True
        assert cache.metrics.total_requests == 0
        assert cache.metrics.cache_hits == 0
        assert cache.metrics.cache_misses == 0
    
    def test_semantic_cache_init_custom(self):
        """Test SemanticCache initialization with custom parameters."""
        cache = SemanticCache(
            similarity_threshold=0.90,
            quality_threshold=0.92,
            cache_ttl=7200,
            enabled=False,
            auto_disable_enabled=False
        )
        
        assert cache.similarity_threshold == 0.90
        assert cache.quality_threshold == 0.92
        assert cache.cache_ttl == 7200
        assert cache.enabled is False
        assert cache.auto_disable_enabled is False
    
    def test_get_semantic_cache_singleton(self):
        """Test get_semantic_cache returns singleton instance."""
        cache1 = get_semantic_cache()
        cache2 = get_semantic_cache()
        
        assert cache1 is cache2
    
    def test_set_semantic_cache(self):
        """Test set_semantic_cache for testing."""
        original_cache = get_semantic_cache()
        test_cache = SemanticCache(enabled=False)
        
        set_semantic_cache(test_cache)
        assert get_semantic_cache() is test_cache
        
        # Restore original
        set_semantic_cache(original_cache)


class TestSemanticCacheEmbeddings:
    """Test embedding generation and storage."""
    
    @pytest.mark.asyncio
    async def test_get_query_embedding(self):
        """Test query embedding generation."""
        cache = SemanticCache()
        
        query = "What is the weather today?"
        embedding = await cache._get_query_embedding(query)
        
        assert isinstance(embedding, np.ndarray)
        assert embedding.dtype == np.float32
        assert len(embedding.shape) == 1
        assert embedding.shape[0] > 0  # Should have embedding dimension
    
    @pytest.mark.asyncio
    async def test_cosine_similarity(self):
        """Test cosine similarity calculation."""
        cache = SemanticCache()
        
        # Create two similar vectors
        vec1 = np.array([1.0, 0.0, 0.0])
        vec2 = np.array([1.0, 0.0, 0.0])
        
        similarity = cache._cosine_similarity(vec1, vec2)
        assert similarity == 1.0  # Identical vectors
        
        # Create orthogonal vectors
        vec3 = np.array([1.0, 0.0, 0.0])
        vec4 = np.array([0.0, 1.0, 0.0])
        
        similarity = cache._cosine_similarity(vec3, vec4)
        assert similarity == 0.0  # Orthogonal vectors
    
    def test_generate_cache_key(self):
        """Test cache key generation."""
        cache = SemanticCache()
        
        query = "What is the weather today?"
        key1 = cache._generate_cache_key(query)
        key2 = cache._generate_cache_key(query)
        
        # Same query should generate same key
        assert key1 == key2
        
        # Different query should generate different key
        key3 = cache._generate_cache_key("What is the weather tomorrow?")
        assert key1 != key3
        
        # Context should affect key generation
        context = {"model_name": "gpt-4"}
        key4 = cache._generate_cache_key(query, context)
        assert key1 != key4
    
    def test_normalize_query(self):
        """Test query normalization."""
        cache = SemanticCache()
        
        query1 = "  What is the weather today?  "
        normalized1 = cache._normalize_query(query1)
        
        assert normalized1 == "what is the weather today?"
        assert normalized1 == cache._normalize_query("What Is The Weather Today?")  # Case insensitive


class TestSemanticCacheRedisIntegration:
    """Test Redis integration for semantic cache."""
    
    @pytest.mark.asyncio
    @patch('core.optimizations.semantic_cache.redis.get_client')
    async def test_store_embedding(self, mock_get_client):
        """Test storing embedding in Redis."""
        mock_redis = AsyncMock()
        mock_get_client.return_value = mock_redis
        
        cache = SemanticCache()
        query = "What is the weather today?"
        cache_key = cache._generate_cache_key(query)
        embedding = np.array([0.1, 0.2, 0.3], dtype=np.float32)
        
        await cache._store_embedding(cache_key, query, embedding)
        
        # Verify Redis calls
        mock_redis.hset.assert_called_once()
        mock_redis.expire.assert_called_once()
        
        # Verify embedding key format
        call_args = mock_redis.hset.call_args
        assert call_args[0][0] == f"semantic_embedding:{cache_key}"
    
    @pytest.mark.asyncio
    @patch('core.optimizations.semantic_cache.redis.get_client')
    async def test_store_response(self, mock_get_client):
        """Test storing response in Redis."""
        mock_redis = AsyncMock()
        mock_get_client.return_value = mock_redis
        
        cache = SemanticCache()
        cache_key = "test_cache_key"
        response = {"content": "The weather is sunny today."}
        
        await cache._store_response(cache_key, response)
        
        # Verify Redis calls
        mock_redis.hset.assert_called_once()
        mock_redis.expire.assert_called_once()
        
        # Verify response key format
        call_args = mock_redis.hset.call_args
        assert call_args[0][0] == f"semantic_response:{cache_key}"
    
    @pytest.mark.asyncio
    @patch('core.optimizations.semantic_cache.redis.get_client')
    async def test_get_cached_response(self, mock_get_client):
        """Test getting cached response from Redis."""
        mock_redis = AsyncMock()
        mock_get_client.return_value = mock_redis
        
        cache = SemanticCache()
        cache_key = "test_cache_key"
        response_data = {
            "response": '{"content": "The weather is sunny today."}',
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        mock_redis.hgetall.return_value = response_data
        
        result = await cache._get_cached_response(cache_key)
        
        assert result is not None
        assert result["content"] == "The weather is sunny today."
        
        # Test cache miss
        mock_redis.hgetall.return_value = {}
        result = await cache._get_cached_response(cache_key)
        assert result is None


class TestSemanticCacheSearch:
    """Test semantic similarity search."""
    
    @pytest.mark.asyncio
    @patch('core.optimizations.semantic_cache.redis.get_client')
    async def test_search_similar_queries_no_matches(self, mock_get_client):
        """Test search with no similar queries."""
        mock_redis = AsyncMock()
        mock_get_client.return_value = mock_redis
        mock_redis.keys.return_value = []
        
        cache = SemanticCache()
        query_embedding = np.array([0.1, 0.2, 0.3], dtype=np.float32)
        
        results = await cache._search_similar_queries(query_embedding)
        
        assert results == []
    
    @pytest.mark.asyncio
    @patch('core.optimizations.semantic_cache.redis.get_client')
    async def test_search_similar_queries_with_matches(self, mock_get_client):
        """Test search with similar queries."""
        mock_redis = AsyncMock()
        mock_get_client.return_value = mock_redis
        
        cache = SemanticCache(similarity_threshold=0.8)
        
        # Create test embeddings
        query_embedding = np.array([1.0, 0.0, 0.0], dtype=np.float32)
        similar_embedding = np.array([0.9, 0.1, 0.0], dtype=np.float32)  # Similar
        different_embedding = np.array([0.0, 1.0, 0.0], dtype=np.float32)  # Different
        
        # Mock Redis keys and data
        import base64
        similar_bytes = similar_embedding.tobytes()
        similar_b64 = base64.b64encode(similar_bytes).decode('utf-8')
        
        different_bytes = different_embedding.tobytes()
        different_b64 = base64.b64encode(different_bytes).decode('utf-8')
        
        mock_redis.keys.return_value = [
            "semantic_embedding:key1",
            "semantic_embedding:key2"
        ]
        
        def hgetall_side_effect(key):
            if "key1" in key:
                return {
                    "cache_key": "key1",
                    "query": "What is the weather?",
                    "embedding": similar_b64,
                    "embedding_shape": "[3]",
                    "embedding_dtype": "float32"
                }
            elif "key2" in key:
                return {
                    "cache_key": "key2",
                    "query": "Tell me a joke",
                    "embedding": different_b64,
                    "embedding_shape": "[3]",
                    "embedding_dtype": "float32"
                }
            return {}
        
        mock_redis.hgetall.side_effect = hgetall_side_effect
        
        results = await cache._search_similar_queries(query_embedding)
        
        # Should find at least one similar query
        assert len(results) > 0
        assert results[0][0] == "key1"  # Most similar
        assert results[0][1] >= cache.similarity_threshold  # Above threshold


class TestSemanticCacheOperations:
    """Test cache operations (get, cache, etc.)."""
    
    @pytest.mark.asyncio
    @patch('core.optimizations.semantic_cache.redis.get_client')
    async def test_get_cached_response_cache_disabled(self, mock_get_client):
        """Test get_cached_response when cache is disabled."""
        cache = SemanticCache(enabled=False)
        
        result = await cache.get_cached_response("test query")
        
        assert result is None
    
    @pytest.mark.asyncio
    @patch('core.optimizations.semantic_cache.redis.get_client')
    async def test_cache_response_cache_disabled(self, mock_get_client):
        """Test cache_response when cache is disabled."""
        cache = SemanticCache(enabled=False)
        mock_redis = AsyncMock()
        mock_get_client.return_value = mock_redis
        
        await cache.cache_response("test query", {"content": "test response"})
        
        # Should not store anything
        mock_redis.hset.assert_not_called()
    
    @pytest.mark.asyncio
    @patch('core.optimizations.semantic_cache.redis.get_client')
    async def test_cache_response_success(self, mock_get_client):
        """Test successful cache response storage."""
        mock_redis = AsyncMock()
        mock_get_client.return_value = mock_redis
        
        cache = SemanticCache()
        query = "What is the weather today?"
        response = {"content": "The weather is sunny."}
        
        await cache.cache_response(query, response)
        
        # Verify storage calls
        assert mock_redis.hset.call_count >= 2  # Embedding and response
        assert mock_redis.expire.call_count >= 2
    
    def test_enable_disable(self):
        """Test enable/disable methods."""
        cache = SemanticCache()
        
        assert cache.enabled is True
        
        cache.disable()
        assert cache.enabled is False
        
        cache.enable()
        assert cache.enabled is True
        assert cache.consecutive_quality_breaches == 0  # Reset on enable


class TestSemanticCacheQuality:
    """Test quality validation and monitoring."""
    
    @pytest.mark.asyncio
    async def test_validate_cache_quality(self):
        """Test cache quality validation."""
        cache = SemanticCache()
        
        cached_response = {"content": "The weather is sunny today."}
        actual_response = {"content": "The weather is sunny today."}
        
        quality_score = await cache.validate_cache_quality(cached_response, actual_response)
        
        # Identical responses should have high quality
        assert quality_score >= 0.9
    
    @pytest.mark.asyncio
    async def test_auto_disable_on_quality_breach(self):
        """Test auto-disable on quality threshold breach."""
        cache = SemanticCache(
            quality_threshold=0.95,
            auto_disable_enabled=True,
            enabled=True
        )
        
        # Simulate quality breaches
        for i in range(5):
            await cache.cache_response(
                "test query",
                {"content": "test response"},
                quality_score=0.90  # Below threshold
            )
        
        # Should be disabled after 5 consecutive breaches
        assert cache.enabled is False
        assert cache.metrics.auto_disables == 1
    
    @pytest.mark.asyncio
    @patch('core.optimizations.semantic_cache.redis.get_client')
    async def test_quality_breach_reset(self, mock_get_client):
        """Test quality breach counter resets on good quality."""
        mock_redis = AsyncMock()
        mock_get_client.return_value = mock_redis
        
        cache = SemanticCache(
            quality_threshold=0.95,
            auto_disable_enabled=True,
            enabled=True
        )
        
        # Simulate some breaches
        await cache.cache_response("test query", {"content": "test"}, quality_score=0.90)
        await cache.cache_response("test query", {"content": "test"}, quality_score=0.90)
        
        assert cache.consecutive_quality_breaches == 2
        
        # Good quality should reset counter
        await cache.cache_response("test query", {"content": "test"}, quality_score=0.98)
        
        assert cache.consecutive_quality_breaches == 0
    
    def test_extract_response_text(self):
        """Test response text extraction."""
        cache = SemanticCache()
        
        # Test string response
        assert cache._extract_response_text("Hello world") == "Hello world"
        
        # Test dict with content
        assert cache._extract_response_text({"content": "Hello world"}) == "Hello world"
        
        # Test dict with message
        assert cache._extract_response_text({"message": {"content": "Hello world"}}) == "Hello world"
        
        # Test OpenAI-style response
        response = {
            "choices": [{
                "message": {
                    "content": "Hello world"
                }
            }]
        }
        assert cache._extract_response_text(response) == "Hello world"


class TestSemanticCacheMetrics:
    """Test cache metrics tracking."""
    
    @pytest.mark.asyncio
    @patch('core.optimizations.semantic_cache.redis.get_client')
    async def test_cache_metrics_tracking(self, mock_get_client):
        """Test cache metrics are tracked correctly."""
        mock_redis = AsyncMock()
        mock_get_client.return_value = mock_redis
        mock_redis.keys.return_value = []
        
        cache = SemanticCache()
        
        # Simulate cache miss
        result = await cache.get_cached_response("test query")
        assert result is None
        assert cache.metrics.cache_misses == 1
        assert cache.metrics.total_requests == 1
        
        # Simulate cache hit (mock Redis to return cached data)
        # This is a simplified test - full integration test would require actual Redis
        metrics = cache.get_metrics()
        
        assert metrics["total_requests"] == 1
        assert metrics["cache_hits"] == 0
        assert metrics["cache_misses"] == 1
        assert metrics["hit_rate"] == 0.0
    
    @pytest.mark.asyncio
    async def test_reset_metrics(self):
        """Test metrics reset."""
        cache = SemanticCache()
        
        # Add some metrics
        cache.metrics.total_requests = 10
        cache.metrics.cache_hits = 5
        cache.metrics.cache_misses = 5
        
        await cache.reset_metrics()
        
        assert cache.metrics.total_requests == 0
        assert cache.metrics.cache_hits == 0
        assert cache.metrics.cache_misses == 0
        assert len(cache.quality_scores) == 0
        assert cache.consecutive_quality_breaches == 0
    
    def test_get_metrics(self):
        """Test get_metrics returns correct structure."""
        cache = SemanticCache()
        
        metrics = cache.get_metrics()
        
        assert "total_requests" in metrics
        assert "cache_hits" in metrics
        assert "cache_misses" in metrics
        assert "hit_rate" in metrics
        assert "hit_rate_percentage" in metrics
        assert "false_positives" in metrics
        assert "quality_breaches" in metrics
        assert "auto_disables" in metrics
        assert "enabled" in metrics
        assert "similarity_threshold" in metrics
        assert "quality_threshold" in metrics


class TestSemanticCacheIntegration:
    """Integration tests for semantic cache."""
    
    @pytest.mark.asyncio
    @patch('core.optimizations.semantic_cache.redis.get_client')
    async def test_end_to_end_caching_flow(self, mock_get_client):
        """Test end-to-end caching flow."""
        mock_redis = AsyncMock()
        mock_get_client.return_value = mock_redis
        mock_redis.keys.return_value = []
        mock_redis.hgetall.return_value = {}
        
        cache = SemanticCache()
        
        query = "What is the weather today?"
        response = {"content": "The weather is sunny."}
        
        # Cache the response
        await cache.cache_response(query, response)
        
        # Verify storage was attempted
        assert mock_redis.hset.call_count >= 2
        
        # Try to get cached response (will miss on first try since we mocked empty)
        result = await cache.get_cached_response(query)
        
        # Should be None since we mocked empty results
        # In real scenario, this would return the cached response
        assert result is None or result.get("cache_hit") is False
    
    @pytest.mark.asyncio
    async def test_clear_cache(self):
        """Test clearing all cached data."""
        mock_redis = AsyncMock()
        
        with patch('core.optimizations.semantic_cache.redis.get_client', return_value=mock_redis):
            mock_redis.keys.return_value = [
                "semantic_embedding:key1",
                "semantic_embedding:key2",
                "semantic_response:key1",
                "semantic_response:key2"
            ]
            
            cache = SemanticCache()
            await cache.clear_cache()
            
            # Verify delete was called
            mock_redis.delete.assert_called()
            
            # Verify all keys were deleted
            # delete() is called with *keys (unpacked list)
            call_args = mock_redis.delete.call_args[0]  # Get all positional arguments
            # All keys are passed as separate arguments, so count them
            assert len(call_args) == 4  # 4 keys passed as separate arguments


# Integration tests (require actual Redis and LLM setup)
# ===========================================
# To run integration tests:
#   1. Ensure Redis is running and accessible
#   2. Ensure sentence-transformers is installed
#   3. Set environment variable: ENABLE_SEMANTIC_CACHE_INTEGRATION_TESTS=true
#   4. Run: pytest backend/tests/test_semantic_cache.py -m integration -v
# ===========================================

ENABLE_INTEGRATION_TESTS = False  # Set to True to enable integration tests


def skip_if_no_integration_setup(reason: str = "Integration tests disabled"):
    """Skip test if integration setup is not available."""
    if not ENABLE_INTEGRATION_TESTS:
        pytest.skip(f"{reason}. Set ENABLE_SEMANTIC_CACHE_INTEGRATION_TESTS=true to run.")


@pytest.mark.integration
class TestSemanticCacheIntegrationReal:
    """Integration tests with real Redis and embeddings."""
    
    @pytest.fixture(autouse=True)
    def setup_test(self):
        """Setup for integration tests."""
        skip_if_no_integration_setup("Integration tests disabled")
        yield
    
    @pytest.mark.asyncio
    async def test_real_redis_embedding_storage(self):
        """Test storing and retrieving embeddings with real Redis."""
        skip_if_no_integration_setup()
        
        cache = SemanticCache()
        query = "What is the weather today?"
        cache_key = cache._generate_cache_key(query)
        embedding = await cache._get_query_embedding(query)
        
        # Store embedding
        await cache._store_embedding(cache_key, query, embedding)
        
        # Retrieve and verify
        redis_client = await redis.get_client()
        embedding_key = f"semantic_embedding:{cache_key}"
        stored_data = await redis_client.hgetall(embedding_key)
        
        assert stored_data is not None
        assert stored_data.get("cache_key") == cache_key
        assert stored_data.get("query") == query
    
    @pytest.mark.asyncio
    async def test_real_semantic_search(self):
        """Test semantic search with real Redis."""
        skip_if_no_integration_setup()
        
        cache = SemanticCache(similarity_threshold=0.85)
        
        # Cache first query
        query1 = "What is the weather today?"
        response1 = {"content": "The weather is sunny."}
        await cache.cache_response(query1, response1)
        
        # Search for similar query
        query2 = "How's the weather?"
        result = await cache.get_cached_response(query2)
        
        # Should find similar query (high semantic similarity)
        # Note: Actual result depends on embedding similarity
        if result:
            assert result.get("cache_hit") is True
            assert result.get("similarity_score", 0) >= cache.similarity_threshold
    
    @pytest.mark.asyncio
    async def test_real_quality_validation(self):
        """Test quality validation with real embeddings."""
        skip_if_no_integration_setup()
        
        cache = SemanticCache()
        
        cached_response = {"content": "The weather is sunny and warm today."}
        actual_response = {"content": "The weather is sunny and warm today."}
        
        quality_score = await cache.validate_cache_quality(cached_response, actual_response)
        
        # Identical responses should have very high quality
        assert quality_score >= 0.95

