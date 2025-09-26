# ChainLens Auto Model Selection - Implementation Plan

Dựa trên phân tích chi tiết chat flow và cost optimization research, đây là plan hoàn chỉnh để integrate intelligent model selection vào hệ thống ChainLens với minimal changes.

## 🎯 **Objectives & Constraints**

### ✅ **Must Have:**
- ✅ Chỉ thêm "auto" model option
- ✅ Không thay đổi existing architecture  
- ✅ Minimal code changes
- ✅ Backward compatibility hoàn toàn
- ✅ Cost optimization logic cơ bản

### 🎯 **Expected Outcomes:**
- 📉 **50-70% cost reduction** cho typical usage patterns
- ⚡ **2-3x faster response** cho simple queries 
- 🔄 **Intelligent fallback** khi primary model fails
- 📊 **Basic analytics** để track performance

---

## 📋 **Phase 1: Core Auto Detection (Week 1-2)**

### 🔹 **Frontend Changes**

#### **1.1 Add "Auto" Option to Model Selection**

**File:** `frontend/hooks/_use-model-selection.ts` (hoặc tương đương)

```typescript
// Add "auto" to model options
const MODEL_OPTIONS = [
  { value: 'auto', label: '🤖 Auto (Smart)', description: 'AI selects optimal model' },
  { value: 'openai/gpt-4o', label: 'GPT-4o', description: 'Premium model' },
  { value: 'anthropic/claude-3-sonnet', label: 'Claude Sonnet', description: 'Premium model' },
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', description: 'Balanced model' },
  // ... existing options
];

// Update hook logic
export function useModelSelection() {
  const [selectedModel, setSelectedModel] = useState('auto'); // Default to auto
  
  return {
    selectedModel,
    setSelectedModel,
    isAutoMode: selectedModel === 'auto',
    modelOptions: MODEL_OPTIONS
  };
}
```

#### **1.2 Update UI Components**

**File:** `frontend/components/chat-input.tsx`

```typescript
// Add visual indicator for auto mode
{isAutoMode && (
  <div className="flex items-center gap-1 text-xs text-blue-600">
    <BrainIcon className="w-3 h-3" />
    <span>AI will select optimal model</span>
  </div>
)}
```

---

### 🔹 **Backend Core Changes**

#### **2.1 Create Auto Model Selection Service**

**New File:** `backend/core/services/auto_model_selector.py`

