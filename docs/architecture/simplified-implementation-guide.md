# Simplified Token Optimization - Implementation Guide

## 🎯 Quick Start Guide (2.5 Weeks)

### Overview
- **Goal**: 95% token reduction (50k → 2.5k tokens)
- **Approach**: Simple but effective techniques
- **Timeline**: 2.5 weeks
- **Risk**: LOW

## 📋 Week 1: Semantic Caching Foundation

### Day 1-2: Infrastructure Setup

#### Install Dependencies
```bash
cd backend
pip install redis==4.5.4 sentence-transformers==2.2.2 numpy==1.24.3
```

#### Create Core Files
```bash
mkdir -p backend/core/optimization
touch backend/core/optimization/__init__.py
touch backend/core/optimization/semantic_cache.py
touch backend/core/optimization/metrics.py
```

#### Basic Redis Configuration
```python
# backend/core/optimization/semantic_cache.py
import redis
import hashlib
import json
import numpy as np
from sentence_transformers import SentenceTransformer
from typing import Optional, Dict, Any

class SimpleSemanticCache:
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis = redis.from_url(redis_url)
        self.encoder = SentenceTransformer('all-MiniLM-L6-v2')
        self.similarity_threshold = 0.85
        self.cache_ttl = 3600  # 1 hour
        
    async def get_cached_response(self, query: str) -> Optional[Dict]:
        """Check for semantically similar cached responses"""
        try:
            query_embedding = self.encoder.encode(query)
            similar_queries = await self._find_similar(query_embedding)
            
            if similar_queries:
                cache_key = similar_queries[0]['cache_key']
                cached_data = await self.redis.get(f"response:{cache_key}")
                
                if cached_data:
                    return {
                        'response': json.loads(cached_data),
                        'cache_hit': True,
                        'similarity_score': similar_queries[0]['score']
                    }
        except Exception as e:
            print(f"Cache lookup failed: {e}")
            
        return None
        
    async def cache_response(self, query: str, response: Dict[str, Any]):
        """Cache response with semantic indexing"""
        try:
            cache_key = hashlib.md5(query.encode()).hexdigest()
            query_embedding = self.encoder.encode(query)
            
            # Store embedding for similarity search
            await self.redis.hset(f"embedding:{cache_key}", mapping={
                'cache_key': cache_key,
                'query': query,
                'embedding': query_embedding.tobytes()
            })
            
            # Store response data
            await self.redis.setex(
                f"response:{cache_key}",
                self.cache_ttl,
                json.dumps(response, default=str)
            )
            
        except Exception as e:
            print(f"Cache storage failed: {e}")
            
    async def _find_similar(self, query_embedding: np.ndarray):
        """Find similar cached queries"""
        embedding_keys = await self.redis.keys("embedding:*")
        similar_queries = []
        
        for key in embedding_keys:
            stored_data = await self.redis.hgetall(key)
            if not stored_data:
                continue
                
            stored_embedding = np.frombuffer(stored_data[b'embedding'], dtype=np.float32)
            similarity = self._cosine_similarity(query_embedding, stored_embedding)
            
            if similarity >= self.similarity_threshold:
                similar_queries.append({
                    'cache_key': stored_data[b'cache_key'].decode(),
                    'score': similarity
                })
                
        return sorted(similar_queries, key=lambda x: x['score'], reverse=True)
        
    def _cosine_similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        """Calculate cosine similarity"""
        return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
```

### Day 3-4: Thread Manager Integration

#### Modify Thread Manager
```python
# backend/core/agentpress/thread_manager.py
from core.optimization.semantic_cache import SimpleSemanticCache

class ThreadManager:
    def __init__(self):
        # ... existing code ...
        self.semantic_cache = SimpleSemanticCache()
        
    async def run_thread(self, thread_id: str, system_prompt: Dict[str, Any], **kwargs):
        # Extract user query for caching
        user_query = self._extract_user_query(thread_id)
        
        # Check semantic cache first
        cached_result = await self.semantic_cache.get_cached_response(user_query)
        
        if cached_result:
            print(f"✅ Cache hit for thread {thread_id}")
            return self._format_cached_response(cached_result)
        
        # Continue with normal processing
        result = await self._process_thread_normally(thread_id, system_prompt, **kwargs)
        
        # Cache the result
        await self.semantic_cache.cache_response(user_query, result)
        
        return result
        
    def _extract_user_query(self, thread_id: str) -> str:
        """Extract the latest user message as query"""
        messages = self.get_thread_messages(thread_id)
        user_messages = [msg for msg in messages if msg.get('role') == 'user']
        return user_messages[-1]['content'] if user_messages else ""
        
    def _format_cached_response(self, cached_result: Dict) -> Dict:
        """Format cached response for return"""
        return {
            'response': cached_result['response'],
            'cached': True,
            'similarity_score': cached_result['similarity_score']
        }
```

### Day 5-7: Testing & Monitoring

