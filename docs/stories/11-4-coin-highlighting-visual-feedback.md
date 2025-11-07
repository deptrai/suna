# Story 11.4: Coin Highlighting & Visual Feedback

Status: ready-for-dev

## Story

As a user,  
I want detected coins highlighted trên page,  
So that I can easily see which coins can be analyzed.

## Acceptance Criteria

1. Detected coins have visual highlight (subtle border hoặc background)
2. Highlight appears khi coin is detected
3. Highlight removed khi button is clicked (optional)
4. Highlight styling không interfere với page design
5. Highlight works với dark mode pages

## Tasks / Subtasks

- [ ] Task 1: Implement highlight styling (AC: 1)
  - [ ] Create CSS classes cho coin highlight
  - [ ] Use subtle border hoặc background color
  - [ ] Ensure highlight is visible but not intrusive
  - [ ] Test highlight visibility on various backgrounds
  - [ ] Add highlight styles to content script CSS

- [ ] Task 2: Apply highlight on detection (AC: 2)
  - [ ] Add highlight class to detected coin elements
  - [ ] Apply highlight khi coin is detected
  - [ ] Store highlight state để track highlighted elements
  - [ ] Handle multiple highlights on same page
  - [ ] Test highlight appears correctly

- [ ] Task 3: Remove highlight on button click (AC: 3)
  - [ ] Add click handler to remove highlight
  - [ ] Remove highlight class khi button is clicked
  - [ ] Optional: keep highlight for better UX
  - [ ] Test highlight removal works
  - [ ] Test highlight persists if option disabled

- [ ] Task 4: Ensure non-intrusive styling (AC: 4)
  - [ ] Use subtle colors (low opacity)
  - [ ] Use thin borders instead of thick
  - [ ] Avoid changing element dimensions
  - [ ] Test highlight doesn't break page layout
  - [ ] Test highlight doesn't interfere với page interactions

- [ ] Task 5: Support dark mode (AC: 5)
  - [ ] Detect dark mode (prefers-color-scheme media query)
  - [ ] Use appropriate colors for dark mode
  - [ ] Test highlight visibility on dark backgrounds
  - [ ] Test highlight works on dark mode pages
  - [ ] Ensure contrast is sufficient

- [ ] Testing (AC: 1, 2, 3, 4, 5)
  - [ ] Test highlight appears on detected coins
  - [ ] Test highlight styling is subtle và non-intrusive
  - [ ] Test highlight removal on button click
  - [ ] Test highlight doesn't break page layout
  - [ ] Test highlight works với dark mode
  - [ ] Test highlight on various page types

## Dev Notes

### Architecture Patterns and Constraints

**Highlight Strategy:**
- Subtle visual feedback: thin border hoặc light background
- Non-intrusive: doesn't break page layout
- Optional removal: can keep highlight for better UX
- Dark mode support: adapt colors for dark backgrounds

**Styling Approach:**
- Use CSS classes injected into page
- Or use inline styles (less preferred)
- Ensure styles don't conflict với page styles
- Use CSS specificity to override if needed

**Dark Mode Detection:**
- Use `prefers-color-scheme: dark` media query
- Or detect page background color
- Adjust highlight colors accordingly
- Test on actual dark mode pages

**Performance:**
- Highlight application should be fast
- Don't cause layout reflows
- Use CSS transforms if possible
- Limit number of highlighted elements

### Project Structure Notes

**CSS Location:**
- Can inject CSS via content script
- Or include CSS in content script bundle
- Use unique class names to avoid conflicts
- Consider using Shadow DOM if needed (advanced)

**Highlight Classes:**
- Use unique class name: `.suna-coin-highlight`
- Apply to detected coin elements
- Can combine với button injection

**State Management:**
- Track highlighted elements
- Store highlight state
- Handle highlight removal

### References

- [Source: docs/architecture-extension-suna.md#Implementation-Patterns] - Visual feedback patterns
- [Source: docs/epics-extension.md#Epic-11] - Epic 11 goal: visual feedback for detected coins
- [Source: docs/epics-extension.md#Story-11.4] - Story acceptance criteria và prerequisites
- [Source: docs/PRD-extension.md#Functional-Requirements] - FR003: Visual feedback for detected coins
- [Source: docs/stories/11-3-analysis-button-injection.md#Dev-Agent-Record] - Button injection implemented

### Learnings from Previous Story

**From Story 11.3 (Status: ready-for-dev)**

- **Button Injection**: `injector.ts` module created với button injection logic
- **Button Styling**: Button styled với Tailwind classes hoặc inline styles
- **Message Passing**: Button click sends message to background worker
- **Duplicate Prevention**: Button injection prevents duplicates

**Reuse:**
- Apply highlight to same elements that get buttons
- Can combine highlight với button injection
- Use same element references from detection

[Source: docs/stories/11-3-analysis-button-injection.md#Dev-Agent-Record]

## Dev Agent Record

### Context Reference

- [Source: docs/stories/11-4-coin-highlighting-visual-feedback.context.xml] - Story context XML với technical details

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2025-11-08: Story created from epics-extension.md