```python
"""
Intelligent Model Selection Service for ChainLens
Minimal implementation focusing on core optimization logic
"""

import re
from typing import Dict, Any, Optional, Tuple
from core.utils.logger import logger

class ComplexityScore:
    """Simple data class for complexity analysis results"""
    def __init__(self, score: float, confidence: float, reasoning: str):
        self.score = score  # 0.0 to 1.0
        self.confidence = confidence  # 0.0 to 1.0
        self.reasoning = reasoning

class AutoModelSelector:
    """
    Lightweight intelligent model selector
    Based on research but simplified for minimal integration
    """
    
    def __init__(self):
        # Model tiers with cost and capability information
        self.model_tiers = {
            'ultra_budget': {
                'models': ['openai/gpt-4o-mini', 'deepseek-chat'],
                'cost_multiplier': 0.1,
                'max_complexity': 0.3,
                'use_case': 'Simple Q&A, basic lookup'
            },
            'balanced': {
                'models': ['anthropic/claude-3-haiku', 'openai/gpt-4o-mini'],
                'cost_multiplier': 0.3,
                'max_complexity': 0.7,
                'use_case': 'Analysis, coding, moderate complexity'
            },
            'premium': {
                'models': ['openai/gpt-4o', 'anthropic/claude-3-sonnet'],
                'cost_multiplier': 1.0,
                'max_complexity': 1.0,
                'use_case': 'Complex reasoning, creative tasks'
            }
        }
        
        # Simple heuristics for complexity detection
        self.complexity_patterns = {
            'simple': {
                'patterns': [
                    r'^(what is|who is|when|where)',
                    r'^(giá|price) (của|of)',
                    r'^(define|meaning)'
                ],
                'score': 0.1
            },
            'moderate': {
                'patterns': [
                    r'(how|why|explain|describe)',
                    r'(so sánh|compare)',
                    r'(phân tích|analyze)',
                ],
                'score': 0.5
            },
            'complex': {
                'patterns': [
                    r'(viết code|write code|implement)',
                    r'(create|design|build)',
                    r'(strategy|plan|approach)',
                    r'(evaluate|assess|judge)'
                ],
                'score': 0.8
            }
        }
    
    def analyze_query_complexity(self, query: str, context: Dict[str, Any] = None) -> ComplexityScore:
        """
        Analyze query complexity using lightweight heuristics
        """
        try:
            # 1. Basic metrics
            token_count = len(query.split())
            query_lower = query.lower()
            
            # 2. Pattern-based complexity
            pattern_score = 0.3  # default
            matched_pattern = "default"
            
            for complexity_level, config in self.complexity_patterns.items():
                for pattern in config['patterns']:
                    if re.search(pattern, query_lower):
                        pattern_score = config['score']
                        matched_pattern = complexity_level
                        break
                if pattern_score != 0.3:  # Found match
                    break
            
            # 3. Length-based adjustment
            length_adjustment = min(token_count / 100, 0.3)  # Max 0.3 boost for long queries
            
            # 4. Domain complexity detection
            domain_score = self._detect_domain_complexity(query_lower)
            
            # 5. Final complexity calculation
            final_score = min(pattern_score + length_adjustment + domain_score, 1.0)
            
            # 6. Confidence calculation
            confidence = 0.8 if matched_pattern != "default" else 0.6
            
            reasoning = f"Pattern: {matched_pattern}, Tokens: {token_count}, Domain: {domain_score:.2f}"
            
            logger.debug(f"Query complexity analysis: score={final_score:.2f}, reasoning={reasoning}")
            
            return ComplexityScore(final_score, confidence, reasoning)
            
        except Exception as e:
            logger.error(f"Error analyzing query complexity: {str(e)}")
            # Fallback to moderate complexity
            return ComplexityScore(0.5, 0.3, "fallback_due_to_error")
    
    def _detect_domain_complexity(self, query_lower: str) -> float:
        """Detect domain-specific complexity indicators"""
        domain_indicators = {
            'crypto_basic': (['price', 'bitcoin', 'ethereum', 'buy', 'sell'], 0.1),
            'crypto_advanced': (['defi', 'yield', 'liquidity', 'smart contract'], 0.4),
            'crypto_expert': (['arbitrage', 'mev', 'impermanent loss', 'tokenomics'], 0.7),
            'programming': (['code', 'function', 'algorithm', 'debug', 'implement'], 0.6),
            'analysis': (['analyze', 'compare', 'evaluate', 'research', 'study'], 0.4)
        }
        
        max_score = 0
        for domain, (keywords, score) in domain_indicators.items():
            matches = sum(1 for keyword in keywords if keyword in query_lower)
            if matches > 0:
                domain_complexity = score * (matches / len(keywords))
                max_score = max(max_score, domain_complexity)
        
        return max_score
    
    def select_optimal_model(self, 
                           query: str, 
                           user_context: Dict[str, Any] = None,
                           budget_preference: str = 'balanced') -> str:
        """
        Select the optimal model based on query analysis
        """
        try:
            # Analyze query complexity
            complexity = self.analyze_query_complexity(query, user_context)
            
            # Select tier based on complexity and budget
            selected_tier = self._select_tier(complexity.score, budget_preference)
            
            # Get specific model from tier
            selected_model = self._select_model_from_tier(selected_tier, query, user_context)
            
            logger.info(f"Auto-selected model: {selected_model} (tier: {selected_tier}, "
                       f"complexity: {complexity.score:.2f}, reasoning: {complexity.reasoning})")
            
            return selected_model
            
        except Exception as e:
            logger.error(f"Error in model selection, falling back to default: {str(e)}")
            return 'openai/gpt-4o-mini'  # Safe fallback
    
    def _select_tier(self, complexity_score: float, budget_preference: str) -> str:
        """Select appropriate tier based on complexity and budget"""
        
        if budget_preference == 'strict' and complexity_score <= 0.6:
            return 'ultra_budget'
        
        if complexity_score <= 0.3:
            return 'ultra_budget'
        elif complexity_score <= 0.7:
            return 'balanced'
        else:
            # High complexity - but respect budget constraints
            if budget_preference == 'strict':
                return 'balanced'
            else:
                return 'premium'
    
    def _select_model_from_tier(self, tier: str, query: str, user_context: Dict[str, Any]) -> str:
        """Select specific model from tier based on specialization"""
        tier_config = self.model_tiers[tier]
        available_models = tier_config['models']
        
        # Simple model selection within tier
        if 'code' in query.lower() or 'implement' in query.lower():
            # Prefer Claude for coding tasks
            claude_models = [m for m in available_models if 'claude' in m]
            if claude_models:
                return claude_models[0]
        
        # Default to first model in tier
        return available_models[0]

# Global instance
auto_selector = AutoModelSelector()
```