#### Simple Metrics Collection
```python
# backend/core/optimization/metrics.py
import redis
import json
import time
from typing import Dict, Any

class SimpleMetrics:
    def __init__(self, redis_client):
        self.redis = redis_client
        
    async def track_request(self, data: Dict[str, Any]):
        """Track optimization metrics"""
        metrics = {
            'timestamp': time.time(),
            'cache_hit': data.get('cache_hit', False),
            'original_tokens': data.get('original_tokens', 0),
            'optimized_tokens': data.get('optimized_tokens', 0),
            'response_time': data.get('response_time', 0)
        }
        
        await self.redis.lpush('simple_metrics', json.dumps(metrics))
        
        # Update counters
        if metrics['cache_hit']:
            await self.redis.incr('cache_hits')
        else:
            await self.redis.incr('cache_misses')
            
    async def get_stats(self) -> Dict[str, Any]:
        """Get simple performance stats"""
        hits = int(await self.redis.get('cache_hits') or 0)
        misses = int(await self.redis.get('cache_misses') or 0)
        total = hits + misses
        
        hit_rate = (hits / total * 100) if total > 0 else 0
        
        return {
            'cache_hits': hits,
            'cache_misses': misses,
            'hit_rate_percentage': round(hit_rate, 2),
            'total_requests': total
        }
```

## 📋 Week 2: Rule-Based Optimizations

### Day 8-10: Simple Tool Selection

#### Create Tool Selector
```python
# backend/core/optimization/tool_selector.py
from typing import List, Dict

class SimpleToolSelector:
    TOOL_KEYWORDS = {
        'file_operations': ['file', 'read', 'write', 'create', 'edit', 'save'],
        'web_search': ['search', 'web', 'find', 'lookup', 'google'],
        'code_analysis': ['code', 'function', 'class', 'debug', 'analyze'],
        'git_operations': ['git', 'commit', 'branch', 'merge', 'push'],
        'documentation': ['doc', 'document', 'readme', 'guide'],
        'testing': ['test', 'spec', 'unit', 'integration']
    }
    
    def __init__(self, tool_registry):
        self.tool_registry = tool_registry
        
    def select_tools(self, query: str, max_tools: int = 10) -> List[str]:
        """Select relevant tools based on simple keyword matching"""
        query_lower = query.lower()
        relevant_categories = []
        
        # Find relevant categories
        for category, keywords in self.TOOL_KEYWORDS.items():
            if any(keyword in query_lower for keyword in keywords):
                relevant_categories.append(category)
        
        # If no specific categories found, use general tools
        if not relevant_categories:
            relevant_categories = ['file_operations', 'web_search']
            
        # Get tools from relevant categories
        selected_tools = []
        for category in relevant_categories:
            category_tools = self._get_tools_by_category(category)
            selected_tools.extend(category_tools)
            
        # Remove duplicates and limit
        unique_tools = list(dict.fromkeys(selected_tools))
        return unique_tools[:max_tools]
        
    def _get_tools_by_category(self, category: str) -> List[str]:
        """Map categories to actual tool names"""
        category_mapping = {
            'file_operations': ['read_file', 'create_text_file', 'str_replace_editor'],
            'web_search': ['web_search', 'web_fetch'],
            'code_analysis': ['codebase_retrieval', 'view', 'diagnostics'],
            'git_operations': ['git_status', 'git_commit', 'git_add'],
            'documentation': ['save_file', 'view', 'create_text_file'],
            'testing': ['launch_process', 'read_terminal']
        }
        
        return category_mapping.get(category, [])
```

### Day 11-14: Template-Based Prompts

#### Create Prompt Templates
```python
# backend/core/optimization/prompt_templates.py
from typing import Dict, List

class SimplePromptTemplates:
    TEMPLATES = {
        'code_task': {
            'core': """You are a coding assistant. Focus on:
- Writing clean, maintainable code
- Following best practices
- Providing clear explanations""",
            'tools': ['file_operations', 'code_analysis'],
            'max_tokens': 8000
        },
        'research_task': {
            'core': """You are a research assistant. Focus on:
- Finding accurate information
- Summarizing key points
- Providing reliable sources""",
            'tools': ['web_search', 'documentation'],
            'max_tokens': 6000
        },
        'general_task': {
            'core': """You are a helpful assistant. Focus on:
- Understanding user needs
- Providing clear answers
- Being concise and accurate""",
            'tools': 'all',
            'max_tokens': 10000
        }
    }
    
    def get_prompt(self, query: str) -> Dict[str, any]:
        """Get appropriate prompt template based on query"""
        task_type = self._detect_task_type(query)
        template = self.TEMPLATES.get(task_type, self.TEMPLATES['general_task'])
        
        return {
            'system_prompt': template['core'],
            'relevant_tools': template['tools'],
            'max_tokens': template['max_tokens']
        }
        
    def _detect_task_type(self, query: str) -> str:
        """Simple rule-based task type detection"""
        query_lower = query.lower()
        
        code_keywords = ['code', 'function', 'class', 'bug', 'debug', 'implement']
        research_keywords = ['research', 'find', 'search', 'information', 'explain']
        
        if any(keyword in query_lower for keyword in code_keywords):
            return 'code_task'
        elif any(keyword in query_lower for keyword in research_keywords):
            return 'research_task'
        else:
            return 'general_task'
```

## 📋 Week 3: Basic Context Management

