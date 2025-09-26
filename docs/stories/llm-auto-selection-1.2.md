# Story 1.2: Auto Model Selection Response Feedback

**Epic**: LLM Auto Model Selection - Frontend Integration  
**Priority**: High  
**Story Points**: 3  
**Labels**: frontend, user-feedback, transparency  
**Created**: 2025-01-18  
**Status**: Ready for Development

## Story Description

As a **ChainLens user**,  
I want to **see which model was automatically selected** for my query  
So that **I can understand the system's decision and have transparency into the auto selection process**.

## Acceptance Criteria

### AC1: Selected Model Badge Display
**Given** I submit a query with auto mode active  
**When** I receive the response  
**Then** I should see a badge showing "Selected: {model_name}" near the response

### AC2: Model Selection Reasoning
**Given** auto mode selected a model  
**When** I hover over or click the model badge  
**Then** I should see the complexity score and reasoning for the selection

### AC3: Consistent Badge Styling
**Given** the selected model badge is shown  
**When** I view it in the response  
**Then** it should use consistent styling with other UI badges and not interfere with response readability

### AC4: Different Model Display
**Given** auto mode selects different models for different queries  
**When** I have multiple responses in the thread  
**Then** each response should show its corresponding selected model

## Technical Tasks

### Task 1.2.1: Create AutoModeIndicator Component
**File**: `frontend/src/components/thread/AutoModeIndicator.tsx` (NEW)
- [ ] Create new component for showing selected model
- [ ] Accept props: selectedModel, complexity, reasoning
- [ ] Implement Badge component with clean styling
- [ ] Add hover tooltip for detailed information
- [ ] Handle model name formatting (remove provider prefix)
- [ ] **Estimated Time**: 2 hours
- [ ] **Testing**: Component unit tests and visual tests

### Task 1.2.2: Integrate with Thread Component
**File**: `frontend/src/components/thread/ThreadComponent.tsx`
- [ ] Import AutoModeIndicator component
- [ ] Add conditional rendering for auto mode responses
- [ ] Pass response metadata to component
- [ ] Position indicator appropriately in response layout
- [ ] Ensure it doesn't interfere with existing response UI
- [ ] **Estimated Time**: 1.5 hours
- [ ] **Testing**: Integration testing with different response types

### Task 1.2.3: Backend Response Enhancement
**File**: Backend response metadata (if needed)
- [ ] Ensure backend includes selected_model in response metadata
- [ ] Include complexity_score and reasoning in response
- [ ] Add model selection timestamp
- [ ] Verify response structure for frontend consumption
- [ ] **Estimated Time**: 1 hour
- [ ] **Testing**: API response structure validation

### Task 1.2.4: Model Name Formatting
**File**: Utility functions
- [ ] Create formatModelName utility function
- [ ] Handle various model naming patterns (openai/gpt-4o → GPT-4o)
- [ ] Create getModelDisplayName helper
- [ ] Handle special cases and edge cases
- [ ] **Estimated Time**: 0.5 hours
- [ ] **Testing**: Unit tests for formatting edge cases

## Definition of Done

- [ ] All acceptance criteria met and tested
- [ ] Selected model badge appears on auto mode responses
- [ ] Badge styling is consistent with design system
- [ ] Model names are formatted appropriately for display
- [ ] Hover tooltip shows selection reasoning
- [ ] Component is reusable and well-documented
- [ ] Unit tests written and passing
- [ ] Integration tests cover different model selections
- [ ] Manual testing across different query types
- [ ] No negative impact on response loading performance

## Dependencies

- Story 1.1: Add Auto Model Selection Option (MUST be completed first)
- Backend includes model selection metadata in response

## Risk Assessment

**Risk Level**: Low  
**Key Risks**:
- Badge placement might affect response readability
- Model selection metadata might not be available from backend
- Performance impact from additional UI components

**Mitigation**:
- Design badge to be subtle but informative
- Verify backend response structure early
- Implement lazy loading for detailed tooltips

## Success Metrics

- Users can see which model was selected for their query
- Badge is visible but doesn't distract from response content
- Tooltip provides valuable context about model selection
- No performance degradation in response rendering
- User feedback indicates transparency improvement

## UI/UX Considerations

```jsx
// Example badge implementation
<div className="flex items-center justify-between">
  <div className="response-content">
    {responseContent}
  </div>
  {selectedModel === 'auto' && response.auto_selected_model && (
    <Badge variant="outline" className="ml-2 text-xs">
      Selected: {formatModelName(response.auto_selected_model)}
    </Badge>
  )}
</div>
```

## API Contract

Expected backend response structure:
```json
{
  "content": "Response text...",
  "metadata": {
    "auto_selected_model": "openai/gpt-4o-mini",
    "complexity_score": 0.2,
    "selection_reasoning": "Simple query pattern detected",
    "cost_estimate": 0.02
  }
}
```

## Notes

- This story provides transparency into auto selection decisions
- Helps users understand cost optimization in action
- Builds trust in the auto selection system
- Sets foundation for future analytics and user preferences