#### **2.2 Modify Model Manager to Support Auto Detection**

**File:** `backend/core/models/__init__.py` (hoặc model manager location)

```python
# Import auto selector
from core.services.auto_model_selector import auto_selector

class ModelManager:
    """Enhanced model manager with auto selection capability"""
    
    def resolve_model_id(self, model_name: str, query: str = None, user_context: Dict[str, Any] = None) -> str:
        """
        Enhanced model resolution with auto selection support
        Maintains backward compatibility while adding auto intelligence
        """
        try:
            # Check if auto mode is requested
            if model_name == 'auto' and query:
                logger.debug(f"Auto model selection requested for query: {query[:100]}...")
                
                # Use intelligent selection
                auto_selected = auto_selector.select_optimal_model(
                    query=query,
                    user_context=user_context or {},
                    budget_preference=user_context.get('budget_preference', 'balanced')
                )
                
                logger.info(f"Auto-selected model: {auto_selected}")
                return auto_selected
            
            # Fallback to existing logic for non-auto models
            return self._resolve_standard_model(model_name)
            
        except Exception as e:
            logger.error(f"Error in model resolution: {str(e)}")
            # Safe fallback
            return 'openai/gpt-4o-mini'
    
    def _resolve_standard_model(self, model_name: str) -> str:
        """Existing model resolution logic"""
        # Keep existing implementation unchanged
        return model_name

# Update global model_manager instance
model_manager = ModelManager()
```

#### **2.3 Update LLM Service to Pass Query Context**

**File:** `backend/core/services/llm.py`

```python
# Update prepare_params function to pass query context
def prepare_params(
    messages: List[Dict[str, Any]],
    model_name: str,
    temperature: float = 0,
    max_tokens: Optional[int] = None,
    # ... existing parameters
    query_context: Optional[Dict[str, Any]] = None,  # NEW parameter
) -> Dict[str, Any]:
    from core.models import model_manager
    
    # Extract query from messages for auto selection
    query = None
    if messages and len(messages) > 0:
        last_message = messages[-1]
        if isinstance(last_message.get('content'), str):
            query = last_message['content']
        elif isinstance(last_message.get('content'), list):
            # Handle multipart content
            text_parts = [part.get('text', '') for part in last_message['content'] 
                         if part.get('type') == 'text']
            query = ' '.join(text_parts)
    
    # Enhanced model resolution with query context
    resolved_model_name = model_manager.resolve_model_id(
        model_name, 
        query=query,
        user_context=query_context
    )
    
    logger.debug(f"Model resolution: '{model_name}' -> '{resolved_model_name}' (query context: {bool(query)})")
    
    # Rest of function remains unchanged
    params = {
        "model": resolved_model_name,
        "messages": messages,
        "temperature": temperature,
        # ... existing parameters
    }
    
    # ... rest of existing logic
    return params
```

#### **2.4 Update Agent Run Processing**

**File:** `backend/core/agentpress/thread_manager.py`

```python
# Update the LLM API call to pass query context
# Around line 501 where make_llm_api_call is called

llm_response = await make_llm_api_call(
    prepared_messages,
    llm_model,
    temperature=llm_temperature,
    max_tokens=llm_max_tokens,
    tools=openapi_tool_schemas,
    tool_choice=tool_choice if config.native_tool_calling else "none",
    stream=stream,
    enable_thinking=enable_thinking,
    reasoning_effort=reasoning_effort,
    query_context={  # NEW parameter
        'thread_id': thread_id,
        'user_tier': 'free',  # TODO: Get from user context
        'budget_preference': 'balanced',  # TODO: Make configurable
        'urgent': stream  # Streaming requests are considered urgent
    }
)
```

---

## 📋 **Phase 2: Advanced Optimizations (Week 3)**

### 🔹 **Enhanced Features**

#### **3.1 Add Fallback Management**

**File:** `backend/core/services/llm.py`

