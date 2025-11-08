# Story 12.2: Side Panel Layout & Structure

Status: ready-for-dev

## Story

As a user,  
I want well-organized side panel layout (mở bên phải trình duyệt),  
So that I can easily view analysis results với more space và persistent view.

## Acceptance Criteria

1. Side panel layout với header, content area, và footer (full height, resizable)
2. Header shows extension name/logo với close button
3. Content area ready for analysis results display (scrollable, full height)
4. Footer với action buttons (Generate Report, etc.)
5. Responsive layout works với different panel widths (400-600px resizable)
6. Layout matches main app design patterns
7. Side panel opens when clicking extension icon (chrome.sidePanel API)
8. Side panel persists (doesn't close when clicking outside)

## Tasks / Subtasks

- [ ] Task 1: Create side panel layout structure (AC: 1)
  - [ ] Create layout component: `SidePanelLayout.tsx`
  - [ ] Define header, content, và footer sections (full height)
  - [ ] Use flexbox hoặc grid for layout (100vh height)
  - [ ] Ensure layout is responsive to panel width (400-600px)
  - [ ] Test layout structure renders correctly in side panel

- [ ] Task 2: Implement header section (AC: 2)
  - [ ] Create header component hoặc section
  - [ ] Display extension name: "Suna" hoặc "Suna Coin Analysis"
  - [ ] Add logo/icon if available
  - [ ] Add close button (X) to close side panel
  - [ ] Style header với consistent design (fixed height)
  - [ ] Test header displays correctly

- [ ] Task 3: Implement content area (AC: 3)
  - [ ] Create content area section (flex: 1, full height)
  - [ ] Make content area scrollable (overflow-y: auto)
  - [ ] Prepare for analysis results display
  - [ ] Style content area (full height, scrollable)
  - [ ] Test content area ready for results với long content

- [ ] Task 4: Implement footer section (AC: 4)
  - [ ] Create footer component hoặc section
  - [ ] Add "Generate Full Report" button
  - [ ] Add other action buttons if needed
  - [ ] Style footer với consistent design
  - [ ] Test footer displays correctly

- [ ] Task 5: Ensure responsive layout (AC: 5)
  - [ ] Test layout với small content
  - [ ] Test layout với large content (scrollable)
  - [ ] Test layout với different side panel widths (400px, 500px, 600px)
  - [ ] Verify layout adapts correctly to panel width
  - [ ] Test layout doesn't break at different widths

- [ ] Task 6: Match main app design patterns (AC: 6)
  - [ ] Reference frontend layout patterns
  - [ ] Use similar spacing và typography
  - [ ] Use similar color scheme
  - [ ] Match component styling
  - [ ] Test design consistency

- [ ] Task 7: Setup side panel in manifest (AC: 7)
  - [ ] Add `"side_panel"` permission to manifest.json
  - [ ] Add `side_panel.default_path` configuration
  - [ ] Update background worker to handle side panel opening
  - [ ] Test side panel opens when clicking extension icon

- [ ] Task 8: Ensure side panel persistence (AC: 8)
  - [ ] Verify side panel doesn't close when clicking outside
  - [ ] Test side panel stays open during navigation
  - [ ] Test close button works correctly
  - [ ] Test side panel state persistence

- [ ] Testing (AC: 1, 2, 3, 4, 5, 6, 7, 8)
  - [ ] Test side panel layout structure renders correctly
  - [ ] Test header, content, footer all display
  - [ ] Test responsive layout works với different panel widths
  - [ ] Test layout matches main app design
  - [ ] Test layout với different content sizes (scrollable)
  - [ ] Test side panel opens when clicking extension icon
  - [ ] Test side panel persists (doesn't close on click outside)
  - [ ] Test close button works correctly

## Dev Notes

### Architecture Patterns and Constraints

**Layout Structure:**
- Header: Extension name/logo, close button, fixed height
- Content: Scrollable area for analysis results (flex: 1, full height)
- Footer: Action buttons, fixed height
- Use flexbox hoặc CSS grid for layout (100vh height)
- Side panel width: 400-600px (user resizable)

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
- Create `extension/src/sidepanel/components/SidePanelLayout.tsx`
- Or integrate layout vào main sidepanel component
- Use shared UI components (Card, etc.)

**Component Organization:**
- Header component: `SidePanelHeader.tsx` (optional)
- Content component: `SidePanelContent.tsx` (optional)
- Footer component: `SidePanelFooter.tsx` (optional)
- Or single layout component với sections

**Side Panel Files:**
- `sidepanel.html` - HTML entry point
- `sidepanel.tsx` - React entry point
- `sidepanel.css` - Side panel specific styles (full height)

### References

- [Source: docs/epics-extension.md#Epic-12] - Epic 12 goal: side panel UI với shared components
- [Source: docs/epics-extension.md#Story-12.2] - Story acceptance criteria và prerequisites
- [Source: docs/stories/12-1-shared-ui-components-integration.md#Dev-Agent-Record] - UI components available
- [Source: docs/extensions/reviews-analysis/extension-popup-to-sidepanel-analysis.md] - Side panel migration analysis
- [Source: frontend/src/components/thread/tool-call-side-panel.tsx] - Reference for side panel layout patterns

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
- 2025-01-15: Updated from popup to side panel layout (per user request)

