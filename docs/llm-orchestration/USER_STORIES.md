# User Stories - LLM Auto Selection Feature

**Project**: ChainLens Intelligent Model Selection  
**Version**: Architecture-Compliant v3.0  
**Created**: September 27, 2025  
**Story Manager**: Bob  
**Status**: Ready for Development  

---

## 🎯 **Epic Overview**

**Epic**: Intelligent Model Auto-Selection for Cost Optimization  
**Goal**: Achieve 85-95% cost reduction through intelligent model routing while maintaining response quality  
**Business Value**: $1,095+ monthly savings per 10K queries  
**Timeline**: 16 hours (4 days)  

---

## 📋 **User Stories**

### **Story 1: Backend Auto Model Registration**
**As a** system administrator  
**I want** the auto model to be registered in the model registry  
**So that** users can select "Auto (Smart Selection)" from the model dropdown  

#### **Acceptance Criteria**
- [ ] Auto model appears in `/api/models/available` response
- [ ] Model has ID `"auto"` with display name `"🤖 Auto (Smart Selection)"`
- [ ] Model is marked as virtual with `metadata: {"virtual": true, "auto_selection": true}`
- [ ] Model supports both free and paid tiers
- [ ] Model has highest priority (1000) to appear at top of list
- [ ] Feature can be enabled/disabled via `AUTO_MODEL_ENABLED` environment variable

#### **Technical Implementation**
```python
# File: backend/core/ai_models/registry.py
def register_auto_model(self):
    auto_model = Model(
        id="auto",
        name="🤖 Auto (Smart Selection)",
        provider=ModelProvider.CHAINLENS,
        aliases=["smart", "intelligent"],
        context_window=128_000,
        capabilities=[ModelCapability.CHAT, ModelCapability.AUTO_SELECTION],
        pricing=None,  # Dynamic pricing
        enabled=True,
        tier_availability=["free", "paid"],
        metadata={"virtual": True, "auto_selection": True},
        priority=1000,
        recommended=True
    )
    self._models["auto"] = auto_model
```

#### **Definition of Done**
- Auto model appears in frontend dropdown
- API endpoint returns auto model when enabled
- Model registry tests pass
- Feature flag works correctly

---

### **Story 2: Enhanced Model Manager with Auto Selection Logic**
**As a** developer  
**I want** the ModelManager to support auto model selection  
**So that** the system can automatically choose the most cost-effective model based on query analysis  

#### **Acceptance Criteria**
- [ ] `resolve_model_id()` method supports optional `query` and `user_context` parameters
- [ ] Method maintains backward compatibility with existing single-parameter calls
- [ ] Auto selection logic routes simple queries to `openai-compatible/gpt-4o-mini`
- [ ] Complex queries route to `openai-compatible/gpt-5-2025-08-07`
- [ ] Selection overhead is <5ms
- [ ] All selected models exist in the registry

#### **Technical Implementation**
```python
# File: backend/core/ai_models/manager.py
def resolve_model_id(self, model_id: str, query: str = None, user_context: dict = None) -> str:
    # Auto selection logic
    if model_id == "auto" and query and os.getenv('AUTO_MODEL_ENABLED', 'false') == 'true':
        return self._auto_select_model(query, user_context)
    
    # Existing logic unchanged
    resolved = self.registry.resolve_model_id(model_id)
    return resolved if resolved else model_id

def _auto_select_model(self, query: str, user_context: dict = None) -> str:
    """Simplified 2-model auto selection for MVP"""
    q = query.lower()

    # Complex task detection
    complex_patterns = ['code', 'implement', 'create', 'analyze', 'design', 'strategy', 'build', 'develop']
    is_complex = (any(kw in q for kw in complex_patterns) and len(query.split()) > 15)

    if is_complex:
        # Use premium model for complex tasks
        return 'openai-compatible/gpt-5-2025-08-07'

    # Default to efficient model for all other queries
    return 'openai-compatible/gpt-4o-mini'
```

#### **Definition of Done**
- Unit tests pass for all selection scenarios
- Backward compatibility maintained
- Performance benchmarks meet <5ms requirement
- Integration tests with actual models pass

---

### **Story 3: Agent Runs Integration with Query Context**
**As a** user  
**I want** my chat queries to automatically use the most cost-effective model  
**So that** I get optimal cost savings without manual model selection  

#### **Acceptance Criteria**
- [ ] Agent runs extract query text from request body
- [ ] Query context is passed to `resolve_model_id()` method
- [ ] User tier information is included in context
- [ ] Auto selection works for both streaming and non-streaming requests
- [ ] Existing functionality remains unchanged for non-auto models
- [ ] Error handling gracefully falls back to original model if auto selection fails

#### **Technical Implementation**
```python
# File: backend/core/agent_runs.py (around line 68)
# Extract query from request body
query_text = None
if hasattr(body, 'messages') and body.messages:
    last_message = body.messages[-1]
    if isinstance(last_message.get('content'), str):
        query_text = last_message['content']

# Enhanced model resolution with query context
resolved_model = model_manager.resolve_model_id(
    model_name, 
    query=query_text,
    user_context={'user_id': 'current_user', 'tier': user_tier}
)
```