```python
# Enhanced make_llm_api_call with intelligent fallbacks
async def make_llm_api_call(
    messages: List[Dict[str, Any]],
    model_name: str,
    # ... existing parameters
    query_context: Optional[Dict[str, Any]] = None,
    enable_auto_fallback: bool = True,  # NEW parameter
) -> Union[Dict[str, Any], AsyncGenerator, ModelResponse]:
    
    # Prepare parameters with auto selection
    params = prepare_params(
        messages=messages,
        model_name=model_name,
        # ... existing parameters
        query_context=query_context,
    )
    
    primary_model = params["model"]
    
    try:
        response = await provider_router.acompletion(**params)
        logger.debug(f"Successfully received API response from {primary_model}")
        return response
        
    except Exception as e:
        logger.error(f"Primary model {primary_model} failed: {str(e)}")
        
        if enable_auto_fallback and model_name == 'auto':
            return await _attempt_intelligent_fallback(messages, query_context, e)
        else:
            # Use existing fallback logic
            raise LLMError(f"API call failed: {str(e)}")

async def _attempt_intelligent_fallback(messages, query_context, original_error):
    """Intelligent fallback for auto-selected models"""
    from core.services.auto_model_selector import auto_selector
    
    # Extract query for re-analysis
    query = _extract_query_from_messages(messages)
    
    # Get fallback model with lower tier preference
    fallback_context = (query_context or {}).copy()
    fallback_context['budget_preference'] = 'strict'  # Force cheaper model
    
    fallback_model = auto_selector.select_optimal_model(
        query=query,
        user_context=fallback_context
    )
    
    logger.info(f"Attempting fallback to: {fallback_model}")
    
    # Prepare fallback parameters
    fallback_params = prepare_params(
        messages=messages,
        model_name=fallback_model,
        # Use existing parameters from context
    )
    
    try:
        response = await provider_router.acompletion(**fallback_params)
        logger.info(f"Fallback successful with {fallback_model}")
        return response
        
    except Exception as fallback_error:
        logger.error(f"Fallback also failed: {str(fallback_error)}")
        # Final fallback to cheapest known working model
        raise LLMError(f"Both primary and fallback failed: {str(original_error)}")
```

#### **3.2 Add Basic Usage Analytics**

**New File:** `backend/core/services/model_analytics.py`

```python
"""
Basic analytics for model usage and cost tracking
Minimal implementation for monitoring auto selection performance
"""

import json
from datetime import datetime, timedelta
from typing import Dict, Any, List
from core.utils.logger import logger
from core.services import redis

class ModelAnalytics:
    """Lightweight analytics for model usage"""
    
    def __init__(self):
        self.redis_prefix = "model_analytics"
    
    async def track_model_usage(self, 
                              original_model: str,
                              selected_model: str,
                              query_complexity: float,
                              cost_estimate: float,
                              success: bool):
        """Track model selection decisions"""
        try:
            usage_data = {
                'timestamp': datetime.now().isoformat(),
                'original_model': original_model,
                'selected_model': selected_model,
                'query_complexity': query_complexity,
                'cost_estimate': cost_estimate,
                'success': success,
                'was_auto_selected': original_model == 'auto'
            }
            
            # Store in Redis with TTL
            key = f"{self.redis_prefix}:usage:{datetime.now().strftime('%Y%m%d%H')}"
            await redis.lpush(key, json.dumps(usage_data))
            await redis.expire(key, 86400 * 7)  # Keep for 1 week
            
        except Exception as e:
            logger.error(f"Error tracking model usage: {str(e)}")
    
    async def get_usage_summary(self, hours: int = 24) -> Dict[str, Any]:
        """Get usage summary for specified time period"""
        try:
            cutoff_time = datetime.now() - timedelta(hours=hours)
            usage_data = []
            
            # Get data from Redis
            current_hour = datetime.now()
            for i in range(hours):
                hour_key = (current_hour - timedelta(hours=i)).strftime('%Y%m%d%H')
                key = f"{self.redis_prefix}:usage:{hour_key}"
                
                data = await redis.lrange(key, 0, -1)
                for entry in data:
                    usage_data.append(json.loads(entry))
            
            # Calculate summary statistics
            if not usage_data:
                return {'message': 'No usage data available'}
            
            auto_requests = [d for d in usage_data if d['was_auto_selected']]
            total_requests = len(usage_data)
            auto_percentage = len(auto_requests) / total_requests * 100
            
            avg_complexity = sum(d['query_complexity'] for d in auto_requests) / len(auto_requests) if auto_requests else 0
            total_cost = sum(d['cost_estimate'] for d in usage_data)
            
            model_distribution = {}
            for data in auto_requests:
                model = data['selected_model']
                model_distribution[model] = model_distribution.get(model, 0) + 1
            
            return {
                'period_hours': hours,
                'total_requests': total_requests,
                'auto_requests': len(auto_requests),
                'auto_usage_percentage': round(auto_percentage, 1),
                'average_complexity': round(avg_complexity, 2),
                'estimated_total_cost': round(total_cost, 4),
                'model_distribution': model_distribution
            }
            
        except Exception as e:
            logger.error(f"Error getting usage summary: {str(e)}")
            return {'error': str(e)}

# Global instance
model_analytics = ModelAnalytics()
```

