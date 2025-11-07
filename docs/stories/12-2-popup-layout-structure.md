# Story 12.2: Popup Layout & Structure

Status: ready-for-dev

## Story

As a user,  
I want well-organized popup layout,  
So that I can easily view analysis results.

## Acceptance Criteria

1. Popup layout với header, content area, và footer
2. Header shows extension name/logo
3. Content area ready for analysis results display
4. Footer với action buttons (Generate Report, etc.)
5. Responsive layout works với different content sizes
6. Layout matches main app design patterns

## Tasks / Subtasks

- [ ] Task 1: Create popup layout structure (AC: 1)
  - [ ] Create layout component: `PopupLayout.tsx`
  - [ ] Define header, content, và footer sections
  - [ ] Use flexbox hoặc grid for layout
  - [ ] Ensure layout is responsive
  - [ ] Test layout structure renders correctly

- [ ] Task 2: Implement header section (AC: 2)
  - [ ] Create header component hoặc section
  - [ ] Display extension name: "Suna" hoặc "Suna Coin Analysis"
  - [ ] Add logo/icon if available
  - [ ] Style header với consistent design
  - [ ] Test header displays correctly

- [ ] Task 3: Implement content area (AC: 3)
  - [ ] Create content area section
  - [ ] Make content area scrollable if needed
  - [ ] Prepare for analysis results display
  - [ ] Style content area
  - [ ] Test content area ready for results

- [ ] Task 4: Implement footer section (AC: 4)
  - [ ] Create footer component hoặc section
  - [ ] Add "Generate Full Report" button
  - [ ] Add other action buttons if needed
  - [ ] Style footer với consistent design
  - [ ] Test footer displays correctly

- [ ] Task 5: Ensure responsive layout (AC: 5)
  - [ ] Test layout với small content
  - [ ] Test layout với large content (scrollable)
  - [ ] Test layout với different popup sizes
  - [ ] Verify layout adapts correctly
  - [ ] Test layout doesn't break

- [ ] Task 6: Match main app design patterns (AC: 6)
  - [ ] Reference frontend layout patterns
  - [ ] Use similar spacing và typography
  - [ ] Use similar color scheme
  - [ ] Match component styling
  - [ ] Test design consistency

- [ ] Testing (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Test layout structure renders correctly
  - [ ] Test header, content, footer all display
  - [ ] Test responsive layout works
  - [ ] Test layout matches main app design
  - [ ] Test layout với different content sizes

## Dev Notes

### Architecture Patterns and Constraints

**Layout Structure:**
- Header: Extension name/logo, fixed height
- Content: Scrollable area for analysis results
- Footer: Action buttons, fixed height
- Use flexbox hoặc CSS grid for layout

**Design Consistency:**
- Match frontend layout patterns
- Use similar spacing, typography, colors
- Reuse shared UI components
- Maintain consistent design language

**Responsive Design:**
- Layout should adapt to content size
- Content area should scroll if needed
- Footer should remain visible
- Header should remain visible

### Project Structure Notes

**Layout Component:**
- Create `extension/src/popup/components/PopupLayout.tsx`
- Or integrate layout vào main popup component
- Use shared UI components (Card, etc.)

**Component Organization:**
- Header component: `PopupHeader.tsx` (optional)
- Content component: `PopupContent.tsx` (optional)
- Footer component: `PopupFooter.tsx` (optional)
- Or single layout component với sections

### References

- [Source: docs/epics-extension.md#Epic-12] - Epic 12 goal: popup UI với shared components
- [Source: docs/epics-extension.md#Story-12.2] - Story acceptance criteria và prerequisites
- [Source: docs/stories/12-1-shared-ui-components-integration.md#Dev-Agent-Record] - UI components available
- [Source: frontend/src/app/(home)/layout.tsx] - Reference for layout patterns

### Learnings from Previous Story

**From Story 12.1 (Status: ready-for-dev)**

- **UI Components Available**: Button, Card, Dialog components can be imported
- **Path Aliases Working**: `@/components/ui/*` imports resolve correctly
- **Tailwind CSS**: Tailwind styles apply correctly trong popup
- **Components Tested**: Components render và work correctly

**Reuse:**
- Use Button, Card components từ Story 12.1
- Use Tailwind CSS for styling
- Follow frontend design patterns

[Source: docs/stories/12-1-shared-ui-components-integration.md#Dev-Agent-Record]

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2025-11-08: Story created from epics-extension.md

