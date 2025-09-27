# Story: LLM Auto Selection MVP Implementation

**Story ID**: llm-auto-selection-mvp  
**Epic**: LLM Auto Selection  
**Priority**: High  
**Status**: Ready for Development  
**Estimated Effort**: 8 hours  
**Developer**: James  

---

## 📋 **Story**

**As a** ChainLens user  
**I want** an "Auto" model option that intelligently selects between 2 models based on query complexity  
**So that** I can get optimal cost savings (65-95%) without manual model selection  

---

## ✅ **Acceptance Criteria**

### **Backend Requirements**
- [ ] Add `ModelCapability.AUTO_SELECTION` to enum
- [ ] Add `ModelProvider.CHAINLENS` to enum  
- [ ] Auto model registered in registry when `AUTO_MODEL_ENABLED=true`
- [ ] `resolve_model_id()` supports optional query parameter
- [ ] Auto selection logic routes between 2 models:
  - Simple queries → `openai-compatible/gpt-4o-mini` ($0.15/$0.60)
  - Complex queries → `openai-compatible/gpt-5-2025-08-07` ($10.0/$30.0)
- [ ] Selection overhead <5ms
- [ ] Backward compatibility maintained

### **Frontend Requirements**
- [ ] Auto model appears in model dropdown as "🤖 Auto (Smart Selection)"
- [ ] Cost savings indicator shows when auto mode selected
- [ ] No breaking changes to existing model selection

### **Integration Requirements**
- [ ] Agent runs pass query context to model resolution
- [ ] Feature flag `AUTO_MODEL_ENABLED` controls availability
- [ ] Auto model included in `/api/billing/available-models` response

---

## 🛠️ **Tasks**

### **Task 1: Add Required Enums**
- [x] Add `ModelCapability.AUTO_SELECTION = "auto_selection"` to `backend/core/ai_models/ai_models.py`
- [x] Add `ModelProvider.CHAINLENS = "chainlens"` to `backend/core/ai_models/ai_models.py`
- [x] Test enum additions work correctly

### **Task 2: Auto Model Registration**
- [x] Add auto model registration to `backend/core/ai_models/registry.py`
- [x] Conditional registration based on `AUTO_MODEL_ENABLED` environment variable
- [x] Verify auto model appears in model list when enabled

### **Task 3: Enhanced ModelManager**
- [x] Update `resolve_model_id()` method signature in `backend/core/ai_models/manager.py`
- [x] Implement `_auto_select_model()` method with 2-model logic
- [x] Add comprehensive logging for auto selection
- [x] Test backward compatibility

### **Task 4: Agent Runs Integration**
- [x] Update `backend/core/agent_runs.py` to extract query from request
- [x] Pass query context to `resolve_model_id()` method
- [x] Handle both `/agent/start` and `/agent/initiate` endpoints
- [x] Test end-to-end auto selection flow

### **Task 5: Frontend Auto Mode Indicators**
- [x] Add auto mode detection helpers to `frontend/src/hooks/use-model-selection.ts`
- [x] Add cost savings indicator to chat input component
- [x] Test auto model appears in dropdown
- [x] Verify UI indicators work correctly

---

## 🧪 **Testing**

### **Unit Tests**
- [ ] Test auto model registration
- [ ] Test auto selection logic with various query types
- [ ] Test backward compatibility of `resolve_model_id()`
- [ ] Test enum additions

### **Integration Tests**
- [ ] Test end-to-end auto selection flow
- [ ] Test feature flag functionality
- [ ] Test API response includes auto model
- [ ] Test frontend model selection

### **Performance Tests**
- [ ] Verify selection overhead <5ms
- [ ] Test with various query lengths
- [ ] Memory usage validation

---

## 📝 **Dev Notes**

### **Model Selection Logic**
```python
def _auto_select_model(self, query: str, user_context: dict = None) -> str:
    """Simplified 2-model auto selection for MVP"""
    q = query.lower()
    
    # Complex task detection
    complex_patterns = ['code', 'implement', 'create', 'analyze', 'design', 'strategy', 'build', 'develop']
    is_complex = (any(kw in q for kw in complex_patterns) and len(query.split()) > 15)
    
    if is_complex:
        return 'openai-compatible/gpt-5-2025-08-07'  # Premium for complex
    
    return 'openai-compatible/gpt-4o-mini'  # Default efficient
```

### **Environment Variables**
```bash
AUTO_MODEL_ENABLED=true  # Enable auto model feature
```

### **Expected Cost Savings**
- Simple queries: 95% cheaper than Claude Sonnet 4
- Complex queries: 33% cheaper than Claude Sonnet 4
- Average savings: 65-95% depending on query mix

---

## 🔧 **Implementation Order**

1. **Enums** (Task 1) - Foundation for everything else
2. **Registry** (Task 2) - Auto model registration
3. **ModelManager** (Task 3) - Core auto selection logic
4. **Agent Runs** (Task 4) - Integration with request flow
5. **Frontend** (Task 5) - UI indicators and display

---

## ✅ **Definition of Done**

- [ ] All tasks completed and tested
- [ ] Auto model appears in frontend dropdown
- [ ] Auto selection works end-to-end
- [ ] Cost savings achieved as expected
- [ ] No breaking changes to existing functionality
- [ ] Feature flag controls availability
- [ ] Performance requirements met (<5ms overhead)
- [ ] Code follows project standards
- [ ] All tests pass

---

## 📊 **Dev Agent Record**

### **Agent Model Used**
- Model: Claude Sonnet 4
- Reasoning: Complex implementation requiring architectural understanding

### **Debug Log References**
- TBD during implementation

### **Completion Notes**
- TBD during implementation

### **File List**
- TBD during implementation

### **Change Log**
- TBD during implementation

---

**Story ready for development! 🚀**
