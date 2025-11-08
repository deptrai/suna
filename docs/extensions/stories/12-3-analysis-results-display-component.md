# Story 12.3: Analysis Results Display Component

Status: ready-for-dev

## Story

As a user,  
I want see analysis results trong side panel,  
So that I can review coin analysis quickly.

## Acceptance Criteria

1. `coin-analysis.tsx` component created
2. Component displays: coin name, price, sentiment, risk score
3. Component uses shared UI components (Card, Button, etc.)
4. Loading state displayed while analysis in progress
5. Error state displayed nếu analysis fails
6. Results formatted clearly và readable

## Tasks / Subtasks

- [ ] Task 1: Create coin-analysis component (AC: 1)
  - [ ] Create `extension/src/sidepanel/components/coin-analysis.tsx`
  - [ ] Define component props interface
  - [ ] Create component structure
  - [ ] Export component
  - [ ] Test component renders

- [ ] Task 2: Display analysis data (AC: 2)
  - [ ] Display coin name (prominent)
  - [ ] Display current price (formatted)
  - [ ] Display sentiment (positive/negative/neutral với indicator)
  - [ ] Display risk score (numeric hoặc visual indicator)
  - [ ] Format data clearly và readable
  - [ ] Use Card component for layout

- [ ] Task 3: Use shared UI components (AC: 3)
  - [ ] Use Card component for results container
  - [ ] Use Button components for actions
  - [ ] Use other UI components as needed
  - [ ] Ensure components styled correctly
  - [ ] Test component integration

- [ ] Task 4: Implement loading state (AC: 4)
  - [ ] Create loading indicator component
  - [ ] Display loading state khi analysis in progress
  - [ ] Show loading message
  - [ ] Use spinner hoặc skeleton loader
  - [ ] Test loading state displays

- [ ] Task 5: Implement error state (AC: 5)
  - [ ] Create error display component
  - [ ] Display error message nếu analysis fails
  - [ ] Show error details (if available)
  - [ ] Provide error recovery options
  - [ ] Test error state displays

- [ ] Task 6: Format results clearly (AC: 6)
  - [ ] Use clear typography
  - [ ] Use appropriate spacing
  - [ ] Use color coding for sentiment/risk
  - [ ] Make data scannable
  - [ ] Test readability

- [ ] Testing (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Test component renders với analysis data
  - [ ] Test loading state displays
  - [ ] Test error state displays
  - [ ] Test component với shared UI components
  - [ ] Test results formatting

## Dev Notes

### Architecture Patterns and Constraints

**Component Design:**
- Display analysis results clearly
- Use shared UI components (Card, Button)
- Handle loading và error states
- Format data for readability

**Data Display:**
- Coin name: Prominent display
- Price: Formatted với currency symbol
- Sentiment: Visual indicator (color, icon)
- Risk score: Numeric hoặc visual (progress bar, badge)

**State Management:**
- Loading state: Show spinner/skeleton
- Error state: Show error message
- Success state: Show analysis results
- Use React state hoặc props

### Project Structure Notes

**Component Location:**
- `extension/src/sidepanel/components/coin-analysis.tsx`
- Can be used trong side panel layout
- Import vào main side panel component

**Data Props:**
- Component receives analysis data as props
- Or fetches data internally (Story 12.4)
- Define TypeScript interface for data

### References

- [Source: docs/epics-extension.md#Epic-12] - Epic 12 goal: display analysis results
- [Source: docs/epics-extension.md#Story-12.3] - Story acceptance criteria và prerequisites
- [Source: docs/stories/12-2-popup-layout-structure.md#Dev-Agent-Record] - Side panel layout ready
- [Source: docs/PRD-extension.md#Functional-Requirements] - FR004: Analysis results display

### Learnings from Previous Story

**From Story 12.2 (Status: ready-for-dev)**

- **Side Panel Layout Created**: Header, content, footer structure created
- **Layout Ready**: Content area ready for analysis results
- **Shared Components**: Button, Card components available
- **Design Patterns**: Layout matches main app design

**Reuse:**
- Use Card component for results container
- Use Button components for actions
- Place component trong content area của layout

[Source: docs/stories/12-2-popup-layout-structure.md#Dev-Agent-Record]

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