#### **Definition of Done**
- Auto selection works in chat interface
- Query context is properly extracted
- User tier detection works correctly
- Error scenarios are handled gracefully

---

### **Story 4: Frontend Auto Mode Indicators**
**As a** user  
**I want** to see when auto mode is active and how much I'm saving  
**So that** I understand the cost benefits of using auto selection  

#### **Acceptance Criteria**
- [ ] Auto model appears in model selection dropdown
- [ ] UI shows "🤖 Auto (Smart Selection)" as option
- [ ] When auto mode is selected, cost savings indicator is displayed
- [ ] Indicator shows "75% rẻ hơn trung bình" or similar message
- [ ] Auto mode icon (Brain) is displayed in chat input
- [ ] Existing model selection functionality remains unchanged

#### **Technical Implementation**
```typescript
// File: frontend/src/hooks/use-model-selection.ts
export const isAutoMode = (modelId: string): boolean => {
    return modelId === 'auto';
};

export const getCostSavingsText = (modelId: string): string => {
    if (modelId === 'auto') {
        return '75% rẻ hơn trung bình';
    }
    return '';
};

// File: frontend/src/components/chat/chat-input.tsx
{isAutoMode(selectedModel) && (
    <div className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
        <Brain className="w-3 h-3" />
        <span>AI chọn model tối ưu • {getCostSavingsText(selectedModel)}</span>
    </div>
)}
```

#### **Definition of Done**
- Auto model appears in dropdown
- Cost savings indicator displays correctly
- UI components render properly
- No regression in existing model selection

---

### **Story 5: Feature Flag Deployment and Testing**
**As a** system administrator  
**I want** to deploy auto selection with feature flags  
**So that** I can control rollout and monitor performance safely  

#### **Acceptance Criteria**
- [ ] `AUTO_MODEL_ENABLED` environment variable controls feature availability
- [ ] Feature can be enabled/disabled without code deployment
- [ ] Gradual rollout strategy is implemented (25% → 100%)
- [ ] Monitoring tracks auto selection usage and performance
- [ ] Rollback capability is available if issues occur
- [ ] Integration tests validate all scenarios

#### **Technical Implementation**
```python
# Environment variable check
if os.getenv('AUTO_MODEL_ENABLED', 'false') == 'true':
    # Auto selection enabled
    pass

# Gradual rollout logic (optional)
rollout_percentage = int(os.getenv('AUTO_ROLLOUT_PERCENTAGE', '100'))
user_hash = hash(user_id) % 100
if user_hash < rollout_percentage:
    # User is in rollout group
    pass
```

#### **Definition of Done**
- Feature flag controls work correctly
- Gradual rollout mechanism functions
- Monitoring captures key metrics
- Rollback procedures are tested
- Production deployment is successful

---

## 🎯 **Success Metrics**

### **Technical Metrics**
- **Response Time**: <5ms auto selection overhead
- **Accuracy**: 95%+ correct model selection
- **Availability**: 99.9% uptime for auto selection
- **Error Rate**: <0.1% auto selection failures

### **Business Metrics**
- **Cost Reduction**: 85-95% average savings
- **User Adoption**: >50% users try auto mode
- **Query Volume**: Maintain current throughput
- **User Satisfaction**: No decrease in response quality ratings

### **Performance Benchmarks**
- **Simple/Default Queries**: `openai-compatible/gpt-4o-mini` ($0.15/$0.60) - 95% cheaper
- **Complex Queries**: `openai-compatible/gpt-5-2025-08-07` ($10.0/$30.0) - 33% cheaper

---

## 🚀 **Implementation Timeline**

| Day | Story | Hours | Deliverable |
|-----|-------|-------|-------------|
| **Day 1** | Story 1 + 2 | 8h | Backend auto selection logic |
| **Day 2** | Story 3 | 4h | Agent runs integration |
| **Day 3** | Story 4 | 4h | Frontend indicators |
| **Day 4** | Story 5 | 4h | Testing and deployment |

**Total**: 16 hours over 4 days

---

## 🔧 **Dependencies**

### **External Dependencies**
- OpenAI-compatible integration architecture (✅ Available)
- Model registry system (✅ Available)
- Environment variable configuration (✅ Available)
- Frontend model selection hooks (✅ Available)

### **Internal Dependencies**
- None - all stories can be implemented independently

---

## 🧪 **Testing Strategy**

### **Unit Tests**
- Auto model registration
- Model selection logic
- Query pattern matching
- User tier detection

### **Integration Tests**
- End-to-end auto selection flow
- API response validation
- Frontend-backend integration
- Error handling scenarios

### **Performance Tests**
- Selection overhead benchmarking
- Load testing with auto selection
- Memory usage monitoring
- Response time validation

---

**Stories are ready for development team assignment and sprint planning!** 🎯