---

## 📋 **Phase 3: Monitoring & Tuning (Week 4)**

### 🔹 **Dashboard & API Endpoints**

#### **4.1 Add Analytics API Endpoint**

**File:** `backend/api.py` hoặc trong core API router

```python
@app.get("/admin/model-analytics")
async def get_model_analytics(
    hours: int = 24,
    user_id: str = Depends(get_current_user_id)
):
    """Get model selection analytics"""
    from core.services.model_analytics import model_analytics
    
    # Add admin permission check
    if not await is_admin_user(user_id):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    summary = await model_analytics.get_usage_summary(hours)
    return summary
```

#### **4.2 Update Frontend with Auto Mode Indicator**

**File:** `frontend/components/thread/ThreadComponent.tsx`

```typescript
// Add indicator when auto mode is active
const AutoModeIndicator = ({ selectedModel, currentResponse }: Props) => {
  if (selectedModel !== 'auto') return null;
  
  return (
    <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-md text-sm">
      <BrainIcon className="w-4 h-4 text-blue-500" />
      <span className="text-blue-700">
        Auto mode selected optimal model for this query
      </span>
      {currentResponse?.model_used && (
        <Badge variant="outline" className="ml-auto">
          {currentResponse.model_used.split('/').pop()}
        </Badge>
      )}
    </div>
  );
};
```

---

## 🔧 **Integration Points & Testing**

### 🔹 **Critical Integration Points**

1. **Frontend Model Selection Hook**
   - Location: `hooks/_use-model-selection.ts`
   - Change: Add "auto" option
   - Impact: Zero breaking changes

2. **Model Resolution Service**
   - Location: `core/models/model_manager.py`  
   - Change: Enhanced `resolve_model_id` method
   - Impact: Backward compatible

3. **LLM Service Parameters**
   - Location: `core/services/llm.py`
   - Change: Add `query_context` parameter
   - Impact: Optional parameter, no breaking changes

4. **Thread Manager LLM Calls**
   - Location: `core/agentpress/thread_manager.py`
   - Change: Pass query context to LLM service
   - Impact: Enhanced functionality

### 🔹 **Testing Strategy**

```python
# Test auto model selection
async def test_auto_model_selection():
    """Test cases for auto model selection"""
    
    test_cases = [
        {
            'query': 'What is Bitcoin?',
            'expected_tier': 'ultra_budget',
            'complexity_range': (0.0, 0.3)
        },
        {
            'query': 'Write a Python function to calculate fibonacci',
            'expected_tier': 'balanced',
            'complexity_range': (0.6, 0.9)
        },
        {
            'query': 'Create a comprehensive strategy for DeFi yield farming',
            'expected_tier': 'premium',
            'complexity_range': (0.7, 1.0)
        }
    ]
    
    for case in test_cases:
        complexity = auto_selector.analyze_query_complexity(case['query'])
        selected_model = auto_selector.select_optimal_model(case['query'])
        
        assert case['complexity_range'][0] <= complexity.score <= case['complexity_range'][1]
        print(f"✅ Query: {case['query'][:50]}... -> {selected_model} (complexity: {complexity.score:.2f})")
```

---

## 📊 **Expected Results & Metrics**

### 🎯 **Success Metrics**

**Week 1-2 Goals:**
- ✅ "Auto" mode available in frontend
- ✅ Basic query complexity analysis working
- ✅ Model selection logic routing 80%+ queries correctly
- ✅ Zero breaking changes to existing functionality

