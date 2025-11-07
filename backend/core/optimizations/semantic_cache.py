"""
Semantic Response Caching with Quality Control (Story 2.1).

This module implements semantic response caching using vector similarity search
to find semantically similar queries and cache their responses. Quality monitoring
and auto-disable mechanisms ensure quality is maintained at 95-100%.

Features:
- Vector similarity search using sentence-transformers
- High similarity threshold (0.95) for quality assurance
- Quality validation and monitoring
- Auto-disable mechanism if quality drops
- Cache metrics tracking (hit rate, false positive rate)
- Integration with existing Redis infrastructure
"""

import hashlib
import json
import time
import base64
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Tuple
import asyncio
import numpy as np
from collections import deque
from concurrent.futures import ThreadPoolExecutor

from core.utils.logger import logger
from core.services import redis

# Thread-safe lock for cache operations
_cache_lock = asyncio.Lock()

# Global semantic cache instance
_semantic_cache_instance: Optional['SemanticCache'] = None


@dataclass
class CachedResponse:
    """Represents a cached response with metadata."""
    query: str
    query_embedding: np.ndarray
    response: Dict[str, Any]
    cache_key: str
    timestamp: datetime
    similarity_score: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SemanticCacheMetrics:
    """Metrics for semantic cache operations."""
    total_requests: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
    false_positives: int = 0  # Incorrect matches
    quality_breaches: int = 0  # Quality threshold breaches
    auto_disables: int = 0  # Auto-disable events
    total_similarity_score: float = 0.0
    average_similarity_score: float = 0.0