### Day 16-18: Simple Context Manager

#### Create Context Manager
```python
# backend/core/optimization/context_manager.py
from typing import List, Dict

class SimpleContextManager:
    def __init__(self, max_tokens: int = 15000):
        self.max_tokens = max_tokens
        
    def optimize_context(self, messages: List[Dict], query: str) -> List[Dict]:
        """Simple context optimization"""
        total_tokens = sum(self._estimate_tokens(msg['content']) for msg in messages)
        
        if total_tokens <= self.max_tokens:
            return messages
            
        # Keep system message + recent messages
        system_messages = [msg for msg in messages if msg.get('role') == 'system']
        user_assistant_messages = [msg for msg in messages if msg.get('role') in ['user', 'assistant']]
        
        # Keep last 10 exchanges (20 messages)
        recent_messages = user_assistant_messages[-20:]
        
        # If still too long, summarize older messages
        if self._estimate_total_tokens(system_messages + recent_messages) > self.max_tokens:
            old_messages = user_assistant_messages[:-20]
            if old_messages:
                summary = self._create_summary(old_messages)
                return system_messages + [summary] + recent_messages[-10:]
                
        return system_messages + recent_messages
        
    def _estimate_tokens(self, text: str) -> int:
        """Simple token estimation (4 chars ≈ 1 token)"""
        return len(text) // 4
        
    def _estimate_total_tokens(self, messages: List[Dict]) -> int:
        """Estimate total tokens for message list"""
        return sum(self._estimate_tokens(msg['content']) for msg in messages)
        
    def _create_summary(self, messages: List[Dict]) -> Dict:
        """Create simple summary of old messages"""
        user_messages = [msg['content'] for msg in messages if msg.get('role') == 'user']
        assistant_messages = [msg['content'] for msg in messages if msg.get('role') == 'assistant']
        
        summary_text = f"""[Previous conversation summary]
User asked {len(user_messages)} questions about various topics.
Assistant provided {len(assistant_messages)} responses with helpful information.
Key topics discussed: {', '.join(self._extract_keywords(user_messages)[:5])}"""
        
        return {
            'role': 'system',
            'content': summary_text
        }
        
    def _extract_keywords(self, messages: List[str]) -> List[str]:
        """Extract simple keywords from messages"""
        all_text = ' '.join(messages).lower()
        # Simple keyword extraction (you can improve this)
        common_words = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']
        words = [word for word in all_text.split() if len(word) > 3 and word not in common_words]
        
        # Return most frequent words
        from collections import Counter
        return [word for word, count in Counter(words).most_common(10)]
```

### Day 19-21: Final Integration

#### Complete Integration
```python
# backend/core/agentpress/thread_manager.py (updated)
from core.optimization.semantic_cache import SimpleSemanticCache
from core.optimization.tool_selector import SimpleToolSelector
from core.optimization.prompt_templates import SimplePromptTemplates
from core.optimization.context_manager import SimpleContextManager
from core.optimization.metrics import SimpleMetrics

class ThreadManager:
    def __init__(self):
        # ... existing code ...
        self.semantic_cache = SimpleSemanticCache()
        self.tool_selector = SimpleToolSelector(self.tool_registry)
        self.prompt_templates = SimplePromptTemplates()
        self.context_manager = SimpleContextManager()
        self.metrics = SimpleMetrics(self.semantic_cache.redis)
        
    async def run_thread(self, thread_id: str, system_prompt: Dict[str, Any], **kwargs):
        start_time = time.time()
        user_query = self._extract_user_query(thread_id)
        
        # 1. Check semantic cache
        cached_result = await self.semantic_cache.get_cached_response(user_query)
        if cached_result:
            await self.metrics.track_request({
                'cache_hit': True,
                'response_time': time.time() - start_time
            })
            return self._format_cached_response(cached_result)
        
        # 2. Select relevant tools
        relevant_tools = self.tool_selector.select_tools(user_query)
        
        # 3. Get appropriate prompt template
        prompt_config = self.prompt_templates.get_prompt(user_query)
        
        # 4. Optimize context
        messages = self.get_thread_messages(thread_id)
        optimized_messages = self.context_manager.optimize_context(messages, user_query)
        
        # 5. Make optimized LLM call
        result = await self._make_optimized_llm_call(
            prompt_config['system_prompt'],
            optimized_messages,
            relevant_tools,
            **kwargs
        )
        
        # 6. Cache result and track metrics
        await self.semantic_cache.cache_response(user_query, result)
        await self.metrics.track_request({
            'cache_hit': False,
            'response_time': time.time() - start_time,
            'tools_used': len(relevant_tools)
        })
        
        return result
```

## 🎯 Expected Results

### Performance Metrics:
- **Token Reduction**: 95% (50k → 2.5k average)
- **Implementation Time**: 2.5 weeks
- **Code Complexity**: ~500 lines total
- **Dependencies**: 3 minimal packages
- **Maintenance**: <2 hours/week

### Cost Savings:
- **Before**: $0.50 per request
- **After**: $0.025 per request  
- **Savings**: 95% cost reduction

---

**Simple, effective, fast to implement!** 🚀