**Week 3 Goals:**  
- ✅ Intelligent fallback handling edge cases
- ✅ Basic cost tracking implemented
- ✅ 50%+ cost reduction vs single premium model

**Week 4 Goals:**
- ✅ Analytics dashboard showing usage patterns
- ✅ Performance monitoring in place
- ✅ Documentation updated

### 📈 **Performance Projections**

```python
# Expected cost savings
cost_projections = {
    'baseline_gpt4o_only': '$0.10 per query',
    'with_auto_selection': {
        'simple_queries_85%': '$0.02 per query',  # 80% savings
        'moderate_queries_12%': '$0.05 per query', # 50% savings  
        'complex_queries_3%': '$0.10 per query',   # No change
        'weighted_average': '$0.027 per query',    # 73% total savings
    },
    'monthly_savings': '$1,095 per 10K queries' # vs GPT-4o only
}
```

---

## 🚀 **Deployment Strategy**

### 🔹 **Rollout Plan**

**Phase 1: Internal Testing (Days 1-3)**
```bash
# Deploy to dev environment
git checkout -b feature/auto-model-selection
# Implement changes
npm run build:frontend
python -m pytest backend/tests/test_auto_selection.py
```

**Phase 2: Beta Testing (Days 4-7)**  
```bash
# Deploy to staging with feature flag
export ENABLE_AUTO_MODEL_SELECTION=true
# Monitor analytics for 100 test queries
```

**Phase 3: Gradual Production Rollout (Days 8-14)**
```python
# Feature flag controlled rollout
rollout_percentage = 25  # Start with 25% of users
if user_id.endswith(('0', '1', '2', '3')):  # Simple hash-based selection
    enable_auto_selection = True
```

**Phase 4: Full Production (Day 15+)**
```bash
# Enable for all users
export ENABLE_AUTO_MODEL_SELECTION=true
export AUTO_MODEL_DEFAULT_MODE=true
```

### 🔹 **Monitoring & Alerts**

```python
# Key metrics to monitor
monitoring_alerts = {
    'auto_selection_error_rate': {'threshold': '5%', 'action': 'disable_auto'},
    'cost_increase_unexpected': {'threshold': '20%', 'action': 'review_logic'},
    'response_quality_drop': {'threshold': '10%', 'action': 'tune_complexity'},
    'fallback_rate': {'threshold': '15%', 'action': 'improve_primary'}
}
```

---

## 🎉 **Success Criteria**

### ✅ **Must Achieve:**
1. **Zero Breaking Changes**: Existing functionality unchanged
2. **Cost Reduction**: 50%+ savings vs single premium model
3. **Performance Maintained**: Response quality >= 90% of baseline  
4. **Reliability**: 99%+ successful responses with fallbacks
5. **User Experience**: Seamless integration, clear indicators

### 🎯 **Nice to Have:**
1. **Advanced Analytics**: Usage patterns và optimization suggestions
2. **A/B Testing**: Compare auto vs manual selection
3. **Cost Budgets**: Per-user hoặc per-project cost controls
4. **ML Enhancement**: Learning from usage patterns

---

## 📚 **Documentation Updates**

### 🔹 **User Documentation**

**File:** `docs/features/auto-model-selection.md`

```markdown
# Auto Model Selection

ChainLens now intelligently selects the optimal AI model for your queries.

## How It Works
- **Simple questions**: Fast, cost-effective models
- **Complex analysis**: Premium models for best results  
- **Automatic fallback**: Ensures reliable responses

## Benefits
- 50-70% lower costs on average
- 2-3x faster for simple queries
- Always optimal model for the task
```

### 🔹 **Developer Documentation**

**File:** `docs/development/auto-selection-architecture.md`

```markdown
# Auto Model Selection Architecture

## Core Components
1. `AutoModelSelector`: Query analysis và model selection logic
2. `ModelManager`: Enhanced resolution với auto support  
3. `ModelAnalytics`: Usage tracking và cost monitoring

## Integration Points
- Frontend: Model selection hook
- Backend: Model resolution service
- LLM Service: Query context passing
```

---

Đây là **comprehensive implementation plan** để integrate intelligent model selection vào ChainLens với **minimal disruption**, chỉ thêm "auto" mode và essential optimization logic. Plan này đảm bảo **backward compatibility** hoàn toàn while delivering significant **cost savings** và **performance improvements**. 🚀