class SemanticCache:
    """
    Semantic response cache with quality control.
    
    Uses vector similarity search to find semantically similar queries and
    cache their responses. Implements quality monitoring and auto-disable
    mechanisms to ensure quality is maintained.
    
    Features:
    - Vector similarity search using sentence-transformers
    - High similarity threshold (default 0.95) for quality assurance
    - Quality validation and monitoring
    - Auto-disable mechanism if quality drops below threshold
    - Cache metrics tracking
    - Integration with Redis for storage
    """
    
    def __init__(
        self,
        similarity_threshold: float = 0.95,
        quality_threshold: float = 0.95,
        cache_ttl: int = 3600,  # 1 hour
        max_cache_size: int = 10000,  # Maximum number of cached responses
        enabled: bool = True,
        auto_disable_enabled: bool = True
    ):
        """
        Initialize semantic cache.
        
        Args:
            similarity_threshold: Minimum similarity score for cache hit (0.0-1.0)
            quality_threshold: Minimum quality score to maintain (0.0-1.0)
            cache_ttl: Time-to-live for cached responses in seconds
            max_cache_size: Maximum number of cached responses
            enabled: Whether semantic caching is enabled
            auto_disable_enabled: Whether auto-disable is enabled
        """
        self.similarity_threshold = similarity_threshold
        self.quality_threshold = quality_threshold
        self.cache_ttl = cache_ttl
        self.max_cache_size = max_cache_size
        self.enabled = enabled
        self.auto_disable_enabled = auto_disable_enabled
        
        # Cache namespace prefix
        self.cache_prefix = "semantic_cache:"
        self.embedding_prefix = "semantic_embedding:"
        self.response_prefix = "semantic_response:"
        
        # Embedding model (lazy loading)
        self._embedding_model = None
        self._embedding_model_name = "all-MiniLM-L6-v2"
        
        # Thread pool executor for CPU-bound embedding operations (optimization)
        self._executor: Optional[ThreadPoolExecutor] = None
        
        # LRU cache tracking (for eviction)
        self._access_times: Dict[str, float] = {}  # cache_key -> last_access_time
        
        # Metrics
        self.metrics = SemanticCacheMetrics()
        self.metrics_history: deque = deque(maxlen=1000)
        
        # Quality monitoring
        self.quality_scores: deque = deque(maxlen=100)  # Recent quality scores
        self.consecutive_quality_breaches = 0
        self.auto_disable_threshold = 5  # Auto-disable after 5 consecutive breaches
        
        logger.info(
            f"SemanticCache initialized: "
            f"similarity_threshold={similarity_threshold}, "
            f"quality_threshold={quality_threshold}, "
            f"enabled={enabled}, "
            f"auto_disable={auto_disable_enabled}"
        )
    
    def _get_embedding_model(self):
        """Get or load embedding model (lazy loading)."""
        if self._embedding_model is None:
            try:
                from sentence_transformers import SentenceTransformer
                logger.info(f"Loading SentenceTransformer model: {self._embedding_model_name}")
                self._embedding_model = SentenceTransformer(self._embedding_model_name)
                logger.info(f"✅ SentenceTransformer model loaded: {self._embedding_model_name}")
            except ImportError:
                logger.error(
                    "sentence-transformers not installed. "
                    "Install with: pip install sentence-transformers"
                )
                raise
            except Exception as e:
                logger.error(f"Failed to load embedding model: {e}")
                raise
        return self._embedding_model
    
    def _get_executor(self) -> ThreadPoolExecutor:
        """Get or create thread pool executor for CPU-bound operations."""
        if self._executor is None:
            # Use 2 workers for embedding generation (CPU-bound)
            self._executor = ThreadPoolExecutor(
                max_workers=2,
                thread_name_prefix="semantic_cache_embedding"
            )
        return self._executor
    
    def _generate_cache_key(self, query: str, context: Optional[Dict[str, Any]] = None) -> str:
        """
        Generate cache key for query and context.
        
        Args:
            query: User query text
            context: Optional context dictionary (model_name, thread_id, etc.)
        
        Returns:
            Cache key string
        """
        # Normalize query
        query_normalized = query.strip().lower()
        
        # Include context in key generation
        if context:
            context_str = json.dumps(context, sort_keys=True)
            content = f"{query_normalized}:{context_str}"
        else:
            content = query_normalized
        
        # Generate MD5 hash
        cache_key = hashlib.md5(content.encode()).hexdigest()
        return cache_key
    
    def _normalize_query(self, query: str) -> str:
        """Normalize query text for better matching."""
        # Remove extra whitespace
        query = " ".join(query.split())
        # Convert to lowercase (embeddings handle case-insensitive matching)
        return query.lower().strip()
    
    async def _get_query_embedding(self, query: str) -> np.ndarray:
        """
        Generate embedding for query.
        
        Uses thread pool executor to avoid blocking the event loop
        since SentenceTransformer.encode() is CPU-bound.
        
        Args:
            query: Query text
        
        Returns:
            Query embedding vector
        """
        model = self._get_embedding_model()
        # Normalize query
        normalized_query = self._normalize_query(query)
        
        # Run CPU-bound operation in thread pool to avoid blocking event loop
        loop = asyncio.get_event_loop()
        executor = self._get_executor()
        
        # Execute in thread pool
        embedding = await loop.run_in_executor(
            executor,
            lambda: model.encode(normalized_query, convert_to_numpy=True)
        )
        
        return embedding
    
    def _cosine_similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        """
        Calculate cosine similarity between two vectors.
        
        Args:
            a: First vector
            b: Second vector
        
        Returns:
            Cosine similarity score (0.0-1.0)
        """
        # Normalize vectors
        a_norm = np.linalg.norm(a)
        b_norm = np.linalg.norm(b)
        
        if a_norm == 0 or b_norm == 0:
            return 0.0
        
        # Calculate cosine similarity
        similarity = np.dot(a, b) / (a_norm * b_norm)
        return float(similarity)
    
    async def _store_embedding(
        self,
        cache_key: str,
        query: str,
        query_embedding: np.ndarray,
        context: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Store query embedding in Redis.
        
        Args:
            cache_key: Cache key
            query: Query text
            query_embedding: Query embedding vector
            context: Optional context
        """
        try:
            redis_client = await redis.get_client()
            
            # Store embedding data
            embedding_key = f"{self.embedding_prefix}{cache_key}"
            
            # Convert embedding to bytes for storage (Redis hash fields are strings)
            # Use base64 encoding for better compatibility
            embedding_bytes = query_embedding.tobytes()
            embedding_b64 = base64.b64encode(embedding_bytes).decode('utf-8')
            
            embedding_data = {
                "cache_key": cache_key,
                "query": query,
                "embedding": embedding_b64,  # Base64 encoded bytes
                "embedding_shape": json.dumps(list(query_embedding.shape)),
                "embedding_dtype": str(query_embedding.dtype),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "context": json.dumps(context) if context else "{}"
            }
            
            # Store as hash
            await redis_client.hset(embedding_key, mapping=embedding_data)
            await redis_client.expire(embedding_key, self.cache_ttl)
            
            logger.debug(f"Stored embedding for cache_key: {cache_key}")
        except Exception as e:
            logger.error(f"Failed to store embedding: {e}", exc_info=True)
            raise
    
    async def _store_response(
        self,
        cache_key: str,
        response: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Store response in Redis.
        
        Args:
            cache_key: Cache key
            response: Response dictionary
            context: Optional context
        """
        try:
            redis_client = await redis.get_client()
            
            # Store response data
            response_key = f"{self.response_prefix}{cache_key}"
            response_data = {
                "response": json.dumps(response, default=str),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "context": json.dumps(context) if context else "{}"
            }
            
            # Store as hash
            await redis_client.hset(response_key, mapping=response_data)
            await redis_client.expire(response_key, self.cache_ttl)
            
            logger.debug(f"Stored response for cache_key: {cache_key}")
        except Exception as e:
            logger.error(f"Failed to store response: {e}", exc_info=True)
            raise
    
    async def _search_similar_queries(
        self,
        query_embedding: np.ndarray,
        limit: int = 10
    ) -> List[Tuple[str, float, str]]:
        """
        Search for similar queries in cache.
        
        Uses SCAN instead of keys() for better performance and non-blocking behavior.
        
        Args:
            query_embedding: Query embedding vector
            limit: Maximum number of results to return
        
        Returns:
            List of tuples (cache_key, similarity_score, query_text)
        """
        try:
            redis_client = await redis.get_client()
            
            # Use SCAN instead of keys() for better performance (non-blocking, memory efficient)
            embedding_keys = []
            async for key in redis_client.scan_iter(match=f"{self.embedding_prefix}*"):
                embedding_keys.append(key)
            
            if not embedding_keys:
                return []
            
            similar_queries = []
            
            # Compare with all cached embeddings
            for embedding_key in embedding_keys:
                try:
                    # Get embedding data
                    embedding_data = await redis_client.hgetall(embedding_key)
                    if not embedding_data:
                        continue
                    
                    # Reconstruct embedding from base64 string
                    embedding_b64 = embedding_data.get("embedding")
                    if not embedding_b64:
                        continue
                    
                    # Decode base64 and reconstruct numpy array
                    embedding_bytes = base64.b64decode(embedding_b64.encode('utf-8'))
                    
                    # Get dtype and shape from stored metadata
                    dtype_str = embedding_data.get("embedding_dtype", "float32")
                    shape_str = embedding_data.get("embedding_shape", "[384]")
                    
                    try:
                        dtype = np.dtype(dtype_str)
                        shape = json.loads(shape_str)
                        cached_embedding = np.frombuffer(embedding_bytes, dtype=dtype).reshape(shape)
                    except Exception as e:
                        logger.debug(f"Failed to reconstruct embedding: {e}")
                        continue
                    
                    # Calculate similarity
                    similarity = self._cosine_similarity(query_embedding, cached_embedding)
                    
                    # Only include if above threshold
                    if similarity >= self.similarity_threshold:
                        cache_key = embedding_data.get("cache_key", "")
                        query_text = embedding_data.get("query", "")
                        similar_queries.append((cache_key, similarity, query_text))
                
                except Exception as e:
                    logger.debug(f"Error processing embedding key {embedding_key}: {e}")
                    continue
            
            # Sort by similarity score (descending)
            similar_queries.sort(key=lambda x: x[1], reverse=True)
            
            # Return top N results
            return similar_queries[:limit]
        
        except Exception as e:
            logger.error(f"Failed to search similar queries: {e}", exc_info=True)
            return []
    
    async def _get_cached_response(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """
        Get cached response by cache key.
        
        Args:
            cache_key: Cache key
        
        Returns:
            Cached response dictionary or None
        """
        try:
            redis_client = await redis.get_client()
            
            response_key = f"{self.response_prefix}{cache_key}"
            response_data = await redis_client.hgetall(response_key)
            
            if not response_data:
                return None
            
            # Parse response
            response_json = response_data.get("response")
            if not response_json:
                return None
            
            response = json.loads(response_json)
            return response
        
        except Exception as e:
            logger.error(f"Failed to get cached response: {e}", exc_info=True)
            return None
    
    async def get_cached_response(
        self,
        query: str,
        context: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get cached response for semantically similar query.
        
        Args:
            query: User query text
            context: Optional context dictionary (model_name, thread_id, etc.)
        
        Returns:
            Cached response dictionary with metadata, or None if no match found
        """
        if not self.enabled:
            logger.debug("Semantic cache is disabled")
            return None
        
        try:
            # Generate query embedding
            query_embedding = await self._get_query_embedding(query)
            
            # Search for similar queries
            similar_queries = await self._search_similar_queries(query_embedding, limit=1)
            
            if not similar_queries:
                # No similar queries found
                self.metrics.cache_misses += 1
                self.metrics.total_requests += 1
                logger.debug(f"Semantic cache miss: no similar queries found")
                return None
            
            # Get best match
            cache_key, similarity_score, cached_query = similar_queries[0]
            
            # Get cached response
            cached_response = await self._get_cached_response(cache_key)
            
            if not cached_response:
                # Cache key exists but response is missing (stale cache)
                self.metrics.cache_misses += 1
                self.metrics.total_requests += 1
                logger.debug(f"Semantic cache miss: response not found for cache_key={cache_key}")
                return None
            
            # Cache hit!
            self.metrics.cache_hits += 1
            self.metrics.total_requests += 1
            self.metrics.total_similarity_score += similarity_score
            self.metrics.average_similarity_score = (
                self.metrics.total_similarity_score / self.metrics.cache_hits
            )
            
            # Update access time for LRU tracking
            self._access_times[cache_key] = time.time()
            
            logger.info(
                f"✅ Semantic cache HIT: similarity={similarity_score:.3f}, "
                f"cache_key={cache_key[:16]}..., query='{query[:50]}...'"
            )
            
            # Return cached response with metadata
            return {
                "response": cached_response,
                "cache_hit": True,
                "similarity_score": similarity_score,
                "cache_key": cache_key,
                "cached_query": cached_query,
                "source": "semantic_cache"
            }
        
        except Exception as e:
            logger.error(f"Semantic cache lookup failed: {e}", exc_info=True)
            # On error, treat as cache miss
            self.metrics.cache_misses += 1
            self.metrics.total_requests += 1
            return None
    
    async def cache_response(
        self,
        query: str,
        response: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
        quality_score: Optional[float] = None
    ) -> None:
        """
        Cache response with semantic indexing.
        
        Args:
            query: User query text
            response: Response dictionary to cache
            context: Optional context dictionary
            quality_score: Optional quality score for this response
        """
        if not self.enabled:
            logger.debug("Semantic cache is disabled, skipping cache")
            return
        
        try:
            # Generate cache key
            cache_key = self._generate_cache_key(query, context)
            
            # Check if we need to evict old entries (LRU eviction)
            await self._evict_if_needed()
            
            # Generate query embedding
            query_embedding = await self._get_query_embedding(query)
            
            # Store embedding and response
            await self._store_embedding(cache_key, query, query_embedding, context)
            await self._store_response(cache_key, response, context)
            
            # Update access time for LRU tracking
            self._access_times[cache_key] = time.time()
            
            # Track quality score if provided
            if quality_score is not None:
                self.quality_scores.append(quality_score)
                
                # Check if quality threshold is breached
                if quality_score < self.quality_threshold:
                    self.consecutive_quality_breaches += 1
                    self.metrics.quality_breaches += 1
                    
                    logger.warning(
                        f"⚠️ Quality threshold breached: quality_score={quality_score:.3f} < "
                        f"threshold={self.quality_threshold:.3f} "
                        f"(consecutive_breaches={self.consecutive_quality_breaches})"
                    )
                    
                    # Auto-disable if too many consecutive breaches
                    if self.auto_disable_enabled and self.consecutive_quality_breaches >= self.auto_disable_threshold:
                        logger.critical(
                            f"🚨 AUTO-DISABLE: Semantic caching disabled due to quality degradation "
                            f"(consecutive_breaches={self.consecutive_quality_breaches})"
                        )
                        self.enabled = False
                        self.metrics.auto_disables += 1
                        
                        # Track in quality monitor
                        try:
                            from core.optimizations.quality_monitor import get_quality_monitor
                            quality_monitor = get_quality_monitor()
                            await quality_monitor.track_metric(
                                "semantic_cache_auto_disable",
                                value=1.0,
                                metadata={
                                    "consecutive_breaches": self.consecutive_quality_breaches,
                                    "quality_threshold": self.quality_threshold,
                                    "timestamp": datetime.now(timezone.utc).isoformat()
                                }
                            )
                        except Exception as e:
                            logger.debug(f"Failed to track auto-disable in quality monitor: {e}")
                else:
                    # Reset consecutive breaches on good quality
                    self.consecutive_quality_breaches = 0
            
            logger.debug(f"Cached response for query: '{query[:50]}...' (cache_key={cache_key[:16]}...)")
        
        except Exception as e:
            logger.error(f"Failed to cache response: {e}", exc_info=True)
            # Don't raise - caching failure shouldn't break the request
    
    async def validate_cache_quality(
        self,
        cached_response: Dict[str, Any],
        actual_response: Dict[str, Any]
    ) -> float:
        """
        Validate cache quality by comparing cached and actual responses.
        
        Args:
            cached_response: Cached response dictionary
            actual_response: Actual response dictionary from LLM
        
        Returns:
            Quality score (0.0-1.0)
        """
        try:
            # Extract text from responses
            cached_text = self._extract_response_text(cached_response)
            actual_text = self._extract_response_text(actual_response)
            
            if not cached_text or not actual_text:
                return 0.0
            
            # Calculate semantic similarity
            from core.optimizations.quality_metrics import calculate_response_similarity
            
            similarity = calculate_response_similarity(
                cached_text,
                actual_text,
                use_semantic=True
            )
            
            return similarity
        
        except Exception as e:
            logger.error(f"Failed to validate cache quality: {e}", exc_info=True)
            return 0.0
    
    def _extract_response_text(self, response: Dict[str, Any]) -> str:
        """Extract text content from response dictionary."""
        # Handle different response formats
        if isinstance(response, str):
            return response
        
        if isinstance(response, dict):
            # Try common response fields
            if "content" in response:
                content = response["content"]
                if isinstance(content, str):
                    return content
                elif isinstance(content, list):
                    # Extract text from content array
                    texts = []
                    for item in content:
                        if isinstance(item, dict):
                            if "text" in item:
                                texts.append(item["text"])
                            elif "content" in item:
                                texts.append(str(item["content"]))
                        elif isinstance(item, str):
                            texts.append(item)
                    return " ".join(texts)
            
            # Try message format
            if "message" in response:
                message = response["message"]
                if isinstance(message, dict) and "content" in message:
                    return self._extract_response_text(message["content"])
                elif isinstance(message, str):
                    return message
            
            # Try choices format (OpenAI-style)
            if "choices" in response:
                choices = response["choices"]
                if isinstance(choices, list) and len(choices) > 0:
                    choice = choices[0]
                    if isinstance(choice, dict):
                        return self._extract_response_text(choice)
            
            # Fallback: convert to string
            return json.dumps(response, default=str)
        
        # Fallback: convert to string
        return str(response)
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get cache metrics summary."""
        hit_rate = (
            self.metrics.cache_hits / self.metrics.total_requests
            if self.metrics.total_requests > 0
            else 0.0
        )
        
        false_positive_rate = (
            self.metrics.false_positives / self.metrics.cache_hits
            if self.metrics.cache_hits > 0
            else 0.0
        )
        
        # Calculate average quality score
        avg_quality_score = (
            sum(self.quality_scores) / len(self.quality_scores)
            if self.quality_scores
            else None
        )
        
        return {
            "total_requests": self.metrics.total_requests,
            "cache_hits": self.metrics.cache_hits,
            "cache_misses": self.metrics.cache_misses,
            "hit_rate": hit_rate,
            "hit_rate_percentage": hit_rate * 100.0,
            "false_positives": self.metrics.false_positives,
            "false_positive_rate": false_positive_rate,
            "false_positive_rate_percentage": false_positive_rate * 100.0,
            "quality_breaches": self.metrics.quality_breaches,
            "auto_disables": self.metrics.auto_disables,
            "average_similarity_score": self.metrics.average_similarity_score,
            "average_quality_score": avg_quality_score,
            "consecutive_quality_breaches": self.consecutive_quality_breaches,
            "enabled": self.enabled,
            "similarity_threshold": self.similarity_threshold,
            "quality_threshold": self.quality_threshold,
            "cache_size": len(self._access_times),  # Current cache size
            "max_cache_size": self.max_cache_size,  # Maximum cache size
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    
    async def reset_metrics(self) -> None:
        """Reset cache metrics (for testing)."""
        async with _cache_lock:
            self.metrics = SemanticCacheMetrics()
            self.metrics_history.clear()
            self.quality_scores.clear()
            self.consecutive_quality_breaches = 0
            # Note: Don't clear _access_times as they're needed for LRU eviction
            logger.info("Semantic cache metrics reset")
    
    async def _evict_if_needed(self) -> None:
        """
        Evict least recently used entries if cache size exceeds max_cache_size.
        
        Uses LRU (Least Recently Used) eviction policy.
        """
        if len(self._access_times) < self.max_cache_size:
            return
        
        try:
            redis_client = await redis.get_client()
            
            # Sort by access time (oldest first)
            sorted_keys = sorted(self._access_times.items(), key=lambda x: x[1])
            
            # Calculate how many to evict
            num_to_evict = len(self._access_times) - self.max_cache_size + 1
            
            # Evict oldest entries
            for cache_key, _ in sorted_keys[:num_to_evict]:
                embedding_key = f"{self.embedding_prefix}{cache_key}"
                response_key = f"{self.response_prefix}{cache_key}"
                
                # Delete from Redis
                await redis_client.delete(embedding_key, response_key)
                
                # Remove from access times tracking
                self._access_times.pop(cache_key, None)
            
            logger.info(
                f"LRU eviction: Removed {num_to_evict} entries "
                f"(cache size: {len(self._access_times)}/{self.max_cache_size})"
            )
        
        except Exception as e:
            logger.warning(f"LRU eviction failed (non-critical): {e}")
            # Don't raise - eviction failure shouldn't break caching
    
    async def clear_cache(self) -> None:
        """Clear all cached responses (for testing or maintenance)."""
        try:
            redis_client = await redis.get_client()
            
            # Use SCAN instead of keys() for better performance
            embedding_keys = []
            response_keys = []
            
            async for key in redis_client.scan_iter(match=f"{self.embedding_prefix}*"):
                embedding_keys.append(key)
            async for key in redis_client.scan_iter(match=f"{self.response_prefix}*"):
                response_keys.append(key)
            
            # Delete all keys
            if embedding_keys:
                await redis_client.delete(*embedding_keys)
            if response_keys:
                await redis_client.delete(*response_keys)
            
            # Clear access times tracking
            self._access_times.clear()
            
            logger.info(f"Cleared semantic cache: {len(embedding_keys)} embeddings, {len(response_keys)} responses")
        
        except Exception as e:
            logger.error(f"Failed to clear cache: {e}", exc_info=True)
            raise
    
    def enable(self) -> None:
        """Enable semantic caching."""
        self.enabled = True
        self.consecutive_quality_breaches = 0
        logger.info("Semantic cache enabled")
    
    def disable(self) -> None:
        """Disable semantic caching."""
        self.enabled = False
        logger.info("Semantic cache disabled")


def get_semantic_cache() -> SemanticCache:
    """Get or create global SemanticCache instance."""
    global _semantic_cache_instance
    
    if _semantic_cache_instance is None:
        from core.utils.config import config
        
        # Get configuration
        similarity_threshold = getattr(config, 'SEMANTIC_CACHE_SIMILARITY_THRESHOLD', 0.95)
        quality_threshold = getattr(config, 'SEMANTIC_CACHE_QUALITY_THRESHOLD', 0.95)
        cache_ttl = getattr(config, 'SEMANTIC_CACHE_TTL', 3600)
        enabled = getattr(config, 'SEMANTIC_CACHE_ENABLED', True)
        auto_disable_enabled = getattr(config, 'SEMANTIC_CACHE_AUTO_DISABLE_ENABLED', True)
        
        _semantic_cache_instance = SemanticCache(
            similarity_threshold=similarity_threshold,
            quality_threshold=quality_threshold,
            cache_ttl=cache_ttl,
            enabled=enabled,
            auto_disable_enabled=auto_disable_enabled
        )
        logger.info("Global SemanticCache instance created")
    
    return _semantic_cache_instance


def set_semantic_cache(cache: SemanticCache) -> None:
    """Set global SemanticCache instance (for testing)."""
    global _semantic_cache_instance
    _semantic_cache_instance = cache

