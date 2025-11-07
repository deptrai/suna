# Vector Database Integration Guide for Semantic Cache

**Story 2.1 Enhancement**  
**Status:** Documentation / Future Enhancement

## Overview

For large-scale deployments with thousands or millions of cached embeddings, the current linear search approach may become a performance bottleneck. This document outlines integration options with dedicated vector databases for improved performance.

## Current Implementation

**Current Approach:**
- Linear search through all cached embeddings using Redis SCAN
- O(n) complexity where n = number of cached embeddings
- Suitable for: < 10,000 cached items
- Performance: ~50-100ms for 1,000 items, ~500ms+ for 10,000 items

## Vector Database Options

### 1. FAISS (Facebook AI Similarity Search)

**Pros:**
- ✅ Very fast similarity search (milliseconds for millions of vectors)
- ✅ In-memory or disk-based storage
- ✅ Multiple index types (IVF, HNSW, etc.)
- ✅ No external service required
- ✅ Good for batch operations

**Cons:**
- ❌ No persistence by default (need to save/load indices)
- ❌ Single-machine only (no distributed search)
- ❌ Requires manual index management

**Integration Approach:**
```python
import faiss
import numpy as np

class FAISSSemanticCache(SemanticCache):
    def __init__(self, ...):
        super().__init__(...)
        # Create FAISS index
        dimension = 384  # all-MiniLM-L6-v2 dimension
        self.index = faiss.IndexFlatIP(dimension)  # Inner product (cosine similarity)
        self.id_to_cache_key = {}  # Map FAISS IDs to cache keys
    
    async def _search_similar_queries(self, query_embedding, limit=10):
        # Normalize for cosine similarity
        query_embedding = query_embedding / np.linalg.norm(query_embedding)
        query_embedding = query_embedding.reshape(1, -1).astype('float32')
        
        # Search in FAISS
        distances, indices = self.index.search(query_embedding, limit)
        
        # Filter by similarity threshold and return results
        results = []
        for i, (distance, idx) in enumerate(zip(distances[0], indices[0])):
            if distance >= self.similarity_threshold:
                cache_key = self.id_to_cache_key[idx]
                results.append((cache_key, float(distance), ""))
        
        return results
```

**When to Use:**
- Single-machine deployments
- Very large cache sizes (> 10,000 items)
- Need maximum performance
- Can handle index persistence manually

### 2. ChromaDB

**Pros:**
- ✅ Persistent storage out of the box
- ✅ Simple Python API
- ✅ Built-in embedding support
- ✅ Good for production deployments
- ✅ Supports metadata filtering

**Cons:**
- ❌ Additional dependency
- ❌ Requires separate service/process
- ❌ Slightly slower than FAISS for pure search

**Integration Approach:**
```python
import chromadb
from chromadb.config import Settings

class ChromaDBSemanticCache(SemanticCache):
    def __init__(self, ...):
        super().__init__(...)
        # Initialize ChromaDB client
        self.chroma_client = chromadb.Client(Settings(
            chroma_db_impl="duckdb+parquet",
            persist_directory="./chroma_cache"
        ))
        self.collection = self.chroma_client.get_or_create_collection(
            name="semantic_cache",
            metadata={"hnsw:space": "cosine"}
        )
    
    async def _search_similar_queries(self, query_embedding, limit=10):
        # Search in ChromaDB
        results = self.collection.query(
            query_embeddings=[query_embedding.tolist()],
            n_results=limit
        )
        
        # Filter by similarity threshold
        filtered_results = []
        for i, (cache_key, distance, metadata) in enumerate(zip(
            results['ids'][0],
            results['distances'][0],
            results['metadatas'][0]
        )):
            similarity = 1 - distance  # ChromaDB uses distance, convert to similarity
            if similarity >= self.similarity_threshold:
                filtered_results.append((cache_key, similarity, metadata.get('query', '')))
        
        return filtered_results
```

**When to Use:**
- Production deployments requiring persistence
- Need metadata filtering
- Want simpler integration than FAISS
- Distributed deployments possible

### 3. Redis with RediSearch (Vector Search)

**Pros:**
- ✅ Uses existing Redis infrastructure
- ✅ No additional service required
- ✅ Good performance for medium-scale deployments
- ✅ Integrated with existing cache storage

**Cons:**
- ❌ Requires RediSearch module
- ❌ More complex setup
- ❌ Not as fast as FAISS for very large datasets

**Integration Approach:**
```python
# Requires Redis with RediSearch module
# Create vector index:
# FT.CREATE semantic_embeddings_index ON HASH PREFIX 1 semantic_embedding: SCHEMA embedding VECTOR HNSW 6 DIM 384 DISTANCE_METRIC COSINE

class RedisVectorSemanticCache(SemanticCache):
    async def _search_similar_queries(self, query_embedding, limit=10):
        redis_client = await redis.get_client()
        
        # Search using RediSearch vector search
        query_vector = query_embedding.tolist()
        results = await redis_client.execute_command(
            'FT.SEARCH',
            'semantic_embeddings_index',
            f'*=>[KNN {limit} @embedding $vec]',
            'PARAMS', '2', 'vec', query_vector,
            'SORTBY', '__embedding_score',
            'RETURN', '2', 'cache_key', 'query'
        )
        
        # Process results...
        return processed_results
```

