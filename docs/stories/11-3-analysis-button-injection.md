# Story 11.3: Analysis Button Injection

Status: ready-for-dev

## Story

As a developer,  
I want inject "Analyze with Suna" buttons next to detected coins,  
So that user can easily trigger analysis.

## Acceptance Criteria

1. `injector.ts` module với button injection logic
2. Button injected next to detected coin elements
3. Button styling matches extension design (reuse Tailwind classes)
4. Button click handler sends message to background worker
5. Duplicate injection prevention (check if button already exists)
6. Button visible và clickable trên various page layouts

## Tasks / Subtasks

- [ ] Task 1: Create injector.ts module (AC: 1)
  - [ ] Create `extension/src/content-script/injector.ts`
  - [ ] Define button injection function: `injectAnalysisButton(element: HTMLElement, coinData: CoinDetection): void`
  - [ ] Export injection function
  - [ ] Add JSDoc comments

- [ ] Task 2: Implement button injection logic (AC: 2)
  - [ ] Create button element: `document.createElement('button')`
  - [ ] Set button text: "Analyze with Suna" hoặc similar
  - [ ] Position button next to detected coin element
  - [ ] Handle different element types (inline, block, etc.)
  - [ ] Test button appears correctly

- [ ] Task 3: Style button với Tailwind classes (AC: 3)
  - [ ] Import Tailwind CSS (if available) hoặc use inline styles
  - [ ] Apply button styling classes
  - [ ] Match extension design (reference frontend button component)
  - [ ] Ensure button is visible và readable
  - [ ] Test button styling on different backgrounds

- [ ] Task 4: Implement click handler (AC: 4)
  - [ ] Add click event listener to button
  - [ ] Prevent event propagation (stopPropagation)
  - [ ] Send message to background worker: `chrome.runtime.sendMessage()`
  - [ ] Message type: `{ type: 'ANALYZE_COIN', coin: coinData.name }`
  - [ ] Handle message response (optional)
  - [ ] Test message sending works

- [ ] Task 5: Implement duplicate prevention (AC: 5)
  - [ ] Check if button already exists: `element.querySelector('.suna-analyze-btn')`
  - [ ] Skip injection if button exists
  - [ ] Add unique identifier to button (data attribute)
  - [ ] Handle button removal và re-injection
  - [ ] Test duplicate prevention works

- [ ] Task 6: Test trên various layouts (AC: 6)
  - [ ] Test button on inline elements (spans, links)
  - [ ] Test button on block elements (divs, paragraphs)
  - [ ] Test button on table cells
  - [ ] Test button on list items
  - [ ] Test button positioning với different CSS layouts
  - [ ] Verify button doesn't break page layout

- [ ] Testing (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Test button injection function works
  - [ ] Test button appears next to coin elements
  - [ ] Test button styling is correct
  - [ ] Test click handler sends message
  - [ ] Test duplicate prevention works
  - [ ] Test button works trên various page layouts

## Dev Notes

### Architecture Patterns and Constraints

**Button Injection Strategy:**
- Non-intrusive: button doesn't break page layout
- Position relative to coin element
- Use CSS positioning (relative/absolute) if needed
- Handle different element types và layouts

**Button Styling:**
- Reuse Tailwind classes từ frontend if possible
- Or use inline styles với extension-specific classes
- Ensure button is visible trên various backgrounds
- Match extension design language

**Message Passing:**
- Use `chrome.runtime.sendMessage()` to send to background worker
- Message format: `{ type: 'ANALYZE_COIN', coin: string }`
- Background worker will handle analysis request
- Can add response handling if needed

**Duplicate Prevention:**
- Check for existing button before injection
- Use unique class name: `.suna-analyze-btn`
- Add data attributes for identification
- Handle re-injection scenarios

### Project Structure Notes

**Injector Module Location:**
- `extension/src/content-script/injector.ts` - Button injection logic
- Will be compiled cùng với content-script.ts
- Can be separate module hoặc part of content-script

**Button Styling:**
- Can import Tailwind classes if Tailwind is available in content script
- Or use inline styles với extension-specific CSS
- Reference frontend button component for styling

**Message Types:**
- Define message types trong shared types file hoặc injector
- Message format should match background worker expectations

### References

- [Source: docs/architecture-extension-suna.md#Implementation-Patterns] - UI Injection pattern với button creation
- [Source: docs/epics-extension.md#Epic-11] - Epic 11 goal: inject buttons next to detected coins
- [Source: docs/epics-extension.md#Story-11.3] - Story acceptance criteria và prerequisites
- [Source: docs/PRD-extension.md#Functional-Requirements] - FR002: UI injection với "Analyze" buttons
- [Source: docs/stories/11-2-content-script-injection.md#Dev-Agent-Record] - Content script runs detection
- [Source: frontend/src/components/ui/button.tsx] - Reference for button styling

### Learnings from Previous Story

**From Story 11.2 (Status: ready-for-dev)**

- **Content Script Created**: `content-script.ts` created và registered in manifest
- **Detection Running**: Content script runs coin detection on page load và DOM mutations
- **Detection Results**: Detection returns `CoinDetection[]` với element references
- **Performance**: requestIdleCallback used for non-critical detection

**Reuse:**
- Use detection results từ content script
- Element references in detection results can be used for button injection
- Content script context is where button injection happens

[Source: docs/stories/11-2-content-script-injection.md#Dev-Agent-Record]

## Dev Agent Record

### Context Reference

- [Source: docs/stories/11-3-analysis-button-injection.context.xml] - Story context XML với technical details

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2025-11-08: Story created from epics-extension.md