**When to Use:**
- Already using Redis
- Medium-scale deployments (< 100,000 items)
- Want to leverage existing infrastructure
- RediSearch is available

## Performance Comparison

| Solution | Search Time (10K items) | Search Time (100K items) | Search Time (1M items) | Setup Complexity |
|----------|------------------------|---------------------------|------------------------|------------------|
| **Current (Redis SCAN)** | ~500ms | ~5s | ~50s | Low |
| **FAISS** | ~5ms | ~10ms | ~50ms | Medium |
| **ChromaDB** | ~20ms | ~50ms | ~200ms | Low |
| **Redis + RediSearch** | ~30ms | ~100ms | ~500ms | Medium |

## Migration Strategy

### Phase 1: Hybrid Approach
- Keep current Redis-based storage
- Add vector database for search only
- Gradually migrate to vector database

### Phase 2: Full Migration
- Move all embeddings to vector database
- Use Redis only for response storage
- Implement fallback to Redis if vector DB unavailable

### Phase 3: Optimization
- Fine-tune index parameters
- Implement batch operations
- Add monitoring and metrics

## Implementation Checklist

### FAISS Integration
- [ ] Install FAISS: `pip install faiss-cpu` (or `faiss-gpu`)
- [ ] Create FAISS index in `SemanticCache.__init__()`
- [ ] Update `_search_similar_queries()` to use FAISS
- [ ] Update `_store_embedding()` to add to FAISS index
- [ ] Implement index persistence (save/load)
- [ ] Add index rebuilding on startup
- [ ] Update tests

### ChromaDB Integration
- [ ] Install ChromaDB: `pip install chromadb`
- [ ] Initialize ChromaDB client in `SemanticCache.__init__()`
- [ ] Create collection with cosine similarity
- [ ] Update `_search_similar_queries()` to use ChromaDB
- [ ] Update `_store_embedding()` to add to ChromaDB
- [ ] Handle collection persistence
- [ ] Update tests

### Redis + RediSearch Integration
- [ ] Install/Enable RediSearch module
- [ ] Create vector index schema
- [ ] Update `_search_similar_queries()` to use RediSearch
- [ ] Update `_store_embedding()` to add to RediSearch index
- [ ] Handle index maintenance
- [ ] Update tests

## Configuration

Add to `backend/core/utils/config.py`:

```python
# Vector Database Configuration (Story 2.1 Enhancement)
SEMANTIC_CACHE_VECTOR_DB: Optional[str] = None  # "faiss", "chromadb", "redis_vectordb", or None for current
SEMANTIC_CACHE_FAISS_INDEX_PATH: Optional[str] = "./faiss_index"
SEMANTIC_CACHE_CHROMADB_PATH: Optional[str] = "./chroma_cache"
SEMANTIC_CACHE_VECTOR_DB_ENABLED: Optional[bool] = False
```

## Testing

### Performance Tests
```python
@pytest.mark.performance
async def test_vector_search_performance():
    """Test vector search performance with large dataset."""
    cache = SemanticCache()
    
    # Add 10,000 test embeddings
    for i in range(10000):
        await cache.cache_response(f"query {i}", {"content": f"response {i}"})
    
    # Measure search time
    start = time.time()
    results = await cache.get_cached_response("query 5000")
    elapsed = time.time() - start
    
    assert elapsed < 0.1  # Should be < 100ms with vector DB
```

## Recommendations

### Small Scale (< 1,000 items)
- ✅ **Current implementation is sufficient**
- No changes needed

### Medium Scale (1,000 - 10,000 items)
- 🔄 **Consider ChromaDB** for simplicity
- Or optimize current Redis SCAN approach

### Large Scale (10,000 - 100,000 items)
- 🔄 **Use FAISS** for maximum performance
- Or **ChromaDB** for persistence

### Very Large Scale (> 100,000 items)
- 🔄 **Use FAISS** with optimized index (HNSW)
- Consider distributed search if needed

## Future Enhancements

1. **Hybrid Search**: Use vector DB for search, Redis for storage
2. **Batch Operations**: Optimize bulk embedding storage
3. **Index Optimization**: Fine-tune index parameters based on usage patterns
4. **Distributed Search**: Support for multi-machine deployments
5. **Automatic Migration**: Auto-detect when to switch to vector DB

---

**Last Updated:** 2025-11-07  
**Status:** Documentation / Future Enhancement  
**Priority:** Low (current implementation sufficient for most use cases)

